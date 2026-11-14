/* Tiny WebAudio synth — no assets needed, instant juicy SFX */

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = typeof localStorage !== 'undefined' && localStorage.getItem('neon-serpent-muted') === '1';

function ensureCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted() { return muted; }
export function setMuted(m: boolean) {
  muted = m;
  try { localStorage.setItem('neon-serpent-muted', m ? '1' : '0'); } catch { /* ignore */ }
  if (master && ctx) master.gain.setTargetAtTime(m ? 0 : 0.5, ctx.currentTime, 0.02);
}
export function unlockAudio() { ensureCtx(); }

function tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(30, slideTo), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g); g.connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.05);
}

function noise(dur: number, vol: number, filterFreq: number, delay = 0, slideTo?: number) {
  const c = ensureCtx();
  if (!c || !master || muted) return;
  const t0 = c.currentTime + delay;
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const filt = c.createBiquadFilter(); filt.type = 'bandpass'; filt.frequency.setValueAtTime(filterFreq, t0); filt.Q.value = 0.8;
  if (slideTo) filt.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filt); filt.connect(g); g.connect(master);
  src.start(t0);
}

export const sfx = {
  eat(combo: number) {
    const base = 420 + Math.min(combo, 10) * 55;
    tone(base, 0.09, 'sine', 0.5, base * 1.6);
    tone(base * 2, 0.07, 'triangle', 0.22, base * 2.4, 0.02);
  },
  golden() {
    [660, 880, 1100, 1320].forEach((f, i) => tone(f, 0.14, 'triangle', 0.32, f * 1.05, i * 0.055));
    tone(1760, 0.22, 'sine', 0.2, 2200, 0.24);
  },
  dash() {
    noise(0.28, 0.35, 900, 0, 2400);
    tone(220, 0.22, 'sawtooth', 0.12, 660);
  },
  levelUp() {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'square', 0.16, f, i * 0.06));
  },
  death() {
    tone(320, 0.55, 'sawtooth', 0.4, 55);
    tone(160, 0.6, 'square', 0.25, 40, 0.05);
    noise(0.5, 0.4, 500, 0, 80);
  },
  click() { tone(700, 0.06, 'sine', 0.25, 900); },
  pause() { tone(440, 0.08, 'sine', 0.2, 330); },
  turn() { /* intentionally silent — too frequent */ },
  spawnGolden() { tone(980, 0.12, 'sine', 0.18, 1470); },
};
