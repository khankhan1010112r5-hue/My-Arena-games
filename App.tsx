import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Play, Pause, RotateCcw, Volume2, VolumeX, Trophy, Zap,
  ChevronUp, ChevronDown, ChevronLeft, ChevronRight,
  Home, Crown, Keyboard, Hand, Sparkles, Timer, Gauge,
} from 'lucide-react';
import GameCanvas, { type GameHandle, type HudData, type Phase, type GameStats, type DirName } from './components/GameCanvas';
import { loadScores, saveScore, qualifies, lastName, saveName, type ScoreEntry } from './game/storage';
import { isMuted, setMuted as setAudioMuted, unlockAudio } from './game/audio';
import { cn } from './utils/cn';

const initialHud: HudData = {
  score: 0, best: 0, length: 4, level: 1, combo: 0, comboFrac: 0,
  dashFrac: 1, dashReady: true, dashing: false, orbs: 0,
};

function ScoreTable({ scores, highlightScore, compact = false }: { scores: ScoreEntry[]; highlightScore?: number; compact?: boolean }) {
  if (scores.length === 0) {
    return <p className="py-4 text-center text-sm text-slate-400">No scores yet — be the first legend.</p>;
  }
  return (
    <ol className={cn('score-scroll space-y-1 overflow-y-auto pr-1', compact ? 'max-h-40' : 'max-h-56')}>
      {scores.map((s, i) => {
        const isNew = highlightScore !== undefined && s.score === highlightScore && i === scores.findIndex((x) => x.score === highlightScore);
        return (
          <li
            key={`${s.name}-${s.score}-${i}`}
            className={cn(
              'flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm',
              isNew ? 'bg-cyan-400/15 ring-1 ring-cyan-300/50' : i === 0 ? 'bg-amber-400/10' : 'bg-white/[0.03]',
            )}
          >
            <span className={cn('flex w-6 shrink-0 items-center justify-center font-display text-xs font-bold', i === 0 ? 'text-amber-300' : 'text-slate-400')}>
              {i === 0 ? <Crown className="h-4 w-4" /> : i + 1}
            </span>
            <span className="min-w-0 flex-1 truncate font-semibold tracking-wide text-slate-100">{s.name}</span>
            <span className="hidden text-[11px] text-slate-400 sm:inline">Lv{s.level} · {s.length} long</span>
            <span className="font-display text-sm font-bold text-cyan-300">{s.score.toLocaleString()}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function App() {
  const gameRef = useRef<GameHandle>(null);
  const [phase, setPhase] = useState<Phase>('menu');
  const [hud, setHud] = useState<HudData>(initialHud);
  const [scores, setScores] = useState<ScoreEntry[]>(() => loadScores());
  const [finalStats, setFinalStats] = useState<GameStats | null>(null);
  const [muted, setMutedState] = useState(isMuted());
  const [playerName, setPlayerName] = useState(() => lastName());
  const [saved, setSaved] = useState(false);
  const [isNewBest, setIsNewBest] = useState(false);
  const scoresRef = useRef(scores);
  scoresRef.current = scores;

  const onHud = useCallback((h: HudData) => setHud(h), []);
  const onPhaseChange = useCallback((p: Phase) => setPhase(p), []);
  const onGameOver = useCallback((s: GameStats) => {
    setFinalStats(s);
    setSaved(false);
    const prevBest = scoresRef.current[0]?.score ?? 0;
    setIsNewBest(s.score > prevBest && s.score > 0);
    setPlayerName(lastName());
  }, []);

  const best = scores[0]?.score ?? 0;
  const showSaveForm = !!finalStats && !saved && qualifies(finalStats.score);

  const handleSave = useCallback(() => {
    if (!finalStats) return;
    const name = (playerName.trim() || 'PLAYER').toUpperCase().slice(0, 10);
    const next = saveScore({
      name, score: finalStats.score, length: finalStats.length, level: finalStats.level,
      date: new Date().toISOString(),
    });
    saveName(name);
    setScores(next);
    setSaved(true);
  }, [finalStats, playerName]);

  const toggleMute = () => {
    unlockAudio();
    const next = !muted;
    setAudioMuted(next);
    setMutedState(next);
  };

  const goMenu = () => { unlockAudio(); setPhase('menu'); };
  const pressDir = (d: DirName) => (e: React.PointerEvent) => {
    e.preventDefault();
    unlockAudio();
    gameRef.current?.setDirection(d);
  };
  const pressDash = (e: React.PointerEvent) => {
    e.preventDefault();
    unlockAudio();
    gameRef.current?.dash();
  };

  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener('pointerdown', unlock, { once: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  const comboMult = Math.min(hud.combo, 8);
  const inGame = phase === 'playing' || phase === 'paused' || phase === 'dying';

  return (
    <div className="relative min-h-dvh overflow-x-hidden bg-[#050510]">
      {/* ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 left-1/2 h-72 w-[42rem] -translate-x-1/2 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="absolute bottom-0 right-0 h-64 w-96 rounded-full bg-fuchsia-500/10 blur-3xl" />
        <div className="absolute left-0 top-1/3 h-56 w-72 rounded-full bg-violet-500/10 blur-3xl" />
      </div>

      <div className="relative mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-3 pb-5 sm:px-5">
        {/* Header */}
        <header className="flex items-center justify-between gap-3 py-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-cyan-400 via-violet-500 to-fuchsia-500 shadow-lg shadow-violet-500/30">
              <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
            </div>
            <div className="leading-tight">
              <h1 className="font-display text-lg font-black tracking-widest text-white sm:text-xl">
                NEON <span className="text-shimmer">SERPENT</span>
              </h1>
              <p className="text-[11px] font-medium tracking-[0.22em] text-slate-400">FAST-PACED SNAKE REMIX</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="hidden items-center gap-1.5 rounded-full border border-amber-300/25 bg-amber-400/10 px-3 py-1.5 sm:flex">
              <Trophy className="h-4 w-4 text-amber-300" />
              <span className="font-display text-sm font-bold text-amber-200">{Math.max(best, hud.score).toLocaleString()}</span>
            </div>
            <button
              onClick={toggleMute}
              aria-label={muted ? 'Unmute' : 'Mute'}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/10 active:scale-95"
            >
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </button>
            <button
              onClick={() => gameRef.current?.togglePause()}
              aria-label="Pause"
              disabled={!inGame}
              className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.05] text-slate-200 transition hover:bg-white/10 active:scale-95 disabled:opacity-40"
            >
              {phase === 'paused' ? <Play className="h-5 w-5" /> : <Pause className="h-5 w-5" />}
            </button>
          </div>
        </header>

        <main className="grid flex-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
          {/* Left: HUD + board + controls */}
          <section className="min-w-0">
            {/* HUD */}
            <div className="mb-3 grid grid-cols-4 gap-2">
              <div className="rounded-2xl border border-cyan-300/20 bg-cyan-400/[0.07] px-3 py-2">
                <p className="text-[10px] font-bold tracking-[0.2em] text-cyan-300/80">SCORE</p>
                <p className="font-display text-xl font-black leading-none text-white sm:text-2xl">
                  <span key={hud.score} className="combo-pop inline-block neon-score">{hud.score.toLocaleString()}</span>
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[10px] font-bold tracking-[0.2em] text-slate-400">LEVEL</p>
                <p className="font-display text-xl font-black leading-none text-violet-300 sm:text-2xl">{hud.level}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2">
                <p className="text-[10px] font-bold tracking-[0.2em] text-slate-400">LENGTH</p>
                <p className="font-display text-xl font-black leading-none text-fuchsia-300 sm:text-2xl">{hud.length}</p>
              </div>
              <button
                onPointerDown={pressDash}
                className={cn(
                  'rounded-2xl border px-3 py-2 text-left transition active:scale-95',
                  hud.dashReady ? 'border-cyan-300/40 bg-cyan-400/15' : 'border-white/10 bg-white/[0.04]',
                )}
                aria-label="Dash"
              >
                <p className="flex items-center gap-1 text-[10px] font-bold tracking-[0.2em] text-cyan-300/90">
                  <Zap className="h-3 w-3" /> DASH
                </p>
                <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-black/50">
                  <div
                    className={cn('h-full rounded-full transition-[width] duration-100', hud.dashing ? 'bg-fuchsia-400' : 'bg-cyan-300')}
                    style={{ width: `${Math.round(hud.dashFrac * 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-[10px] font-semibold text-slate-400">{hud.dashReady ? 'READY — tap / Space' : 'Charging…'}</p>
              </button>
            </div>

            {/* Combo bar */}
            <div className={cn('mb-3 flex items-center gap-3 transition-opacity', hud.combo >= 2 ? 'opacity-100' : 'opacity-0')}>
              <span key={hud.combo} className="combo-pop font-display text-sm font-black tracking-wider text-amber-300">
                COMBO ×{comboMult}
              </span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.07]">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-400 to-fuchsia-400"
                  style={{ width: `${Math.round(hud.comboFrac * 100)}%` }}
                />
              </div>
              <span className="text-[11px] font-semibold text-slate-400">eat fast to keep it alive</span>
            </div>

            {/* Board */}
            <div className="relative mx-auto aspect-square w-full max-w-[620px] overflow-hidden rounded-3xl border border-cyan-300/20 bg-black/50 shadow-[0_0_50px_rgba(34,211,238,0.12),0_0_90px_rgba(167,139,250,0.10)]">
              <GameCanvas
                ref={gameRef}
                phase={phase}
                best={best}
                onHud={onHud}
                onPhaseChange={onPhaseChange}
                onGameOver={onGameOver}
              />

              {/* MENU overlay */}
              {phase === 'menu' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/55 p-5 text-center backdrop-blur-[2px]">
                  <div className="animate-pop-in">
                    <p className="mb-1 text-[11px] font-bold tracking-[0.35em] text-cyan-300">WELCOME TO THE VOID</p>
                    <h2 className="font-display text-4xl font-black leading-none tracking-wide text-white neon-title sm:text-5xl">
                      NEON<br /><span className="text-shimmer">SERPENT</span>
                    </h2>
                  </div>
                  <p className="max-w-xs text-sm leading-relaxed text-slate-300">
                    Eat orbs, chain combos, dash through your own tail — and don&apos;t kiss the walls.
                  </p>
                  <button
                    onClick={() => gameRef.current?.startGame()}
                    className="animate-pulse-glow group flex items-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 px-8 py-3.5 font-display text-lg font-black tracking-widest text-white transition hover:scale-[1.04] active:scale-95"
                  >
                    <Play className="h-5 w-5 fill-white transition group-hover:scale-125" /> PLAY
                  </button>
                  <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-slate-300">
                    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">
                      <Keyboard className="h-3.5 w-3.5 text-cyan-300" /> WASD / Arrows · Space = Dash
                    </span>
                    <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3 py-1.5">
                      <Hand className="h-3.5 w-3.5 text-fuchsia-300" /> Swipe to turn · Tap = Dash
                    </span>
                  </div>
                  {scores.length > 0 && (
                    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/40 p-3 text-left">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.2em] text-amber-300">
                        <Trophy className="h-3.5 w-3.5" /> TOP SERPENTS
                      </p>
                      <ScoreTable scores={scores.slice(0, 5)} compact />
                    </div>
                  )}
                  <p className="animate-blink-soft text-[11px] font-semibold tracking-widest text-slate-400">PRESS ENTER TO START</p>
                </div>
              )}

              {/* PAUSED overlay */}
              {phase === 'paused' && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-black/60 p-5 text-center backdrop-blur-[3px]">
                  <h2 className="animate-pop-in font-display text-4xl font-black tracking-widest text-white neon-title">PAUSED</h2>
                  <p className="text-sm text-slate-300">Score {hud.score.toLocaleString()} · Level {hud.level} · Length {hud.length}</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => gameRef.current?.togglePause()} className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 font-display text-sm font-black tracking-widest text-white transition hover:scale-105 active:scale-95">
                      <Play className="h-4 w-4 fill-white" /> RESUME
                    </button>
                    <button onClick={() => gameRef.current?.startGame()} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-5 py-3 font-display text-sm font-black tracking-widest text-white transition hover:bg-white/15 active:scale-95">
                      <RotateCcw className="h-4 w-4" /> RESTART
                    </button>
                    <button onClick={goMenu} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-5 py-3 font-display text-sm font-black tracking-widest text-white transition hover:bg-white/15 active:scale-95">
                      <Home className="h-4 w-4" /> MENU
                    </button>
                  </div>
                  <p className="text-[11px] font-semibold tracking-widest text-slate-400">P / ESC TO RESUME · R TO RESTART</p>
                </div>
              )}

              {/* GAME OVER overlay */}
              {phase === 'gameover' && finalStats && (
                <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 overflow-y-auto bg-black/65 p-5 text-center backdrop-blur-[3px]">
                  <div className="animate-pop-in">
                    <p className="mb-1 text-[11px] font-bold tracking-[0.35em] text-rose-400">THE VOID CLAIMS ANOTHER</p>
                    <h2 className="font-display text-4xl font-black tracking-wide text-white neon-title sm:text-5xl">GAME OVER</h2>
                  </div>
                  {isNewBest && (
                    <span className="flex items-center gap-1.5 rounded-full border border-amber-300/40 bg-amber-400/15 px-3 py-1 text-xs font-black tracking-widest text-amber-200">
                      <Sparkles className="h-3.5 w-3.5" /> NEW BEST!
                    </span>
                  )}
                  <p className="font-display text-5xl font-black text-cyan-300 neon-score">{finalStats.score.toLocaleString()}</p>
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'LENGTH', value: finalStats.length },
                      { label: 'LEVEL', value: finalStats.level },
                      { label: 'ORBS', value: finalStats.orbs },
                    ].map((s) => (
                      <div key={s.label} className="rounded-xl border border-white/10 bg-white/[0.05] px-4 py-2">
                        <p className="font-display text-xl font-black text-white">{s.value}</p>
                        <p className="text-[10px] font-bold tracking-[0.2em] text-slate-400">{s.label}</p>
                      </div>
                    ))}
                  </div>

                  {showSaveForm ? (
                    <form
                      className="flex w-full max-w-xs items-center gap-2"
                      onSubmit={(e) => { e.preventDefault(); handleSave(); }}
                    >
                      <input
                        value={playerName}
                        onChange={(e) => setPlayerName(e.target.value.toUpperCase().slice(0, 10))}
                        placeholder="YOUR NAME"
                        maxLength={10}
                        autoFocus
                        className="neon-input min-w-0 flex-1 rounded-xl border border-white/15 bg-black/50 px-3 py-2.5 text-center font-display text-sm font-bold tracking-widest text-white placeholder:text-slate-500"
                      />
                      <button type="submit" className="shrink-0 rounded-xl bg-gradient-to-r from-amber-400 to-orange-500 px-4 py-2.5 font-display text-sm font-black tracking-widest text-black transition hover:scale-105 active:scale-95">
                        SAVE
                      </button>
                    </form>
                  ) : (
                    <div className="w-full max-w-xs rounded-2xl border border-white/10 bg-black/40 p-3 text-left">
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold tracking-[0.2em] text-amber-300">
                        <Trophy className="h-3.5 w-3.5" /> HIGH SCORES
                      </p>
                      <ScoreTable scores={scores} highlightScore={saved ? finalStats.score : undefined} compact />
                    </div>
                  )}

                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button onClick={() => gameRef.current?.startGame()} className="animate-pulse-glow flex items-center gap-2 rounded-xl bg-gradient-to-r from-cyan-400 to-violet-500 px-6 py-3 font-display text-sm font-black tracking-widest text-white transition hover:scale-105 active:scale-95">
                      <RotateCcw className="h-4 w-4" /> PLAY AGAIN
                    </button>
                    <button onClick={goMenu} className="flex items-center gap-2 rounded-xl border border-white/15 bg-white/[0.07] px-5 py-3 font-display text-sm font-black tracking-widest text-white transition hover:bg-white/15 active:scale-95">
                      <Home className="h-4 w-4" /> MENU
                    </button>
                  </div>
                  <p className="text-[11px] font-semibold tracking-widest text-slate-400">PRESS R FOR INSTANT RESTART</p>
                </div>
              )}
            </div>

            {/* Touch D-pad (mobile) */}
            <div className="mt-4 flex items-center justify-center gap-6 lg:hidden">
              <div className="grid grid-cols-3 gap-1.5" style={{ width: 168 }}>
                <span />
                <button onPointerDown={pressDir('up')} aria-label="Up" className="dpad-btn flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
                  <ChevronUp className="h-7 w-7" />
                </button>
                <span />
                <button onPointerDown={pressDir('left')} aria-label="Left" className="dpad-btn flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
                  <ChevronLeft className="h-7 w-7" />
                </button>
                <button onPointerDown={pressDash} aria-label="Dash" className="dpad-btn flex h-14 items-center justify-center rounded-2xl border border-cyan-300/40 bg-cyan-400/15 text-cyan-200">
                  <Zap className="h-6 w-6" />
                </button>
                <button onPointerDown={pressDir('right')} aria-label="Right" className="dpad-btn flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
                  <ChevronRight className="h-7 w-7" />
                </button>
                <span />
                <button onPointerDown={pressDir('down')} aria-label="Down" className="dpad-btn flex h-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.06] text-white">
                  <ChevronDown className="h-7 w-7" />
                </button>
                <span />
              </div>
              <div className="max-w-[130px] text-[11px] leading-relaxed text-slate-400">
                <p><span className="font-bold text-slate-200">Swipe</span> the board to turn.</p>
                <p className="mt-1"><span className="font-bold text-cyan-300">Tap</span> to dash through your tail.</p>
              </div>
            </div>

            {/* Desktop hints */}
            <div className="mt-4 hidden items-center justify-center gap-2 text-[11px] font-semibold text-slate-400 lg:flex">
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1">WASD / ←↑↓→ turn</span>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1">SPACE dash</span>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1">P pause</span>
              <span className="rounded-md border border-white/10 bg-white/[0.05] px-2 py-1">R restart</span>
            </div>
          </section>

          {/* Right: scores + how to play */}
          <aside className="space-y-4">
            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-black tracking-widest text-amber-300">
                <Trophy className="h-4 w-4" /> HIGH SCORES
              </h3>
              <ScoreTable scores={scores} />
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-4 backdrop-blur">
              <h3 className="mb-3 flex items-center gap-2 font-display text-sm font-black tracking-widest text-cyan-300">
                <Gauge className="h-4 w-4" /> HOW TO PLAY
              </h3>
              <ul className="space-y-2.5 text-sm leading-snug text-slate-300">
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-rose-400 shadow-[0_0_8px_rgba(251,113,133,0.9)]" />
                  Eat <b className="text-white">rose orbs</b> to grow. Chain them fast for <b className="text-amber-300">combo multipliers</b> up to ×8.
                </li>
                <li className="flex gap-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
                  Grab the <b className="text-amber-300">golden orb</b> before it fades — huge points.
                </li>
                <li className="flex gap-2.5">
                  <Zap className="mt-0.5 h-4 w-4 shrink-0 text-cyan-300" />
                  <span><b className="text-white">Dash</b> (Space / tap) for a speed burst — you can phase through your own body while dashing.</span>
                </li>
                <li className="flex gap-2.5">
                  <Timer className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  <span>Every 5 orbs you <b className="text-white">level up</b> and the serpent gets faster. Walls are fatal.</span>
                </li>
              </ul>
            </div>

            <p className="px-1 text-center text-[11px] leading-relaxed text-slate-500">
              Runs at 60fps on desktop &amp; mobile · scores saved locally on this device
            </p>
          </aside>
        </main>
      </div>
    </div>
  );
}
