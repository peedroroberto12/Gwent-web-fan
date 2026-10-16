// Interface da partida. Toda regra vem do motor (src/engine); aqui só desenhamos o
// estado, traduzimos cliques/arrastes em jogadas e animamos os eventos.
// Jogador 0 = você, jogador 1 = IA.
import { chooseMove } from '../ai/basic';
import {
  ABILITY_NAMES,
  ABILITY_TEXT,
  FACTION_NAMES,
  getCard,
  LEADER_TEXT,
  ROW_NAMES,
  type CardDef,
  type Faction,
  type Row,
} from '../data/cards';
import {
  applyMove,
  actorOf,
  canUseLeader,
  createGame,
  legalMoves,
  pendingOptions,
  rowScore,
  rowStrengths,
  score,
  weatherRows,
  type CardInst,
  type GameEvent,
  type GameState,
  type Move,
  type PlayerId,
} from '../engine';
import { cardView } from './cardView';
import { animate, returnGhost, snapshot, spotlight, type Effect } from './fx';
import type { MatchSetup } from './deckbuilder';
import { musicButton, onMusicChange, toggleMusic } from './music';

const ME: PlayerId = 0;
const AI: PlayerId = 1;
const sideName = (p: PlayerId) => (p === ME ? 'me' : 'op');

// ---------------------------------------------------------------- estado da interface

let g: GameState;
const ui = {
  selected: null as number | null, // uid da carta selecionada na mão
  log: '',
  busy: false, //                    animações de destaque rodando: bloqueia a entrada
  reveal: null as string[] | null,
  lastActor: ME as PlayerId,
};
const effects = new Map<number, Effect>();
const origins = new Map<string, string>(); // uid -> seletor de onde a carta surge

let setup: MatchSetup;
let onDecks: () => void = () => {};
/** Cada partida montada ganha um número; timers de uma partida antiga não mexem na tela nova. */
let session = 0;

function newGame() {
  session++;
  g = createGame({
    factions: [setup.me.faction, setup.cpu.faction],
    leaders: [setup.me.leader, setup.cpu.leader],
    decks: [setup.me.deck, setup.cpu.deck],
  });
  ui.selected = null;
  ui.reveal = null;
  ui.log = g.turn === ME ? 'Você começa. Arraste uma carta até a fileira (ou clique nela).' : 'O oponente começa.';
}

// ---------------------------------------------------------------- textos

const name = (id: string) => getCard(id).name;
const who = (p: PlayerId) => (p === ME ? 'Você' : 'Oponente');

