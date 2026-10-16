// Efeitos sonoros.
//  - Sons físicos de carta (jogar, comprar, embaralhar, fichas): Kenney "Casino Audio", CC0
//    (public/sfx/LICENSE-KENNEY.txt). Tocados com <audio>, que funciona abrindo do disco.
//  - Sons de habilidade (geada, fogo, trompa...): sintetizados aqui com a Web Audio API.
//    São originais, não dependem de arquivo e funcionam offline.
import type { Ability } from '../data/cards';

const FILES = {
  place: ['card-place-1', 'card-place-2', 'card-place-3', 'card-place-4'],
  slide: ['card-slide-1', 'card-slide-2', 'card-slide-3', 'card-slide-4'],
  shove: ['card-shove-1', 'card-shove-2'],
  shuffle: ['card-shuffle'],
  fan: ['card-fan-1'],
  pack: ['cards-pack-take-out-1'],
  chip: ['chip-lay-1', 'chip-lay-2'],
} as const;
export type CardSound = keyof typeof FILES;

const KEY = 'gwent.sfx';
let enabled = readPref();
const cache = new Map<string, HTMLAudioElement>();
let ctx: AudioContext | null = null;

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

export function initSfx() {
  for (const list of Object.values(FILES)) for (const f of list) {
    const a = new Audio(`sfx/${f}.mp3`);
    a.preload = 'auto';
    cache.set(f, a);
  }
  // o áudio sintetizado só pode começar depois de uma interação
  window.addEventListener('pointerdown', () => {
    try {
      ctx ??= new AudioContext();
      void ctx.resume();
    } catch {
      /* navegador sem Web Audio: só os sons de arquivo funcionam */
    }
  }, { once: true });
}

export function toggleSfx() {
  enabled = !enabled;
  try { localStorage.setItem(KEY, enabled ? 'on' : 'off'); } catch { /* ok */ }
}

export function sfxButton(): string {
  return `<button class="btn btn--ghost btn--small" data-action="sfx">${enabled ? 'Sons: ligados' : 'Sons: desligados'}</button>`;
}

/** Som físico de carta. Variações aleatórias e leve mudança de tom para não soar repetitivo. */
export function playCard(kind: CardSound, volume = 0.55, delayMs = 0) {
  if (!enabled) return;
  const list = FILES[kind];
  const base = cache.get(list[Math.floor(Math.random() * list.length)]!);
  if (!base) return;
  const go = () => {
    const a = base.cloneNode() as HTMLAudioElement;
    a.volume = volume;
    a.playbackRate = 0.94 + Math.random() * 0.12;
    void a.play().catch(() => {});
  };
  if (delayMs) setTimeout(go, delayMs);
  else go();
}

// ---------------------------------------------------------------- síntese

function out(volume: number): GainNode | null {
  if (!enabled || !ctx || ctx.state !== 'running') return null;
  const g = ctx.createGain();
  g.gain.value = volume;
  g.connect(ctx.destination);
  return g;
}

/** Nota com envelope de ataque e queda suave. */
function tone(dest: AudioNode, freq: number, start: number, dur: number, type: OscillatorType = 'sine', peak = 0.5, attack = 0.02) {
  const c = ctx!;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  o.connect(g).connect(dest);
  o.start(c.currentTime + start);
  o.stop(c.currentTime + start + dur + 0.05);
  return o;
}

/** Ruído filtrado (vento, chuva, fogo). */
function noise(dest: AudioNode, start: number, dur: number, filter: BiquadFilterType, freq: number, peak = 0.5, q = 1) {
  const c = ctx!;
  const len = Math.floor(c.sampleRate * (dur + 0.1));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = filter;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  g.gain.setValueAtTime(0, c.currentTime + start);
  g.gain.linearRampToValueAtTime(peak, c.currentTime + start + Math.min(0.3, dur / 3));
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + start + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(c.currentTime + start);
  src.stop(c.currentTime + start + dur + 0.1);
  return f;
}

/** Eco curto para dar "sala de taverna" aos sons sintetizados. */
function withEcho(dest: AudioNode): AudioNode {
  const c = ctx!;
  const d = c.createDelay();
  d.delayTime.value = 0.16;
  const fb = c.createGain();
  fb.gain.value = 0.28;
  const input = c.createGain();
  input.connect(dest);
  input.connect(d);
  d.connect(fb).connect(d);
  d.connect(dest);
  return input;
}

