// Música de fundo em loop.
// O jogo NÃO traz música: coloque o seu próprio arquivo em public/music/theme.mp3
// (ou theme.ogg). Essa pasta fica fora do Git, então cada um usa a sua.
// Navegadores bloqueiam áudio até a primeira interação, por isso a música
// começa no primeiro clique na página.

const SOURCES = ['music/theme.mp3', 'music/theme.ogg'];
const KEY = 'gwent.music';

let audio: HTMLAudioElement | null = null;
let available: boolean | null = null; // null = ainda testando
let enabled = readPref();
let onChange: () => void = () => {};

function readPref(): boolean {
  try {
    return localStorage.getItem(KEY) !== 'off';
  } catch {
    return true;
  }
}

function savePref() {
  try {
    localStorage.setItem(KEY, enabled ? 'on' : 'off');
  } catch {
    /* navegação privada: tudo bem, só não lembra */
  }
}

function load(i = 0) {
  if (i >= SOURCES.length) {
    available = false;
    onChange();
    return;
  }
  const a = new Audio(SOURCES[i]);
  a.loop = true;
  a.volume = 0.35;
  a.preload = 'auto';
  a.addEventListener('canplay', () => {
    if (available) return;
    audio = a;
    available = true;
    if (enabled) void a.play().catch(() => {});
    onChange();
  }, { once: true });
  a.addEventListener('error', () => load(i + 1), { once: true });
}

export function initMusic(rerender: () => void) {
  onChange = rerender;
  load();
  // primeira interação libera o áudio
  window.addEventListener('pointerdown', () => {
    if (enabled && audio?.paused) void audio.play().catch(() => {});
  }, { once: true });
}

export function toggleMusic() {
  if (!available || !audio) return;
  enabled = !enabled;
  savePref();
  if (enabled) void audio.play().catch(() => {});
  else audio.pause();
  onChange();
}

export function musicButton(): string {
  if (available === false) {
    return `<button class="btn btn--ghost btn--small" disabled
      title="Coloque um arquivo em public/music/theme.mp3 para ter música">♪ Sem música</button>`;
  }
  return `<button class="btn btn--ghost btn--small" data-action="music" ${available ? '' : 'disabled'}>
    ${enabled ? '♪ Música: ligada' : '♪ Música: desligada'}</button>`;
}