function describe(events: GameEvent[]): string {
  const parts: string[] = [];
  for (const e of events) {
    switch (e.type) {
      case 'play':
        if (e.from === 'hand') parts.push(`${who(e.player)} jogou ${name(e.cardId)}.`);
        else if (e.from === 'discard') parts.push(`${name(e.cardId)} voltou à batalha.`);
        break;
      case 'ability':
        if (e.ability === 'leader') parts.push(`${who(e.player)} usou o líder.`);
        break;
      case 'destroy':
        parts.push(`${e.uids.length} carta(s) queimada(s)!`);
        break;
      case 'pass':
        parts.push(e.auto ? `${who(e.player)} ficou sem cartas e passou.` : `${who(e.player)} passou.`);
        break;
      case 'first':
        parts.push(`${e.starter === ME ? 'Você começa' : 'O oponente começa'} (escolha da Scoia'tael).`);
        break;
      case 'discard':
        parts.push(`${who(e.player)} descartou ${name(g.players[e.player].discard.find((c) => c.uid === e.uid)?.id ?? '')}.`);
        break;
      case 'faction':
        if (e.faction === 'northern') parts.push('Reinos do Norte: carta extra pela vitória.');
        if (e.faction === 'nilfgaard') parts.push('Nilfgaard vence o empate.');
        if (e.faction === 'monsters') parts.push('Monstros mantêm uma unidade no campo.');
        break;
      case 'round': {
        const res = e.winner === 'draw' ? 'Empate' : e.winner === ME ? 'Você venceu' : 'O oponente venceu';
        parts.push(`${res} a rodada ${e.round} (${e.scores[0]} × ${e.scores[1]}).`);
        break;
      }
      case 'game':
        parts.push(e.winner === ME ? 'Vitória!' : e.winner === AI ? 'Derrota.' : 'Empate.');
        break;
    }
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------- fluxo

const actor = () => actorOf(g);
const myTurn = () => !ui.busy && g.winner === null && g.phase === 'play' && actor() === ME && !g.players[ME].passed;

async function dispatch(move: Move, overrides?: Map<string, DOMRect>) {
  const mySession = session;
  const by = actor();
  const { state, events } = applyMove(g, move);
  g = state;
  ui.lastActor = by;
  ui.selected = null;

  for (const e of events) {
    if (e.type === 'destroy') for (const u of e.uids) effects.set(u, 'burn');
    if (e.type === 'play' && e.from !== 'hand') {
      const pile = e.from === 'deck' ? 'cardback' : 'discard';
      origins.set(String(e.uid), `.piles--${sideName(e.player)} .${pile}`);
    }
    if (e.type === 'reveal' && e.player === ME) ui.reveal = e.cardIds;
  }
  const text = describe(events);
  if (text) ui.log = text;

  ui.busy = true;
  render(overrides);

  // destaques: uma carta por vez, grande no centro
  for (const e of events) {
    if (e.type === 'ability') {
      const card = cardView(getCard(e.cardId));
      const ability = e.ability;
      await spotlight({
        card,
        tone: ability,
        title: ability === 'leader' ? 'Habilidade do líder' : ABILITY_NAMES[ability],
        subtitle: ability === 'leader' ? LEADER_TEXT[e.cardId] : `${who(e.player)} · ${name(e.cardId)}`,
      });
    }
    if (e.type === 'round') {
      const t = e.winner === 'draw' ? 'Empate!' : e.winner === ME ? 'Rodada sua!' : 'Rodada do oponente';
      await spotlight({ title: t, subtitle: `${e.scores[0]} × ${e.scores[1]}`, tone: 'round' });
    }
  }

  if (mySession !== session) return; // o jogador saiu para o editor no meio da animação
  ui.busy = false;
  render();
  next();
}

function next() {
  if (g.winner !== null || ui.reveal) return;
  const mySession = session;
  if (actor() === AI) setTimeout(() => { if (mySession === session) void dispatch(chooseMove(g, AI)); }, 650);
}

// ---------------------------------------------------------------- alvos de jogada

type Target =
  | { kind: 'row'; side: PlayerId; row: Row; move: Move }
  | { kind: 'horn'; row: Row; move: Move }
  | { kind: 'card'; uid: number; move: Move }
  | { kind: 'instant'; move: Move };

function targetsFor(uid: number): Target[] {
  const card = g.players[ME].hand.find((c) => c.uid === uid);
  if (!card) return [];
  const d = getCard(card.id);
  return legalMoves(g)
    .filter((m): m is Extract<Move, { type: 'play' }> => m.type === 'play' && m.uid === uid)
    .map((m): Target => {
      if (m.target !== undefined) return { kind: 'card', uid: m.target, move: m };
      if (m.row && (d.type === 'unit' || d.type === 'hero'))
        return { kind: 'row', side: d.abilities.includes('spy') ? AI : ME, row: m.row, move: m };
      if (m.row) return { kind: 'horn', row: m.row, move: m };
      return { kind: 'instant', move: m };
    });
}

function onHandClick(uid: number) {
  if (!myTurn()) return;
  const t = targetsFor(uid);
  if (t.length === 1 && t[0]!.kind !== 'card') {
    void dispatch(t[0]!.move); // destino único: joga direto
    return;
  }
  ui.selected = ui.selected === uid ? null : uid;
  render();
}

function onTarget(t: Target) {
  if (!myTurn()) return;
  void dispatch(t.move);
}

// ---------------------------------------------------------------- arrastar

interface Drag {
  uid: number;
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  ghost: HTMLElement | null;
  hover: Element | null;
}
let drag: Drag | null = null;

function onPointerDown(e: PointerEvent, uid: number, el: HTMLElement) {
  if (e.button !== 0) return;
  const r = el.getBoundingClientRect();
  drag = { uid, startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, ghost: null, hover: null };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  e.preventDefault();
}

function dropAt(x: number, y: number): { el: Element; t: Target } | null {
  if (ui.selected === null) return null;
  const under = document.elementFromPoint(x, y);
  if (!under) return null;
  const targets = targetsFor(ui.selected);
  if (targets[0]?.kind === 'instant') {
    const field = under.closest('.field');
    return field ? { el: field, t: targets[0] } : null;
  }
  const cardEl = under.closest<HTMLElement>('[data-drop^="card:"]');
  const zone = cardEl ?? under.closest<HTMLElement>('[data-drop]');
  if (!zone) return null;
  const [kind, a, b] = zone.dataset.drop!.split(':');
  const t = targets.find((x) =>
    (kind === 'card' && x.kind === 'card' && x.uid === Number(a)) ||
    (kind === 'horn' && x.kind === 'horn' && x.row === a) ||
    (kind === 'row' && x.kind === 'row' && x.side === Number(a) && x.row === b));
  return t ? { el: zone, t } : null;
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6 || !myTurn()) return;
    const inst = g.players[ME].hand.find((c) => c.uid === drag!.uid)!;
    const src = root.querySelector<HTMLElement>(`.hand [data-uid="${drag.uid}"]`)!;
    const r = src.getBoundingClientRect();
    const ghost = cardView(getCard(inst.id));
    ghost.classList.add('drag-ghost');
    Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
    document.body.append(ghost);
    drag.ghost = ghost;
    ui.selected = drag.uid;
    render();
  }
  drag.ghost.style.left = `${e.clientX - drag.offX}px`;
  drag.ghost.style.top = `${e.clientY - drag.offY}px`;
  const hit = dropAt(e.clientX, e.clientY);
  if (hit?.el !== drag.hover) {
    drag.hover?.classList.remove('is-hover');
    hit?.el.classList.add('is-hover');
    drag.hover = hit?.el ?? null;
  }
}

