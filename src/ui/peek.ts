// "Segurar o dedo" numa carta mostra ela grande com os detalhes — o equivalente,
// no celular, de passar o mouse por cima no computador.
import { ABILITY_NAMES, ABILITY_TEXT, FACTION_NAMES, LEADER_TEXT, ROW_NAMES, type CardDef } from '../data/cards';
import { cardView } from './cardView';

const HOLD_MS = 420;
let suppressClickUntil = 0;

/** true logo depois de uma espiada: o toque que abriu a espiada não deve virar jogada. */
export function justPeeked(): boolean {
  return performance.now() < suppressClickUntil;
}

export function showPeek(card: CardDef) {
  document.querySelector('.peek')?.remove();
  const kind =
    card.type === 'hero' ? 'Herói — imune a clima e efeitos'
    : card.type === 'leader' ? 'Líder'
    : card.type === 'weather' ? 'Clima'
    : card.type === 'special' ? 'Especial'
    : card.rows.map((r) => ROW_NAMES[r]).join(' / ');
  const abilities = card.abilities.map((a) => `<li><b>${ABILITY_NAMES[a]}</b> — ${ABILITY_TEXT[a]}</li>`).join('');

  const el = document.createElement('div');
  el.className = 'peek';
  el.innerHTML = `
    <div class="peek__box">
      <div class="peek__card"></div>
      <div class="peek__text">
        <h3>${card.name}</h3>
        <p class="peek__meta">${FACTION_NAMES[card.faction]} · ${kind}${card.strength !== null ? ` · força ${card.strength}` : ''}</p>
        ${card.type === 'leader' ? `<p>${LEADER_TEXT[card.id] ?? ''}</p>` : ''}
        ${abilities ? `<ul>${abilities}</ul>` : ''}
        <p class="peek__flavor">“${card.flavor}”</p>
        <small>Toque para fechar</small>
      </div>
    </div>`;
  el.querySelector('.peek__card')!.append(cardView(card));
  el.addEventListener('pointerup', () => el.remove());
  document.body.append(el);
}

/**
 * Liga o "segurar para ver" num elemento. Só reage a toque/caneta; com mouse,
 * o passar por cima continua cuidando disso.
 */
export function enablePeek(el: HTMLElement, card: CardDef) {
  let timer = 0;
  let startX = 0;
  let startY = 0;
  const cancel = () => { clearTimeout(timer); timer = 0; };
  el.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') return;
    startX = e.clientX;
    startY = e.clientY;
    cancel();
    timer = window.setTimeout(() => {
      timer = 0;
      suppressClickUntil = performance.now() + 700;
      navigator.vibrate?.(15);
      showPeek(card);
    }, HOLD_MS);
  });
  el.addEventListener('pointermove', (e) => {
    if (timer && Math.hypot(e.clientX - startX, e.clientY - startY) > 10) cancel(); // virou arraste
  });
  el.addEventListener('pointerup', cancel);
  el.addEventListener('pointercancel', cancel);
  el.addEventListener('contextmenu', (e) => e.preventDefault()); // sem menu de "salvar imagem"
}
