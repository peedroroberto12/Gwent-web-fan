import './ui/style.css';
import { mountDeckBuilder } from './ui/deckbuilder';
import { mountGame } from './ui/game';
import { initMusic } from './ui/music';
import { preloadArt } from './ui/preload';

const app = document.querySelector<HTMLDivElement>('#app');

async function boot(root: HTMLElement) {
  initMusic();

  // tela de carregamento enquanto as artes são decodificadas
  root.innerHTML = `
    <div class="loading">
      <h1>Gwent</h1>
      <div class="loading__bar"><span></span></div>
      <p>Embaralhando as cartas…</p>
    </div>`;
  const bar = root.querySelector<HTMLElement>('.loading__bar span')!;
  await preloadArt((done, total) => { bar.style.width = `${(done / total) * 100}%`; });

  const openDecks = () => mountDeckBuilder(root, (setup) => mountGame(root, setup, openDecks));
  openDecks();
}

if (app) void boot(app);
