import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import { sfx, unlockAudio } from '../game/audio';

export type Phase = 'menu' | 'playing' | 'paused' | 'dying' | 'gameover';
export type DirName = 'up' | 'down' | 'left' | 'right';

export interface HudData {
  score: number;
  best: number;
  length: number;
  level: number;
  combo: number;
  comboFrac: number;
  dashFrac: number;
  dashReady: boolean;
  dashing: boolean;
  orbs: number;
}

export interface GameStats {
  score: number;
  length: number;
  level: number;
  orbs: number;
}

export interface GameHandle {
  startGame: () => void;
  togglePause: () => void;
  dash: () => void;
  setDirection: (d: DirName) => void;
}

interface Props {
  phase: Phase;
  best: number;
  onHud: (h: HudData) => void;
  onPhaseChange: (p: Phase) => void;
  onGameOver: (s: GameStats) => void;
}

const COLS = 24;
const ROWS = 24;
const COMBO_WINDOW = 4000;
const DASH_DURATION = 550;
const DASH_COOLDOWN = 2200;
const GOLDEN_EVERY_MIN = 9000;
const GOLDEN_EVERY_MAX = 14000;
const GOLDEN_LIFE = 6000;

type Vec = { x: number; y: number };

interface Particle {
  x: number; y: number; vx: number; vy: number;
  life: number; maxLife: number; size: number; color: string; drag: number; grav: number;
}
interface Floater { x: number; y: number; vy: number; life: number; maxLife: number; text: string; color: string; size: number; }
interface Ghost { pts: Vec[]; life: number; maxLife: number; }

const DIRS: Record<DirName, Vec> = {
  up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 },
};

function hexRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function lerpColor(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexRgb(a); const [br, bg, bb] = hexRgb(b);
  const r = Math.round(ar + (br - ar) * t), g = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}
function snakeColor(t: number): string {
  // cyan -> violet -> pink
  if (t < 0.5) return lerpColor('#22d3ee', '#a78bfa', t * 2);
  return lerpColor('#a78bfa', '#f472b6', (t - 0.5) * 2);
}
const rand = (a: number, b: number) => a + Math.random() * (b - a);

