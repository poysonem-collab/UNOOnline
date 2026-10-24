/**
 * Game sounds, synthesized with the Web Audio API (no audio files to download).
 * Browsers only allow audio after the player has interacted with the page, so the
 * audio context is created lazily on the first sound after a click or tap.
 */

export type SoundName =
  | 'play'
  | 'draw'
  | 'penalty'
  | 'skip'
  | 'reverse'
  | 'uno'
  | 'catch'
  | 'jump'
  | 'swap'
  | 'yourTurn'
  | 'tick'
  | 'win'
  | 'lose';

const MUTE_KEY = 'uno.muted';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let muted = readMuted();
const listeners = new Set<(muted: boolean) => void>();

function readMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
  try {
    localStorage.setItem(MUTE_KEY, value ? '1' : '0');
  } catch {
    // Not remembered; that's fine.
  }
  listeners.forEach((l) => l(value));
}

export function onMutedChange(listener: (muted: boolean) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function audio(): { ctx: AudioContext; out: GainNode } | null {
  if (typeof window === 'undefined' || !('AudioContext' in window)) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  }
  if (ctx.state === 'suspended') void ctx.resume();
  return { ctx, out: master! };
}

/** A pitched note with a quick attack and exponential fade. */
function tone(freq: number, start: number, duration: number, opts: { type?: OscillatorType; gain?: number; slideTo?: number } = {}) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + start;
  const osc = a.ctx.createOscillator();
  const env = a.ctx.createGain();
  osc.type = opts.type ?? 'sine';
  osc.frequency.setValueAtTime(freq, t);
  if (opts.slideTo) osc.frequency.exponentialRampToValueAtTime(opts.slideTo, t + duration);
  env.gain.setValueAtTime(0.0001, t);
  env.gain.exponentialRampToValueAtTime(opts.gain ?? 0.3, t + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(env).connect(a.out);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

/** Filtered white noise: card slaps and swishes. */
function noise(start: number, duration: number, opts: { from: number; to?: number; type?: BiquadFilterType; gain?: number }) {
  const a = audio();
  if (!a) return;
  const t = a.ctx.currentTime + start;
  const length = Math.ceil(a.ctx.sampleRate * duration);
  const buffer = a.ctx.createBuffer(1, length, a.ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  const src = a.ctx.createBufferSource();
  src.buffer = buffer;
  const filter = a.ctx.createBiquadFilter();
  filter.type = opts.type ?? 'bandpass';
  filter.frequency.setValueAtTime(opts.from, t);
  if (opts.to) filter.frequency.exponentialRampToValueAtTime(opts.to, t + duration);
  const env = a.ctx.createGain();
  env.gain.setValueAtTime(opts.gain ?? 0.4, t);
  env.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  src.connect(filter).connect(env).connect(a.out);
  src.start(t);
}

const SOUNDS: Record<SoundName, (at: number) => void> = {
  play: (at) => {
    noise(at, 0.08, { from: 2400, type: 'bandpass', gain: 0.5 });
    tone(180, at, 0.06, { gain: 0.15 });
  },
  draw: (at) => noise(at, 0.18, { from: 600, to: 3000, type: 'bandpass', gain: 0.25 }),
  penalty: (at) => {
    tone(140, at, 0.35, { slideTo: 60, gain: 0.45 });
    noise(at, 0.2, { from: 400, type: 'lowpass', gain: 0.3 });
  },
  skip: (at) => {
    tone(700, at, 0.09, { type: 'square', gain: 0.08 });
    tone(350, at + 0.09, 0.14, { type: 'square', gain: 0.08 });
  },
  reverse: (at) => {
    tone(400, at, 0.18, { type: 'triangle', slideTo: 900, gain: 0.2 });
    tone(900, at + 0.16, 0.18, { type: 'triangle', slideTo: 400, gain: 0.2 });
  },
  uno: (at) => {
    tone(880, at, 0.16, { type: 'triangle', gain: 0.3 });
    tone(1320, at + 0.12, 0.3, { type: 'triangle', gain: 0.3 });
  },
  catch: (at) => {
    tone(160, at, 0.12, { type: 'sawtooth', gain: 0.15 });
    tone(130, at + 0.13, 0.25, { type: 'sawtooth', gain: 0.15 });
  },
  jump: (at) => tone(300, at, 0.15, { type: 'triangle', slideTo: 1200, gain: 0.25 }),
  swap: (at) => noise(at, 0.4, { from: 300, to: 2500, type: 'bandpass', gain: 0.3 }),
  yourTurn: (at) => {
    tone(660, at, 0.15, { gain: 0.22 });
    tone(990, at + 0.1, 0.3, { gain: 0.22 });
  },
  tick: (at) => tone(1500, at, 0.03, { type: 'square', gain: 0.05 }),
  win: (at) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, at + i * 0.11, 0.3, { type: 'triangle', gain: 0.28 }));
    tone(1047, at + 0.45, 0.6, { type: 'triangle', gain: 0.25 });
  },
  lose: (at) => {
    [392, 330, 262].forEach((f, i) => tone(f, at + i * 0.16, 0.3, { type: 'triangle', gain: 0.22 }));
  },
};

/** Plays sounds in order, slightly spaced so a burst of events stays readable. */
export function playSounds(names: SoundName[]): void {
  if (muted || names.length === 0) return;
  names.slice(0, 4).forEach((name, i) => SOUNDS[name](i * 0.09));
}

export function playSound(name: SoundName): void {
  playSounds([name]);
}
