import './ui/style.css';
import { mountGame } from './ui/game';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) mountGame(app);