function onPointerUp(e: PointerEvent) {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);
  window.removeEventListener('pointercancel', onPointerUp);
  const d = drag;
  drag = null;
  if (!d) return;
  if (!d.ghost) return onHandClick(d.uid);

  d.hover?.classList.remove('is-hover');
  const hit = e.type === 'pointerup' ? dropAt(e.clientX, e.clientY) : null;
  const rect = d.ghost.getBoundingClientRect();
  if (hit && myTurn()) {
    d.ghost.remove();
    void dispatch(hit.t.move, new Map([[String(d.uid), rect]]));
    return;
  }
  ui.selected = null;
  render();
  const home = root.querySelector<HTMLElement>(`.hand [data-uid="${d.uid}"]`);
  if (!home) return d.ghost.remove();
  home.style.visibility = 'hidden';
  returnGhost(d.ghost, home.getBoundingClientRect());
  setTimeout(() => (home.style.visibility = ''), 330);
}

// ---------------------------------------------------------------- renderização

let root: HTMLElement;
let preview: HTMLElement;
let prevWeather = new Set<Row>();

function showPreview(card: CardDef | null) {
  if (!card) {
    preview.innerHTML = `<p class="preview__hint">Passe o mouse sobre uma carta para ver os detalhes.</p>`;
    return;
  }
  const big = cardView(card);
  big.classList.add('card--big');
  const abilities = card.abilities.map((a) => `<li><b>${ABILITY_NAMES[a]}</b> — ${ABILITY_TEXT[a]}</li>`).join('');
  const kind =
    card.type === 'hero' ? 'Herói — imune a clima e efeitos'
    : card.type === 'leader' ? 'Líder'
    : card.type === 'weather' ? 'Clima'
    : card.type === 'special' ? 'Especial'
    : card.rows.map((r) => ROW_NAMES[r]).join(' / ');
  preview.innerHTML = '';
  preview.append(big);
  preview.insertAdjacentHTML(
    'beforeend',
    `<div class="preview__text"><h3>${card.name}</h3>
     <p class="preview__meta">${FACTION_NAMES[card.faction]} · ${kind}</p>
     ${card.type === 'leader' ? `<p class="preview__leader">${LEADER_TEXT[card.id] ?? ''}</p>` : ''}
     ${abilities ? `<ul class="preview__abilities">${abilities}</ul>` : ''}
     <p class="preview__flavor">“${card.flavor}”</p></div>`,
  );
}

function hoverable(el: HTMLElement, card: CardDef) {
  el.addEventListener('mouseenter', () => { if (!drag?.ghost) showPreview(card); });
  return el;
}

const view = (c: CardInst, strength?: number) =>
  hoverable(cardView(getCard(c.id), { uid: c.uid, owner: sideName(c.owner), strength }), getCard(c.id));

