import './ui/style.css';
import { mountDeckBuilder } from './ui/deckbuilder';
import { mountGame } from './ui/game';
import { initMusic } from './ui/music';
import { preloadArt } from './ui/preload';
import { initSfx } from './ui/sfx';
import { registerOffline } from './ui/mobile';
import { hasSavedRoom, openRoom, roomFromUrl } from './ui/online';
import { newRoomCode } from './net/match';

const app = document.querySelector<HTMLDivElement>('#app');

async function boot(root: HTMLElement) {
  initMusic();
  initSfx();
  registerOffline();

  // tela de carregamento enquanto as artes são decodificadas
  root.innerHTML = `
    <div class="loading">
      <h1>Gwent</h1>
      <div class="loading__bar"><span></span></div>
      <p>Embaralhando as cartas…</p>
    </div>`;
  const bar = root.querySelector<HTMLElement>('.loading__bar span')!;
  await preloadArt((done, total) => { bar.style.width = `${(done / total) * 100}%`; });

  const openDecks = (): void => {
    const link = roomFromUrl();
    mountDeckBuilder(root, {
      room: link?.room ?? null,
      cpu: (setup) => mountGame(root, setup, openDecks),
      host: (me) => void openRoom(root, { room: newRoomCode(), local: new URLSearchParams(location.hash.slice(1)).get('rede') === 'local', me: 0, side: me }, openDecks),
      join: (me, room) => void openRoom(root, { room, local: link?.local ?? false, me: 1, side: me }, openDecks),
    });
  };

  // abriu pelo link de uma sala: se a partida já estava salva aqui (recarregou), volta direto
  const link = roomFromUrl();
  if (link && hasSavedRoom(link.room, link.local)) void openRoom(root, link, openDecks);
  else openDecks();
}

if (app) void boot(app);
