import './ui/style.css';
import { VERSION } from './engine';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = `
    <main class="splash">
      <h1>Gwent Clássico</h1>
      <p>v${VERSION} — ambiente configurado. O tabuleiro vem aí.</p>
      <small>Fan project não oficial, gratuito. Não aprovado nem endossado pela CD PROJEKT RED.</small>
    </main>
  `;
}