function playerPanel(p: PlayerId): string {
  const P = g.players[p];
  const gems = [0, 1].map((i) => `<span class="gem ${i < P.gems ? 'on' : ''}"></span>`).join('');
  const lead = score(g, p) > score(g, p === ME ? AI : ME);
  return `
    <div class="player player--${sideName(p)} ${actor() === p && g.winner === null ? 'is-turn' : ''}">
      <div class="player__portrait" style="background-image:url('${getCard(P.leader).art}')"></div>
      <div class="player__info">
        <strong>${p === ME ? 'Você' : 'Oponente'}</strong>
        <small>${FACTION_NAMES[P.faction]}</small>
        <div class="player__stats">
          <span class="handcount" title="Cartas na mão"><i></i>${P.hand.length}</span>
          <span class="gems" title="Vidas">${gems}</span>
        </div>
      </div>
      <div class="player__total ${lead ? 'lead' : ''}">${score(g, p)}</div>
      ${P.passed ? '<div class="player__passed">Passou!</div>' : ''}
    </div>`;
}

function render(overrides?: Map<string, DOMRect>) {
  const before = snapshot(root);
  const targets = ui.selected !== null ? targetsFor(ui.selected) : [];
  const isRow = (side: PlayerId, row: Row) => targets.some((t) => t.kind === 'row' && t.side === side && t.row === row);
  const isHorn = (row: Row) => targets.some((t) => t.kind === 'horn' && t.row === row);
  const isCard = (uid: number) => targets.some((t) => t.kind === 'card' && t.uid === uid);
  const weatherNow = weatherRows(g);
  const selCard = ui.selected !== null ? g.players[ME].hand.find((c) => c.uid === ui.selected) : undefined;

  root.innerHTML = `
    <div class="board faction-${g.players[ME].faction}">
      <aside class="left">
        <div class="leader-slot leader-slot--op" data-leader="${AI}"></div>
        ${playerPanel(AI)}
        <div class="weather" title="Clima"></div>
        ${playerPanel(ME)}
        <div class="leader-slot leader-slot--me" data-leader="${ME}"></div>
      </aside>
      <section class="field ${targets[0]?.kind === 'instant' ? 'is-instant-target' : ''}">
        <div class="rows rows--op"></div>
        <div class="status"><span>Rodada ${g.round}</span>${ui.log}</div>
        <div class="rows rows--me"></div>
        <div class="hand"></div>
      </section>
      <aside class="right">
        <div class="piles piles--op"></div>
        <div class="preview"></div>
        <div class="piles piles--me"></div>
        <div class="actions">
          <button class="btn btn--pass" data-action="pass" ${myTurn() && !g.pending ? '' : 'disabled'}>Passar</button>
          <div class="actions__row actions__row--3">
            <button class="btn btn--ghost btn--small" data-action="restart">Recomeçar</button>
            <button class="btn btn--ghost btn--small" data-action="decks">Baralhos</button>
            ${musicButton()}
          </div>
        </div>
      </aside>
    </div>`;

  // líderes (o seu é clicável quando a habilidade está disponível)
  for (const p of [AI, ME]) {
    const P = g.players[p];
    const el = hoverable(cardView(getCard(P.leader)), getCard(P.leader));
    if (P.leaderUsed) el.classList.add('is-used');
    if (p === ME && myTurn() && !g.pending && canUseLeader(g, ME)) {
      el.classList.add('is-usable');
      el.title = 'Usar habilidade do líder';
      el.addEventListener('click', () => void dispatch({ type: 'leader' }));
    }
    root.querySelector(`[data-leader="${p}"]`)!.append(el);
  }

  const w = root.querySelector('.weather')!;
  g.weather.forEach((c) => w.append(view(c)));

  const order: Record<'op' | 'me', Row[]> = { op: ['siege', 'ranged', 'close'], me: ['close', 'ranged', 'siege'] };
  for (const p of [AI, ME]) {
    const box = root.querySelector(`.rows--${sideName(p)}`)!;
    for (const row of order[sideName(p)]) {
      const P = g.players[p];
      const el = document.createElement('div');
      const weatherClass = weatherNow.has(row) ? `weather--${row} ${prevWeather.has(row) ? '' : 'weather-new'}` : '';
      el.className = `row row--${row} ${weatherClass} ${isRow(p, row) ? 'is-target' : ''}`;
      el.innerHTML = `
        <div class="row__score">${rowScore(g, p, row)}</div>
        <div class="row__horn ${p === ME && isHorn(row) ? 'is-target' : ''}" ${p === ME ? `data-drop="horn:${row}"` : ''}></div>
        <div class="row__cards" data-drop="row:${p}:${row}"><span class="row__label">${ROW_NAMES[row]}</span></div>`;
      const strengths = rowStrengths(g, p, row);
      const cards = el.querySelector('.row__cards')!;
      P.rows[row].forEach((c, i) => {
        const cv = view(c, strengths[i]);
        if (p === ME && isCard(c.uid)) {
          cv.classList.add('is-target');
          cv.dataset.drop = `card:${c.uid}`;
          cv.addEventListener('click', (ev) => {
            ev.stopPropagation();
            const t = targets.find((x) => x.kind === 'card' && x.uid === c.uid);
            if (t) onTarget(t);
          });
        }
        cards.append(cv);
      });
      const horn = P.horns[row];
      const hornSlot = el.querySelector('.row__horn')!;
      if (horn === 'leader') hornSlot.append(hoverable(cardView(getCard(P.leader)), getCard(P.leader)));
      else if (horn) hornSlot.append(view(horn));

      const rowT = targets.find((t) => t.kind === 'row' && t.side === p && t.row === row);
      if (rowT) cards.addEventListener('click', () => onTarget(rowT));
      const hornT = targets.find((t) => t.kind === 'horn' && t.row === row);
      if (p === ME && hornT) hornSlot.addEventListener('click', () => onTarget(hornT));
      box.append(el);
    }
  }
  prevWeather = weatherNow;

  const hand = root.querySelector('.hand')!;
  for (const c of g.players[ME].hand) {
    const el = view(c);
    if (ui.selected === c.uid) el.classList.add(drag?.ghost ? 'is-dragging' : 'is-selected');
    el.addEventListener('pointerdown', (e) => onPointerDown(e, c.uid, el));
    hand.append(el);
  }

  for (const p of [AI, ME]) {
    const P = g.players[p];
    const top = P.discard[P.discard.length - 1];
    const piles = root.querySelector(`.piles--${sideName(p)}`)!;
    piles.innerHTML = `
      <div class="pile pile--discard" title="Descarte"><div class="discard"></div><span class="pile__count">${P.discard.length}</span></div>
      <div class="pile pile--deck" title="Baralho"><div class="cardback cardback--${P.faction}"></div><span class="pile__count">${P.deck.length}</span></div>`;
    if (top) piles.querySelector('.discard')!.append(view(top));
  }

  preview = root.querySelector('.preview')!;
  showPreview(selCard ? getCard(selCard.id) : null);

  renderOverlays();

  root.querySelector('[data-action="pass"]')!.addEventListener('click', () => { if (myTurn()) void dispatch({ type: 'pass' }); });
  root.querySelector('[data-action="restart"]')!.addEventListener('click', () => { newGame(); render(); next(); });
  root.querySelector('[data-action="music"]')?.addEventListener('click', toggleMusic);
  root.querySelector('[data-action="decks"]')!.addEventListener('click', leave);

  animate(root, before, {
    effects,
    overrides,
    origin: (el) => {
      const hint = origins.get(el.dataset.uid!);
      if (hint) { origins.delete(el.dataset.uid!); return root.querySelector(hint); }
      return el.closest('.hand')
        ? root.querySelector('.piles--me .cardback')
        : root.querySelector(`.leader-slot--${sideName(ui.lastActor)}`);
    },
    exit: (owner) => root.querySelector(`.piles--${owner ?? 'me'} .discard`),
  });
}

