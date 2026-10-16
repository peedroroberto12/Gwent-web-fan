import './ui/style.css';
import { mountPrototype } from './ui/prototype';

const app = document.querySelector<HTMLDivElement>('#app');
if (app) mountPrototype(app);
