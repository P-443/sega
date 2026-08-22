/**
 * Tiny tactile sound feedback — pure WebAudio, no assets.
 * The context is created lazily inside a user-gesture call stack
 * (pointer handlers), so autoplay policies are satisfied.
 */

let ctx: AudioContext | null = null;
const MUTE_KEY = 'sega:muted';

function ac(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  if (ctx.state === 'suspended') void ctx.resume();
  return ctx;
}

export function isMuted(): boolean {
  try {
    return localStorage.getItem(MUTE_KEY) === '1';
  } catch {
    return false;
  }
}

export function setMuted(muted: boolean): void {
  try {
    if (muted) localStorage.setItem(MUTE_KEY, '1');
    else localStorage.removeItem(MUTE_KEY);
  } catch {
    /* private mode etc. */
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType,
  gain: number,
  when = 0,
  slideTo?: number,
): void {
  if (isMuted()) return;
  const c = ac();
  if (!c) return;
  const t = c.currentTime + when;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(c.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sounds = {
  /** picking up / selecting a brick */
  pick: () => tone(660, 0.07, 'triangle', 0.06),
  /** brick landing on a square — a soft thock */
  place: () => {
    tone(240, 0.09, 'sine', 0.12);
    tone(140, 0.12, 'sine', 0.1, 0.01);
  },
  /** drop on an illegal square */
  invalid: () => tone(110, 0.12, 'sawtooth', 0.045, 0, 80),
  /** it became your turn */
  turn: () => tone(880, 0.06, 'sine', 0.045),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.14, 'triangle', 0.08, i * 0.09)),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.16, 'sine', 0.07, i * 0.1)),
};