/** Escolhas (médico, roubar descarte...), cartas reveladas e fim de jogo. */
function renderOverlays() {
  if (ui.busy) return;

  if (ui.reveal) {
    const el = modal('Cartas na mão do oponente', 'Clique para continuar');
    const grid = el.querySelector('.modal__cards')!;
    ui.reveal.forEach((id) => grid.append(hoverable(cardView(getCard(id)), getCard(id))));
    el.addEventListener('click', () => { ui.reveal = null; render(); next(); });
    return;
  }

  // abertura: Scoia'tael escolhe quem começa
  if (g.phase === 'first' && g.firstChooser === ME) {
    const el = modal('Scoia\'tael: quem começa a partida?', 'Jogar em segundo costuma ser vantagem: você vê a jogada do oponente antes.');
    el.querySelector('.modal__cards')!.remove();
    const row = document.createElement('div');
    row.className = 'modal__buttons';
    for (const [label, p] of [['Eu começo', ME], ['Oponente começa', AI]] as const) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = label;
      b.addEventListener('click', () => void dispatch({ type: 'first', player: p }));
      row.append(b);
    }
    el.querySelector('.modal__box')!.append(row);
    return;
  }

  // abertura: trocar até 2 cartas da mão
  if (g.phase === 'redraw' && actor() === ME) {
    const left = g.redraws[ME];
    const el = modal('Escolha até 2 cartas para trocar', `Trocas restantes: ${left}. A carta trocada volta para o baralho.`);
    el.classList.add('modal--redraw');
    const grid = el.querySelector('.modal__cards')!;
    for (const c of g.players[ME].hand) {
      const cv = hoverable(cardView(getCard(c.id)), getCard(c.id));
      cv.classList.add('is-pickable');
      cv.addEventListener('click', () => void dispatch({ type: 'redraw', uid: c.uid }));
      grid.append(cv);
    }
    const done = document.createElement('button');
    done.className = 'btn';
    done.textContent = 'Pronto';
    done.addEventListener('click', () => void dispatch({ type: 'keep' }));
    el.querySelector('.modal__box')!.append(done);
    return;
  }

  if (g.pending && g.pending.player === ME) {
    const left = g.pending.count ?? 1;
    const titles = {
      own_hand: `Escolha uma carta da mão para descartar${left > 1 ? ` (${left} restantes)` : ''}`,
      deck_any: 'Escolha uma carta do seu baralho',
      medic: 'Médico: escolha uma unidade para reviver',
      own_discard: 'Escolha uma carta do seu descarte',
      opp_discard: 'Escolha uma carta do descarte do oponente',
      deck_weather: 'Escolha um clima do seu baralho',
    };
    const el = modal(titles[g.pending.source], g.pending.optional ? '' : undefined);
    const grid = el.querySelector('.modal__cards')!;
    for (const c of pendingOptions(g)) {
      const cv = hoverable(cardView(getCard(c.id)), getCard(c.id));
      cv.classList.add('is-pickable');
      cv.addEventListener('click', () => void dispatch({ type: 'choose', uid: c.uid }));
      grid.append(cv);
    }
    if (g.pending.optional) {
      const skip = document.createElement('button');
      skip.className = 'btn btn--ghost';
      skip.textContent = 'Pular';
      skip.addEventListener('click', () => void dispatch({ type: 'choose', uid: null }));
      el.querySelector('.modal__box')!.append(skip);
    }
    return;
  }

  if (g.winner !== null) {
    const title = g.winner === ME ? 'Vitória!' : g.winner === AI ? 'Derrota' : 'Empate';
    const el = modal(title, '');
    el.classList.add('modal--end');
    const res = g.roundWinners.map((w, i) => `<li>Rodada ${i + 1}: ${w === 'draw' ? 'empate' : w === ME ? 'você' : 'oponente'}</li>`).join('');
    el.querySelector('.modal__cards')!.outerHTML = `<ul class="modal__rounds">${res}</ul>`;
    const again = document.createElement('button');
    again.className = 'btn';
    again.textContent = 'Jogar de novo';
    again.addEventListener('click', () => { newGame(); render(); next(); });
    const decks = document.createElement('button');
    decks.className = 'btn btn--ghost';
    decks.textContent = 'Montar baralho';
    decks.addEventListener('click', leave);
    const row = document.createElement('div');
    row.className = 'modal__buttons';
    row.append(again, decks);
    el.querySelector('.modal__box')!.append(row);
  }
}

function modal(title: string, hint?: string): HTMLElement {
  const el = document.createElement('div');
  el.className = 'modal';
  el.innerHTML = `
    <div class="modal__box">
      <h2>${title}</h2>
      <div class="modal__cards"></div>
      ${hint ? `<small>${hint}</small>` : ''}
    </div>`;
  root.append(el);
  return el;
}

function leave() {
  session++; // cancela animações e a vez da IA em andamento
  ui.busy = false;
  document.querySelectorAll('.drag-ghost').forEach((e) => e.remove());
  onDecks();
}

export function mountGame(el: HTMLElement, matchSetup: MatchSetup, backToDecks: () => void) {
  root = el;
  setup = matchSetup;
  onDecks = backToDecks;
  newGame();
  onMusicChange(() => { if (!ui.busy && !drag) render(); });
  render();
  next();
}
