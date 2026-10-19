/** Tiny WebAudio synth: no sound files to load, works offline. */
import { useStore } from "./store";

let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  if (useStore.getState().settings?.mute) return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === "suspended") void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, dur: number, type: OscillatorType = "sine", gain = 0.15, delay = 0, slideTo?: number) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, gain = 0.12, delay = 0) {
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 3;
  const src = a.createBufferSource();
  const g = a.createGain();
  const f = a.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = 2400;
  g.gain.value = gain;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  click: () => tone(660, 0.07, "triangle", 0.08),
  snap: () => {
    noise(0.05, 0.25);
    tone(180, 0.08, "square", 0.05, 0.01);
  },
  splash: () => {
    tone(520, 0.18, "sine", 0.12, 0, 980);
    noise(0.12, 0.08, 0.03);
  },
  boop: () => tone(300, 0.15, "sine", 0.1, 0, 220),
  cheer: () => {
    [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, "triangle", 0.12, i * 0.09));
    noise(0.5, 0.05, 0.3);
  },
  pop: () => tone(880, 0.06, "sine", 0.1, 0, 1320),
};
