// Sala de espera da partida online: mostra o link para mandar ao amigo e espera
// os dois baralhos chegarem. Quando a partida começa, a tela da mesa assume.
import type { PlayerId } from '../engine';
import { localLink, type Link } from '../net/link';
import { browserStore, newRecord, normalizeRoom, OnlineMatch, type Failure, type Side } from '../net/match';
import { trysteroLink } from '../net/trystero';
import { mountOnline } from './game';
import { musicButton, onMusicChange, toggleMusic } from './music';

const PAGES_URL = 'https://peedroroberto12.github.io/Gwent-web-fan/';

/** Lê `#sala=ABC123` (e `&rede=local`, usado nos testes) do endereço. */
export function roomFromUrl(): { room: string; local: boolean } | null {
  const params = new URLSearchParams(location.hash.slice(1));
  const room = normalizeRoom(params.get('sala') ?? '');
  return room ? { room, local: params.get('rede') === 'local' } : null;
}

function setUrl(room: string, local: boolean) {
  const hash = `#sala=${room}${local ? '&rede=local' : ''}`;
  if (location.hash !== hash) history.replaceState(null, '', location.pathname + location.search + hash);
}

function clearUrl() {
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

/** Link para o amigo. No app de PC o endereço local não serve para ninguém: usa o do site. */
export function shareUrl(room: string, local = false): string {
  const app = location.protocol === 'file:' || location.protocol === 'tauri:' || location.hostname === 'tauri.localhost';
  const base = app ? PAGES_URL : location.origin + location.pathname;
  return `${base}#sala=${room}${local ? '&rede=local' : ''}`;
}

/** No modo de teste entre abas, cada aba guarda a própria partida. */
function storeFor(local: boolean) {
  if (!local) return browserStore();
  let tab = '';
  try {
    tab = sessionStorage.getItem('gwent.tab') ?? '';
    if (!tab) sessionStorage.setItem('gwent.tab', (tab = ':' + Math.random().toString(36).slice(2, 8)));
  } catch { /* sem sessionStorage */ }
  return browserStore(tab);
}

/** Existe partida salva desta sala neste aparelho? (recarregou a página no meio) */
export function hasSavedRoom(room: string, local = false): boolean {
  return storeFor(local).load(room) !== null;
}

let current: OnlineMatch | null = null;

/**
 * Entra numa sala. `side` é o baralho escolhido; sem ele, retoma o que estiver salvo.
 * `me` = 0 para quem criou a sala, 1 para quem entrou pelo link.
 */
export async function openRoom(
  root: HTMLElement,
  opts: { room: string; local: boolean; me?: PlayerId; side?: Side },
  back: () => void,
) {
  current?.leave();
  const store = storeFor(opts.local);
  const saved = store.load(opts.room);
  const rec = saved ?? (opts.side ? newRecord(opts.room, opts.me ?? 1, opts.side) : null);
  if (!rec) return back();
  setUrl(opts.room, opts.local);

  let link: Link;
  try {
    link = opts.local ? localLink(opts.room) : await trysteroLink(opts.room);
  } catch {
    lobby(root, rec.me, opts.room, opts.local, 'Não deu para abrir a conexão. Confira a internet e tente de novo.', back, null);
    return;
  }
  const match = new OnlineMatch(link, rec, store);
  current = match;
  const leave = () => {
    match.leave();
    if (current === match) current = null;
    clearUrl();
    back();
  };
  const start = () => {
    if (current !== match) return;
    mountOnline(root, match, () => {
      if (current === match) current = null;
      back();
    });
  };

  if (match.started && match.state) return start();

  let failure: Failure | null = null;
  let slow = false;
  const draw = () => {
    if (current !== match || root.querySelector('.board')) return;
    lobby(root, match.me, opts.room, opts.local, failure ? FAIL_TEXT[failure] : null, leave, match, slow);
  };
  match.on.begin = start;
  match.on.status = draw;
  match.on.fail = (why) => { failure = why; draw(); };
  match.on.rematch = () => {};
  onMusicChange(draw);
  draw();
  // quem entrou pelo link e não acha ninguém: provavelmente rede bloqueando
  if (match.me === 1) setTimeout(() => {
    slow = true;
    if (match.status === 'searching') draw();
  }, 20000);
}

const FAIL_TEXT: Record<Failure, string> = {
  version: 'Vocês estão com versões diferentes do jogo. Os dois precisam recarregar a página (ou atualizar o app) e tentar de novo.',
  full: 'Essa sala já tem dois jogadores.',
  invalid: 'O baralho do oponente não é válido para esta versão do jogo.',
};

function lobby(
  root: HTMLElement,
  me: PlayerId,
  room: string,
  local: boolean,
  error: string | null,
  leave: () => void,
  match: OnlineMatch | null,
  slow = false,
) {
  const url = shareUrl(room, local);
  const connected = match?.status === 'connected';
  const status = error
    ?? (connected ? 'Oponente conectado! Embaralhando…'
      : match?.status === 'gone' ? 'O oponente saiu da sala.'
      : me === 0 ? 'Esperando o oponente entrar…' : 'Procurando a sala…');
  const pretty = `${room.slice(0, 3)} ${room.slice(3)}`;

  root.innerHTML = `
    <div class="lobby">
      <div class="lobby__box">
        <h1>Partida online</h1>
        <p class="lobby__status ${error ? 'is-error' : ''} ${connected ? 'is-ok' : ''}">
          ${!error && !connected ? '<span class="lobby__spinner"></span>' : ''}${status}</p>
        ${me === 0 ? `
          <p class="lobby__label">Mande este link para o seu amigo:</p>
          <div class="lobby__link">
            <input readonly value="${url}" aria-label="Link da sala">
            <button class="btn btn--small" data-op="copy">Copiar</button>
          </div>
          ${typeof navigator.share === 'function' ? '<button class="btn lobby__share" data-op="share">Compartilhar…</button>' : ''}
          <p class="lobby__code">Ou passe o código: <b>${pretty}</b></p>`
        : `<p class="lobby__code">Sala <b>${pretty}</b></p>`}
        <p class="lobby__hint ${slow && !connected && !error ? 'is-visible' : ''}">Demorando? Se vocês dois estão no 4G, tentem com um de vocês no Wi-Fi.
          Algumas operadoras bloqueiam a conexão direta entre celulares.</p>
        <div class="lobby__actions">
          <button class="btn btn--ghost" data-op="leave">${me === 0 ? 'Cancelar' : 'Voltar'}</button>
          ${musicButton()}
        </div>
      </div>
    </div>`;

  const input = root.querySelector<HTMLInputElement>('.lobby__link input');
  root.querySelector('[data-op="copy"]')?.addEventListener('click', (ev) => {
    const b = ev.currentTarget as HTMLButtonElement;
    const ok = () => { b.textContent = 'Copiado!'; setTimeout(() => (b.textContent = 'Copiar'), 1500); };
    if (navigator.clipboard) void navigator.clipboard.writeText(url).then(ok, () => { input?.select(); });
    else { input?.select(); document.execCommand('copy'); ok(); }
  });
  root.querySelector('[data-op="share"]')?.addEventListener('click', () => {
    void navigator.share({ title: 'Gwent', text: `Bora um Gwent? Entra na minha sala (${pretty}):`, url }).catch(() => {});
  });
  input?.addEventListener('focus', () => input.select());
  root.querySelector('[data-op="leave"]')!.addEventListener('click', leave);
  root.querySelector('[data-action="music"]')?.addEventListener('click', toggleMusic);
}