export function playAbility(ability: Ability | 'leader') {
  const master = out(0.32);
  if (!master) return;
  const o = withEcho(master);
  switch (ability) {
    case 'spy': // duas notas graves e misteriosas
      tone(o, 220, 0, 0.7, 'triangle', 0.35);
      tone(o, 164.8, 0.28, 0.9, 'triangle', 0.35);
      break;
    case 'medic': // arpejo subindo, suave
      [523.3, 659.3, 784, 1046.5].forEach((f, i) => tone(o, f, i * 0.11, 0.9, 'sine', 0.3));
      break;
    case 'muster': // tambor de convocação
      [0, 0.18, 0.36].forEach((t) => tone(o, 90, t, 0.25, 'sine', 0.6, 0.005));
      break;
    case 'horn': { // metal grave que cresce, com vibrato
      const v = tone(o, 146.8, 0, 1.2, 'sawtooth', 0.22, 0.25);
      const lfo = ctx!.createOscillator();
      const depth = ctx!.createGain();
      lfo.frequency.value = 5.5;
      depth.gain.value = 3;
      lfo.connect(depth).connect(v.frequency);
      lfo.start();
      lfo.stop(ctx!.currentTime + 1.3);
      tone(o, 220, 0.15, 1.05, 'sawtooth', 0.12, 0.25);
      break;
    }
    case 'weather_frost': // sininhos de gelo + brilho
      [2093, 2637, 3136, 2349, 2794].forEach((f, i) => tone(o, f, i * 0.07, 0.6, 'sine', 0.12, 0.003));
      noise(o, 0, 1, 'highpass', 6000, 0.12);
      break;
    case 'weather_fog': // ar pesado que sobe
      noise(o, 0, 1.6, 'lowpass', 500, 0.5);
      break;
    case 'weather_rain': // chuva
      noise(o, 0, 1.6, 'bandpass', 2500, 0.45, 0.6);
      break;
    case 'weather_clear': // acorde claro
      [783.99, 987.77, 1174.66].forEach((f, i) => tone(o, f, i * 0.09, 1, 'triangle', 0.2));
      break;
    case 'scorch':
    case 'scorch_close': { // labareda: ruído varrendo para baixo + estrondo
      const f = noise(o, 0, 1.3, 'lowpass', 3500, 0.6);
      f.frequency.exponentialRampToValueAtTime(250, ctx!.currentTime + 1.2);
      tone(o, 55, 0, 1.1, 'sine', 0.6, 0.01);
      break;
    }
    case 'morale': // fanfarra curta
      tone(o, 392, 0, 0.25, 'square', 0.08, 0.01);
      tone(o, 523.3, 0.16, 0.45, 'square', 0.08, 0.01);
      break;
    case 'tight_bond': // duas notas juntas
      tone(o, 440, 0, 0.8, 'sine', 0.25);
      tone(o, 659.3, 0, 0.8, 'sine', 0.2);
      break;
    case 'decoy': // batida de madeira
      tone(o, 240, 0, 0.18, 'sine', 0.6, 0.002);
      noise(o, 0, 0.08, 'bandpass', 1800, 0.25, 2);
      break;
    case 'leader': // gongo grave
      tone(o, 98, 0, 2, 'sine', 0.5, 0.005);
      tone(o, 147, 0, 1.6, 'sine', 0.22, 0.005);
      tone(o, 293.7, 0.02, 1.2, 'sine', 0.1, 0.005);
      break;
    default:
      tone(o, 660, 0, 0.4, 'sine', 0.2);
  }
}

/** Fim de rodada: acorde maior (vitória), menor (derrota) ou suspenso (empate). */
export function playRound(result: 'win' | 'lose' | 'draw') {
  const master = out(0.3);
  if (!master) return;
  const o = withEcho(master);
  const chords = {
    win: [261.6, 329.6, 392, 523.3],
    lose: [220, 261.6, 329.6],
    draw: [261.6, 349.2, 392],
  };
  chords[result].forEach((f, i) => tone(o, f, i * 0.12, 1.6, 'triangle', 0.18, 0.04));
}
