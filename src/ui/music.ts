// Música de fundo em loop (public/music/theme.mp3 ou .ogg).
//
// Navegadores só deixam tocar som depois de uma interação "completa" da pessoa:
// clique, tecla ou soltar o dedo (encostar o dedo não conta no celular). Por isso
// tentamos tocar a cada interação até a primeira dar certo, e não uma vez só:
// se a música ainda estiver carregando no primeiro toque, o próximo toque resolve.

const SOURCES = ['music/theme.mp3', 'music/theme.ogg'];
const KEY = 'gwent.music';
const GESTURES = ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown'] as const;

let audio: HTMLAudioElement | null = null;
let available: boolean | null = null; // null = ainda testando
let enabled = readPref();
let started = false; // já tocou ao menos uma vez (navegador liberou o áudio)
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

/** Tenta tocar. Se o navegador ainda não liberou, a próxima interação tenta de novo. */
function tryPlay() {
  if (!enabled || !audio || !audio.paused) return;
  audio
    .play()
    .then(() => {
      if (!started) {
        started = true;
        for (const g of GESTURES) window.removeEventListener(g, tryPlay);
      }
    })
    .catch(() => {
      /* bloqueado ou ainda carregando: espera a próxima interação */
    });
}

function load(i = 0) {
  if (i >= SOURCES.length) {
    available = false;
    audio = null;
    onChange();
    return;
  }
  const a = new Audio(SOURCES[i]);
  a.loop = true;
  a.volume = 0.35;
  a.preload = 'auto';
  // fica disponível desde já: no iPhone o próprio toque é que dispara o carregamento
  audio = a;
  a.addEventListener('canplay', () => {
    if (available) return;
    available = true;
    onChange();
    tryPlay(); // pode funcionar direto se a pessoa já interagiu antes de terminar de carregar
  }, { once: true });
  a.addEventListener('error', () => load(i + 1), { once: true });
}

/** Quem deve ser avisado quando o estado da música muda (a tela atual). */
export function onMusicChange(fn: () => void) {
  onChange = fn;
}

export function initMusic() {
  load();
  for (const g of GESTURES) window.addEventListener(g, tryPlay, { passive: true });
  // celular: pausa quando o jogo vai para o fundo, retoma ao voltar
  document.addEventListener('visibilitychange', () => {
    if (!audio || !enabled) return;
    if (document.hidden) audio.pause();
    else if (started) void audio.play().catch(() => {});
  });
}

export function toggleMusic() {
  if (!audio || available === false) return;
  enabled = !enabled;
  savePref();
  if (enabled) tryPlay();
  else audio.pause();
  onChange();
}

export function musicButton(): string {
  if (available === false) {
    return `<button class="btn btn--ghost btn--small btn--icon" disabled
      title="Coloque um arquivo em public/music/theme.mp3 para ter música">♪<span class="lbl"> Sem música</span></button>`;
  }
  return `<button class="btn btn--ghost btn--small btn--icon ${enabled ? '' : 'is-off'}" data-action="music" title="Música">
    ♪<span class="lbl">${enabled ? ' Música: ligada' : ' Música: desligada'}</span></button>`;
}
