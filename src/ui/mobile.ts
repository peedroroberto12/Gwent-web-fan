// Recursos de celular: modo offline (service worker) e tela cheia.

/** Rodando como site de verdade (GitHub Pages), e não do disco nem dentro do executável. */
function isWebsite(): boolean {
  const { protocol, hostname } = location;
  const insideApp = '__TAURI_INTERNALS__' in window || hostname === 'tauri.localhost';
  return (protocol === 'https:' || hostname === 'localhost') && !insideApp;
}

export function registerOffline() {
  if (!('serviceWorker' in navigator) || !isWebsite() || import.meta.env.DEV) return;
  navigator.serviceWorker.register('sw.js').catch(() => {
    /* sem offline: o jogo funciona normalmente com internet */
  });
}

export const isTouch = () => window.matchMedia('(pointer: coarse)').matches;

/** Já está em tela cheia (ou aberto como app pela tela inicial)? */
function isFullscreen(): boolean {
  return !!document.fullscreenElement
    || window.matchMedia('(display-mode: fullscreen)').matches
    || window.matchMedia('(display-mode: standalone)').matches;
}

/** Botão de tela cheia: só aparece em celular, pelo navegador, onde a API existe. */
export function fullscreenButton(): string {
  if (!isTouch() || isFullscreen() || !document.documentElement.requestFullscreen) return '';
  return `<button class="btn btn--ghost btn--small btn--icon" data-action="fullscreen" title="Tela cheia">⛶<span class="lbl"> Tela cheia</span></button>`;
}

export async function goFullscreen() {
  try {
    await document.documentElement.requestFullscreen({ navigationUI: 'hide' });
    // trava deitado onde o navegador deixa (Android)
    await (screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }).lock?.('landscape');
  } catch {
    /* iPhone não tem tela cheia no navegador: o "Adicionar à tela inicial" resolve */
  }
}