const GameCanvas = forwardRef<GameHandle, Props>(function GameCanvas({ phase, best, onHud, onPhaseChange, onGameOver }, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const phaseRef = useRef<Phase>(phase);
  const bestRef = useRef(best);
  const onHudRef = useRef(onHud);
  const onPhaseChangeRef = useRef(onPhaseChange);
  const onGameOverRef = useRef(onGameOver);
  onHudRef.current = onHud;
  onPhaseChangeRef.current = onPhaseChange;
  onGameOverRef.current = onGameOver;
  bestRef.current = best;

  useEffect(() => {
    phaseRef.current = phase;
    if (phase === 'menu') resetGame(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  const g = useRef({
    snake: [] as Vec[],
    prev: [] as Vec[],
    dir: { x: 1, y: 0 } as Vec,
    queue: [] as Vec[],
    food: { x: 16, y: 12 } as Vec,
    golden: null as Vec | null,
    goldenTimer: 0,
    goldenSpawnIn: rand(GOLDEN_EVERY_MIN, GOLDEN_EVERY_MAX),
    particles: [] as Particle[],
    floaters: [] as Floater[],
    ghosts: [] as Ghost[],
    score: 0,
    combo: 0,
    comboTimer: 0,
    level: 1,
    orbs: 0,
    acc: 0,
    dashTime: 0,
    dashCd: 0,
    ghostTimer: 0,
    trauma: 0,
    flashA: 0,
    flashColor: '255,255,255',
    eatPulse: 0,
    deathTimer: 0,
    snakeVisible: true,
    attract: true,
    hudTimer: 0,
    time: 0,
    size: { w: 600, h: 600 },
  });

  function setPhase(p: Phase) {
    phaseRef.current = p;
    onPhaseChangeRef.current(p);
  }

  function cellSize() {
    const { w, h } = g.current.size;
    return Math.min(w, h) / COLS;
  }

  function emptyCell(): Vec {
    const s = g.current;
    for (let tries = 0; tries < 200; tries++) {
      const c = { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
      if (s.snake.some((p) => p.x === c.x && p.y === c.y)) continue;
      if (s.food.x === c.x && s.food.y === c.y) continue;
      if (s.golden && s.golden.x === c.x && s.golden.y === c.y) continue;
      return c;
    }
    return { x: 0, y: 0 };
  }

  function burst(gx: number, gy: number, color: string, count: number, speed: number, life: number, size: number) {
    const s = g.current;
    const cell = cellSize();
    const cx = gx * cell + cell / 2, cy = gy * cell + cell / 2;
    for (let i = 0; i < count; i++) {
      if (s.particles.length > 320) s.particles.shift();
      const a = Math.random() * Math.PI * 2;
      const sp = rand(speed * 0.3, speed);
      s.particles.push({
        x: cx, y: cy,
        vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
        life: rand(life * 0.5, life), maxLife: life,
        size: rand(size * 0.5, size), color, drag: 2.2, grav: 0,
      });
    }
  }

  function floater(gx: number, gy: number, text: string, color: string, size = 15) {
    const cell = cellSize();
    g.current.floaters.push({
      x: gx * cell + cell / 2, y: gy * cell,
      vy: -46, life: 950, maxLife: 950, text, color, size,
    });
  }

  function addTrauma(n: number) { g.current.trauma = Math.min(1, g.current.trauma + n); }

  function resetGame(attract: boolean) {
    const s = g.current;
    const cy = Math.floor(ROWS / 2);
    s.snake = [
      { x: 6, y: cy }, { x: 5, y: cy }, { x: 4, y: cy }, { x: 3, y: cy },
    ];
    s.prev = s.snake.map((p) => ({ ...p }));
    s.dir = { x: 1, y: 0 };
    s.queue = [];
    s.food = { x: 15, y: cy };
    s.golden = null;
    s.goldenTimer = 0;
    s.goldenSpawnIn = rand(GOLDEN_EVERY_MIN, GOLDEN_EVERY_MAX);
    s.particles = [];
    s.floaters = [];
    s.ghosts = [];
    s.score = 0; s.combo = 0; s.comboTimer = 0;
    s.level = 1; s.orbs = 0;
    s.acc = 0; s.dashTime = 0; s.dashCd = 0;
    s.trauma = 0; s.flashA = 0; s.eatPulse = 0;
    s.deathTimer = 0; s.snakeVisible = true;
    s.attract = attract;
    pushHud();
  }

  function pushHud() {
    const s = g.current;
    onHudRef.current({
      score: s.score,
      best: Math.max(bestRef.current, s.score),
      length: s.snake.length,
      level: s.level,
      combo: s.combo,
      comboFrac: s.combo > 0 ? Math.max(0, s.comboTimer / COMBO_WINDOW) : 0,
      dashFrac: s.dashTime > 0 ? 1 : Math.max(0, 1 - s.dashCd / DASH_COOLDOWN),
      dashReady: s.dashCd <= 0 && s.dashTime <= 0,
      dashing: s.dashTime > 0,
      orbs: s.orbs,
    });
  }

  function tickInterval() {
    const s = g.current;
    if (s.attract) return 150;
    let base = 148 - (s.level - 1) * 9 - s.orbs * 0.35;
    base = Math.max(62, base);
    if (s.dashTime > 0) base *= 0.42;
    return base;
  }

  function queueDir(d: Vec) {
    const s = g.current;
    const last = s.queue.length ? s.queue[s.queue.length - 1] : s.dir;
    if (d.x === -last.x && d.y === -last.y) return;
    if (d.x === last.x && d.y === last.y) return;
    if (s.queue.length < 3) s.queue.push({ ...d });
  }

  function aiChoose() {
    const s = g.current;
    const head = s.snake[0];
    const opts = [DIRS.up, DIRS.down, DIRS.left, DIRS.right].filter(
      (d) => !(d.x === -s.dir.x && d.y === -s.dir.y),
    );
    let bestD = s.dir, bestScore = -Infinity;
    for (const d of opts) {
      const nx = head.x + d.x, ny = head.y + d.y;
      let sc = -Math.abs(nx - s.food.x) - Math.abs(ny - s.food.y) + rand(0, 2.5);
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) sc -= 100;
      if (s.snake.some((p) => p.x === nx && p.y === ny)) sc -= 100;
      if (sc > bestScore) { bestScore = sc; bestD = d; }
    }
    queueDir(bestD);
  }

  function die() {
    const s = g.current;
    if (phaseRef.current === 'dying' || phaseRef.current === 'gameover') return;
    setPhase('dying');
    s.deathTimer = 0;
    s.snakeVisible = false;
    addTrauma(1);
    s.flashA = 0.55; s.flashColor = '244,63,94';
    sfx.death();
    const head = s.snake[0] || { x: 0, y: 0 };
    burst(head.x, head.y, '#22d3ee', 34, 260, 900, 5);
    burst(head.x, head.y, '#f472b6', 22, 200, 800, 4);
    burst(head.x, head.y, '#ffffff', 10, 320, 500, 3);
    s.snake.forEach((p, i) => {
      if (i % 2 === 0) burst(p.x, p.y, snakeColor(i / Math.max(1, s.snake.length - 1)), 5, 150, 700, 3.5);
    });
  }

  function eatFood(isGolden: boolean) {
    const s = g.current;
    const head = s.snake[0];
    s.orbs++;
    s.combo = Math.min(s.combo + 1, 99);
    s.comboTimer = COMBO_WINDOW;
    const mult = Math.min(s.combo, 8);
    const pts = isGolden ? 100 + 20 * mult : 10 * mult;
    s.score += pts;
    s.eatPulse = 1;
    addTrauma(isGolden ? 0.35 : 0.12 + mult * 0.02);
    if (isGolden) {
      sfx.golden();
      burst(head.x, head.y, '#fbbf24', 30, 240, 900, 5);
      burst(head.x, head.y, '#fff7ed', 12, 180, 700, 3);
      floater(head.x, head.y, `+${pts} GOLD!`, '#fbbf24', 19);
      s.flashA = Math.max(s.flashA, 0.18); s.flashColor = '251,191,36';
      s.golden = null;
      s.goldenSpawnIn = rand(GOLDEN_EVERY_MIN, GOLDEN_EVERY_MAX);
    } else {
      sfx.eat(s.combo);
      burst(head.x, head.y, '#fb7185', 14 + mult * 2, 190, 650, 4);
      burst(head.x, head.y, '#22d3ee', 6, 140, 500, 3);
      floater(head.x, head.y, `+${pts}`, mult >= 3 ? '#fbbf24' : '#e2e8f0', mult >= 3 ? 17 : 14);
      if (mult >= 3) floater(head.x, head.y - 1, `COMBO x${mult}`, '#22d3ee', 12);
      s.food = emptyCell();
    }
    const newLevel = 1 + Math.floor(s.orbs / 5);
    if (newLevel > s.level) {
      s.level = newLevel;
      sfx.levelUp();
      s.flashA = Math.max(s.flashA, 0.22); s.flashColor = '167,139,250';
      const mid = Math.floor(COLS / 2);
      floater(mid, Math.floor(ROWS / 2) - 2, `LEVEL ${s.level}`, '#a78bfa', 24);
      floater(mid, Math.floor(ROWS / 2) - 1, 'SPEED UP!', '#e2e8f0', 13);
      burst(head.x, head.y, '#a78bfa', 26, 260, 800, 4);
    }
    pushHud();
  }

  function tick() {
    const s = g.current;
    if (s.attract) aiChoose();
    if (s.queue.length) s.dir = s.queue.shift()!;
    s.prev = s.snake.map((p) => ({ ...p }));
    const head = { x: s.snake[0].x + s.dir.x, y: s.snake[0].y + s.dir.y };

    // Walls
    if (head.x < 0 || head.y < 0 || head.x >= COLS || head.y >= ROWS) {
      if (!s.attract) { die(); return; }
      // attract: turn around
      s.dir = { x: -s.dir.x, y: -s.dir.y };
      s.queue = [];
      return;
    }

    const eating = head.x === s.food.x && head.y === s.food.y;
    const eatingGolden = !!s.golden && head.x === s.golden.x && head.y === s.golden.y;

    // Self collision (tail cell frees up unless growing)
    const bodyToCheck = eating || eatingGolden ? s.snake : s.snake.slice(0, -1);
    const hitSelf = bodyToCheck.some((p) => p.x === head.x && p.y === head.y);
    if (hitSelf && s.dashTime <= 0) {
      if (!s.attract) { die(); return; }
      s.dir = { x: -s.dir.x, y: -s.dir.y };
      s.queue = [];
      return;
    }

    s.snake.unshift(head);
    if (eating || eatingGolden) {
      if (!s.attract) eatFood(eatingGolden);
      else { s.food = emptyCell(); }
    } else {
      s.snake.pop();
    }
  }

  function doDash() {
    const s = g.current;
    if (phaseRef.current !== 'playing') return;
    if (s.dashCd > 0 || s.dashTime > 0) return;
    s.dashTime = DASH_DURATION;
    s.dashCd = DASH_COOLDOWN;
    sfx.dash();
    addTrauma(0.22);
    const head = s.snake[0];
    burst(head.x, head.y, '#22d3ee', 10, 160, 450, 3.5);
    pushHud();
  }

  function startGame() {
    unlockAudio();
    resetGame(false);
    setPhase('playing');
    sfx.click();
  }

  function togglePause() {
    const p = phaseRef.current;
    if (p === 'playing') { setPhase('paused'); sfx.pause(); }
    else if (p === 'paused') { setPhase('playing'); sfx.click(); }
  }

  useImperativeHandle(ref, () => ({
    startGame,
    togglePause,
    dash: doDash,
    setDirection: (d: DirName) => { if (phaseRef.current === 'playing') queueDir(DIRS[d]); },
  }));

  /* ---------- main loop + input ---------- */
  useEffect(() => {
    const canvas = canvasRef.current!;
    const wrap = wrapRef.current!;
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    let last = performance.now();
    let disposed = false;

    resetGame(true);

    const resize = () => {
      const rect = wrap.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const w = Math.max(280, rect.width), h = Math.max(280, rect.height);
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      g.current.size = { w, h };
      (canvas as unknown as { _dpr: number })._dpr = dpr;
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(wrap);

    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const k = e.key;
      const lower = k.toLowerCase();
      const gameKeys = ['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '];
      if (gameKeys.includes(lower)) e.preventDefault();

      const p = phaseRef.current;
      if (lower === 'p' || k === 'Escape') { if (p === 'playing' || p === 'paused') togglePause(); return; }
      if (lower === 'r') { if (p !== 'menu') startGame(); return; }
      if (k === 'Enter') { if (p === 'menu' || p === 'gameover') startGame(); return; }

      if (p === 'menu' || p === 'gameover') {
        if (k === ' ' && !e.repeat) startGame();
        return;
      }
      if (p !== 'playing') return;

      if (k === 'ArrowUp' || lower === 'w') queueDir(DIRS.up);
      else if (k === 'ArrowDown' || lower === 's') queueDir(DIRS.down);
      else if (k === 'ArrowLeft' || lower === 'a') queueDir(DIRS.left);
      else if (k === 'ArrowRight' || lower === 'd') queueDir(DIRS.right);
      else if ((k === ' ' || lower === 'shift') && !e.repeat) doDash();
    };
    window.addEventListener('keydown', onKey);

    // Touch: swipe to turn, tap to dash
    let tStartX = 0, tStartY = 0, tStartT = 0, tMoved = false;
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      tStartX = t.clientX; tStartY = t.clientY; tStartT = performance.now(); tMoved = false;
    };
    const onTouchMove = (e: TouchEvent) => {
      if (phaseRef.current !== 'playing') return;
      e.preventDefault();
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      const dx = t.clientX - tStartX, dy = t.clientY - tStartY;
      if (Math.abs(dx) < 22 && Math.abs(dy) < 22) return;
      tMoved = true;
      if (Math.abs(dx) > Math.abs(dy)) queueDir(dx > 0 ? DIRS.right : DIRS.left);
      else queueDir(dy > 0 ? DIRS.down : DIRS.up);
      tStartX = t.clientX; tStartY = t.clientY;
    };
    const onTouchEnd = (e: TouchEvent) => {
      const dt = performance.now() - tStartT;
      if (!tMoved && dt < 260 && phaseRef.current === 'playing') doDash();
      void e;
    };
    canvas.addEventListener('touchstart', onTouchStart, { passive: true });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd, { passive: true });

    const loop = (now: number) => {
      if (disposed) return;
      raf = requestAnimationFrame(loop);
      const s = g.current;
      const rawDt = Math.min(50, now - last);
      last = now;
      const p = phaseRef.current;
      const dpr = (canvas as unknown as { _dpr?: number })._dpr || 1;
      const { w, h } = s.size;
      const cell = cellSize();
      const ox = (w - cell * COLS) / 2;
      const oy = (h - cell * ROWS) / 2;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      // --- update ---
      if (p === 'playing' || p === 'menu') {
        s.time += rawDt;
        s.acc += rawDt;
        const iv = tickInterval();
        let guard = 0;
        while (s.acc >= iv && guard++ < 5) {
          s.acc -= iv;
          tick();
          if (phaseRef.current === 'dying') break;
        }
        // combo decay
        if (!s.attract && s.combo > 0) {
          s.comboTimer -= rawDt;
          if (s.comboTimer <= 0) { s.combo = 0; pushHud(); }
        }
        // dash timers
        if (s.dashTime > 0) {
          s.dashTime -= rawDt;
          s.ghostTimer -= rawDt;
          if (s.ghostTimer <= 0) {
            s.ghosts.push({ pts: s.snake.map((q) => ({ ...q })), life: 280, maxLife: 280 });
            s.ghostTimer = 34;
          }
          // dash trail particles
          const head = s.snake[0];
          if (head && Math.random() < 0.7) {
            s.particles.push({
              x: ox + head.x * cell + cell / 2 + rand(-4, 4), y: oy + head.y * cell + cell / 2 + rand(-4, 4),
              vx: -s.dir.x * 60 + rand(-30, 30), vy: -s.dir.y * 60 + rand(-30, 30),
              life: rand(250, 450), maxLife: 450, size: rand(2, 4.5), color: '#22d3ee', drag: 2, grav: 0,
            });
          }
          if (s.dashTime <= 0) pushHud();
        }
        if (s.dashCd > 0) s.dashCd -= rawDt;
        // golden spawn / expiry
        if (!s.attract) {
          if (!s.golden) {
            s.goldenSpawnIn -= rawDt;
            if (s.goldenSpawnIn <= 0) {
              s.golden = emptyCell();
              s.goldenTimer = GOLDEN_LIFE;
              sfx.spawnGolden();
              burst(s.golden.x, s.golden.y, '#fbbf24', 16, 160, 600, 4);
              floater(s.golden.x, s.golden.y, 'GOLD!', '#fbbf24', 13);
            }
          } else {
            s.goldenTimer -= rawDt;
            if (s.goldenTimer <= 0) {
              burst(s.golden.x, s.golden.y, '#fbbf24', 10, 120, 500, 3);
              s.golden = null;
              s.goldenSpawnIn = rand(GOLDEN_EVERY_MIN, GOLDEN_EVERY_MAX);
            }
          }
        }
        // ambient sparkles on food
        if (Math.random() < 0.08) {
          s.particles.push({
            x: ox + s.food.x * cell + cell / 2 + rand(-cell, cell), y: oy + s.food.y * cell + cell / 2 + rand(-cell, cell),
            vx: rand(-14, 14), vy: rand(-26, -8),
            life: rand(400, 800), maxLife: 800, size: rand(1, 2.2), color: '#fb7185', drag: 0.5, grav: 0,
          });
        }
      }

      if (p === 'dying') {
        s.deathTimer += rawDt;
        if (s.deathTimer > 780) {
          setPhase('gameover');
          onGameOverRef.current({ score: s.score, length: s.snake.length, level: s.level, orbs: s.orbs });
        }
      }

      // particles / floaters / ghosts always animate except when paused
      if (p !== 'paused') {
        const dtS = rawDt / 1000;
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const pt = s.particles[i];
          pt.life -= rawDt;
          if (pt.life <= 0) { s.particles.splice(i, 1); continue; }
          const dr = Math.max(0, 1 - pt.drag * dtS);
          pt.vx *= dr; pt.vy *= dr;
          pt.x += pt.vx * dtS; pt.y += pt.vy * dtS;
        }
        for (let i = s.floaters.length - 1; i >= 0; i--) {
          const f = s.floaters[i];
          f.life -= rawDt;
          f.y += f.vy * dtS;
          if (f.life <= 0) s.floaters.splice(i, 1);
        }
        for (let i = s.ghosts.length - 1; i >= 0; i--) {
          s.ghosts[i].life -= rawDt;
          if (s.ghosts[i].life <= 0) s.ghosts.splice(i, 1);
        }
      }
      s.trauma = Math.max(0, s.trauma - rawDt / 1000 * 1.4);
      s.flashA = Math.max(0, s.flashA - rawDt / 1000 * 1.6);
      s.eatPulse = Math.max(0, s.eatPulse - rawDt / 220);

      // throttled HUD sync for bars
      s.hudTimer -= rawDt;
      if (s.hudTimer <= 0 && (p === 'playing')) { s.hudTimer = 90; pushHud(); }

      // --- render ---
      const shake = s.trauma * s.trauma * 14;
      const shX = rand(-shake, shake), shY = rand(-shake, shake);
      ctx.save();
      ctx.translate(shX, shY);

      // background
      const bg = ctx.createRadialGradient(w / 2, h / 2, 10, w / 2, h / 2, Math.max(w, h) * 0.7);
      bg.addColorStop(0, '#0d0d24');
      bg.addColorStop(0.6, '#070718');
      bg.addColorStop(1, '#030308');
      ctx.fillStyle = bg;
      ctx.fillRect(-20, -20, w + 40, h + 40);

      // grid
      ctx.strokeStyle = 'rgba(148,163,255,0.055)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let i = 1; i < COLS; i++) { ctx.moveTo(ox + i * cell, oy); ctx.lineTo(ox + i * cell, oy + ROWS * cell); }
      for (let i = 1; i < ROWS; i++) { ctx.moveTo(ox, oy + i * cell); ctx.lineTo(ox + COLS * cell, oy + i * cell); }
      ctx.stroke();
      // grid dots
      ctx.fillStyle = 'rgba(148,163,255,0.10)';
      for (let x = 0; x <= COLS; x += 2) for (let y = 0; y <= ROWS; y += 2) {
        ctx.fillRect(ox + x * cell - 1, oy + y * cell - 1, 2, 2);
      }

      // board border
      ctx.strokeStyle = 'rgba(34,211,238,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox - 1, oy - 1, COLS * cell + 2, ROWS * cell + 2);
      ctx.strokeStyle = 'rgba(167,139,250,0.14)';
      ctx.lineWidth = 6;
      ctx.strokeRect(ox - 4, oy - 4, COLS * cell + 8, ROWS * cell + 8);

      const t = s.time / 1000;

      // food
      {
        const fx = ox + s.food.x * cell + cell / 2, fy = oy + s.food.y * cell + cell / 2;
        const pulse = 1 + Math.sin(t * 5) * 0.16;
        const r = cell * 0.30 * pulse;
        ctx.fillStyle = 'rgba(251,113,133,0.16)';
        ctx.beginPath(); ctx.arc(fx, fy, r * 2.1, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(251,113,133,0.30)';
        ctx.beginPath(); ctx.arc(fx, fy, r * 1.45, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fb7185';
        ctx.beginPath(); ctx.arc(fx, fy, r, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.85)';
        ctx.beginPath(); ctx.arc(fx - r * 0.3, fy - r * 0.3, r * 0.32, 0, Math.PI * 2); ctx.fill();
      }

      // golden
      if (s.golden) {
        const gx = ox + s.golden.x * cell + cell / 2, gy = oy + s.golden.y * cell + cell / 2;
        const pulse = 1 + Math.sin(t * 7) * 0.2;
        const r = cell * 0.34 * pulse;
        const blink = s.goldenTimer < 1500 ? (Math.sin(t * 18) > 0 ? 1 : 0.35) : 1;
        ctx.globalAlpha = blink;
        ctx.fillStyle = 'rgba(251,191,36,0.18)';
        ctx.beginPath(); ctx.arc(gx, gy, r * 2.3, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#fbbf24';
        ctx.save();
        ctx.translate(gx, gy); ctx.rotate(t * 1.6);
        ctx.fillRect(-r * 0.75, -r * 0.75, r * 1.5, r * 1.5);
        ctx.restore();
        ctx.fillStyle = '#fff7ed';
        ctx.beginPath(); ctx.arc(gx, gy, r * 0.42, 0, Math.PI * 2); ctx.fill();
        // lifetime ring
        ctx.strokeStyle = 'rgba(251,191,36,0.8)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(gx, gy, r * 1.7, -Math.PI / 2, -Math.PI / 2 + (s.goldenTimer / GOLDEN_LIFE) * Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }

      // dash ghosts
      for (const gh of s.ghosts) {
        const a = (gh.life / gh.maxLife) * 0.35;
        ctx.fillStyle = `rgba(34,211,238,${a})`;
        for (const pt of gh.pts) {
          ctx.beginPath();
          ctx.arc(ox + pt.x * cell + cell / 2, oy + pt.y * cell + cell / 2, cell * 0.36, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // snake
      if (s.snakeVisible && s.snake.length) {
        const alpha = Math.min(1, s.acc / Math.max(1, tickInterval()));
        const len = s.snake.length;
        // body tail -> head
        for (let i = len - 1; i >= 0; i--) {
          const cur = s.snake[i];
          const prv = s.prev[i] || cur;
          const rx = prv.x + (cur.x - prv.x) * alpha;
          const ry = prv.y + (cur.y - prv.y) * alpha;
          const cx = ox + rx * cell + cell / 2;
          const cy = oy + ry * cell + cell / 2;
          const frac = len > 1 ? i / (len - 1) : 0;
          const isHead = i === 0;
          const baseR = cell * (isHead ? 0.44 : 0.40 - frac * 0.14);
          const r = baseR * (1 + (isHead ? s.eatPulse * 0.28 : 0));
          const col = snakeColor(frac);
          // glow underlay
          ctx.fillStyle = isHead ? 'rgba(34,211,238,0.20)' : 'rgba(167,139,250,0.10)';
          ctx.beginPath(); ctx.arc(cx, cy, r * 1.7, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = col;
          ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
          if (isHead) {
            // eyes
            const ex = s.dir.x, ey = s.dir.y;
            const px = -ey, py = ex;
            const eyeOff = r * 0.42, eyeFwd = r * 0.30;
            ctx.fillStyle = '#ffffff';
            ctx.beginPath(); ctx.arc(cx + ex * eyeFwd + px * eyeOff, cy + ey * eyeFwd + py * eyeOff, r * 0.30, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + ex * eyeFwd - px * eyeOff, cy + ey * eyeFwd - py * eyeOff, r * 0.30, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#0b0b1e';
            ctx.beginPath(); ctx.arc(cx + ex * eyeFwd * 1.6 + px * eyeOff, cy + ey * eyeFwd * 1.6 + py * eyeOff, r * 0.16, 0, Math.PI * 2); ctx.fill();
            ctx.beginPath(); ctx.arc(cx + ex * eyeFwd * 1.6 - px * eyeOff, cy + ey * eyeFwd * 1.6 - py * eyeOff, r * 0.16, 0, Math.PI * 2); ctx.fill();
            // tongue flick
            if (Math.sin(t * 2.4) > 0.86) {
              ctx.strokeStyle = '#f472b6';
              ctx.lineWidth = Math.max(1.5, cell * 0.06);
              const tx = cx + ex * r, ty = cy + ey * r;
              ctx.beginPath();
              ctx.moveTo(tx, ty);
              ctx.lineTo(tx + ex * r * 0.7, ty + ey * r * 0.7);
              ctx.moveTo(tx + ex * r * 0.7, ty + ey * r * 0.7);
              ctx.lineTo(tx + ex * r * 1.05 + px * r * 0.22, ty + ey * r * 1.05 + py * r * 0.22);
              ctx.moveTo(tx + ex * r * 0.7, ty + ey * r * 0.7);
              ctx.lineTo(tx + ex * r * 1.05 - px * r * 0.22, ty + ey * r * 1.05 - py * r * 0.22);
              ctx.stroke();
            }
          }
        }
      }

      // particles (additive)
      ctx.globalCompositeOperation = 'lighter';
      for (const pt of s.particles) {
        const a = Math.max(0, pt.life / pt.maxLife);
        ctx.globalAlpha = a;
        ctx.fillStyle = pt.color;
        ctx.beginPath(); ctx.arc(pt.x, pt.y, pt.size * (0.5 + a * 0.7), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';

      // floaters
      ctx.textAlign = 'center';
      for (const f of s.floaters) {
        const a = Math.max(0, f.life / f.maxLife);
        ctx.globalAlpha = a;
        ctx.font = `800 ${f.size}px Orbitron, sans-serif`;
        ctx.strokeStyle = 'rgba(3,3,12,0.85)';
        ctx.lineWidth = 4;
        ctx.strokeText(f.text, f.x, f.y);
        ctx.fillStyle = f.color;
        ctx.fillText(f.text, f.x, f.y);
      }
      ctx.globalAlpha = 1;

      // flash overlay
      if (s.flashA > 0.01) {
        ctx.fillStyle = `rgba(${s.flashColor},${s.flashA})`;
        ctx.fillRect(ox, oy, COLS * cell, ROWS * cell);
      }

      ctx.restore();

      // vignette
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, 'rgba(0,0,0,0.42)');
      ctx.fillStyle = vg;
      ctx.fillRect(0, 0, w, h);
    };

    raf = requestAnimationFrame(loop);
    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('keydown', onKey);
      canvas.removeEventListener('touchstart', onTouchStart);
      canvas.removeEventListener('touchmove', onTouchMove);
      canvas.removeEventListener('touchend', onTouchEnd);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={wrapRef} className="absolute inset-0 overflow-hidden rounded-[inherit]">
      <canvas ref={canvasRef} className="game-canvas absolute inset-0" />
    </div>
  );
});

export default GameCanvas;
