// Interface da partida. Toda regra vem do motor (src/engine); aqui só desenhamos o
// estado, traduzimos cliques/arrastes em jogadas e animamos os eventos.
// Contra a CPU você é o jogador 0. Online, quem criou a sala é o 0 e quem entrou é o 1,
// mas cada um sempre se vê na parte de baixo da mesa.
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
import { animate, cardEffect, returnGhost, snapshot, spotlight, type Effect } from './fx';
import { playAbility, playCard, playRound, sfxButton, toggleSfx } from './sfx';
import { enablePeek, justPeeked } from './peek';
import { fullscreenButton, goFullscreen } from './mobile';
import type { MatchSetup } from './deckbuilder';
import { musicButton, onMusicChange, toggleMusic } from './music';
import type { Failure, OnlineMatch, Status } from '../net/match';

let ME: PlayerId = 0;
let OP: PlayerId = 1;

/** Partida online em andamento (null = contra a CPU). */
let online: OnlineMatch | null = null;
/** Jogadas do oponente que chegaram enquanto a tela ainda animava a anterior. */
const remoteQueue: Move[] = [];
let netStatus: Status = 'connected';
let netFailure: Failure | null = null;
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
  if (online) return;
  session++;
  playCard('shuffle', 0.6);
  g = createGame({
    factions: [setup.me.faction, setup.cpu.faction],
    leaders: [setup.me.leader, setup.cpu.leader],
    decks: [setup.me.deck, setup.cpu.deck],
  });
  ui.selected = null;
  ui.reveal = null;
  ui.log = g.turn === ME ? 'Você começa. Arraste uma carta até a fileira (ou clique nela).' : 'O oponente começa.';
}

/** Online: partida nova, retomada ou ressincronizada. Mostra o estado direto, sem animar. */
function beginOnline(state: GameState) {
  session++;
  playCard('shuffle', 0.6);
  g = state;
  remoteQueue.length = 0;
  ui.busy = false;
  ui.selected = null;
  ui.reveal = null;
  ui.log = g.phase === 'play'
    ? 'Partida retomada.'
    : g.turn === ME ? 'Você começa. Arraste uma carta até a fileira (ou clique nela).' : 'O oponente começa.';
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
        parts.push(e.winner === ME ? 'Vitória!' : e.winner === OP ? 'Derrota.' : 'Empate.');
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
  if (online && by === ME) {
    try {
      online.local(move); // confere e manda para o oponente antes de animar
    } catch {
      return;
    }
  }
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
  playEventSounds(events);

  // efeitos de habilidade: pequenos, na própria carta, um de cada vez,
  // depois que a carta termina de chegar ao lugar
  const abilities = events.filter((e) => e.type === 'ability');
  if (abilities.length && events.some((e) => e.type === 'play')) await wait(700);
  for (const e of events) {
    if (mySession !== session) return;
    if (e.type === 'ability') {
      const el = e.ability === 'leader'
        ? root.querySelector(`.leader-slot--${sideName(e.player)} .card`)
        : root.querySelector(`.card[data-uid="${e.uid}"]`);
      playAbility(e.ability);
      await cardEffect(el, e.ability, e.ability === 'leader' ? 'Líder' : ABILITY_NAMES[e.ability]);
    }
    if (e.type === 'round') {
      playRound(e.winner === 'draw' ? 'draw' : e.winner === ME ? 'win' : 'lose');
      const t = e.winner === 'draw' ? 'Empate' : e.winner === ME ? 'Rodada sua' : 'Rodada do oponente';
      await spotlight({ title: t, subtitle: `${e.scores[0]} × ${e.scores[1]}`, tone: 'round' });
    }
  }

  if (mySession !== session) return; // o jogador saiu para o editor no meio da animação
  ui.busy = false;
  render();
  next();
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Sons físicos de carta para cada evento (em sequência quando são vários). */
function playEventSounds(events: GameEvent[]) {
  let t = 0;
  for (const e of events) {
    switch (e.type) {
      case 'play':
        playCard('place', 0.6, t);
        t += e.from === 'hand' ? 0 : 140; // convocar: um "toc" por carta
        break;
      case 'draw':
        e.uids.forEach((_, i) => playCard('slide', 0.45, t + i * 160));
        break;
      case 'redraw':
      case 'discard':
      case 'return':
        playCard('shove', 0.5, t);
        break;
      case 'pass':
        playCard('chip', 0.5, t);
        break;
      case 'round':
        playCard('fan', 0.5, t + 200);
        break;
    }
  }
}

function next() {
  if (ui.busy || g.winner !== null || ui.reveal || actor() !== OP) return;
  if (online) {
    const m = remoteQueue.shift();
    if (m) void dispatch(m);
    return;
  }
  const mySession = session;
  // a IA "pensa" um pouco antes de jogar, para o ritmo não ficar atropelado
  if (actor() === OP) setTimeout(() => { if (mySession === session) void dispatch(chooseMove(g, OP)); }, 1300);
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
        return { kind: 'row', side: d.abilities.includes('spy') ? OP : ME, row: m.row, move: m };
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
  if (!myTurn() || justPeeked()) return;
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
  if (!d.ghost) {
    if (justPeeked()) return; // foi uma espiada, não uma jogada
    return onHandClick(d.uid);
  }

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
  enablePeek(el, card); // celular: segurar o dedo mostra a carta grande
  return el;
}

const view = (c: CardInst, strength?: number) =>
  hoverable(cardView(getCard(c.id), { uid: c.uid, owner: sideName(c.owner), strength }), getCard(c.id));

function playerPanel(p: PlayerId): string {
  const P = g.players[p];
  const gems = [0, 1].map((i) => `<span class="gem ${i < P.gems ? 'on' : ''}"></span>`).join('');
  const lead = score(g, p) > score(g, p === ME ? OP : ME);
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
        <div class="leader-slot leader-slot--op" data-leader="${OP}"></div>
        ${playerPanel(OP)}
        <div class="weather" title="Clima"></div>
        ${playerPanel(ME)}
        <div class="leader-slot leader-slot--me" data-leader="${ME}"></div>
      </aside>
      <section class="field ${targets[0]?.kind === 'instant' ? 'is-instant-target' : ''}">
        <div class="rows rows--op"></div>
        <div class="status"><span>Rodada ${g.round}</span>${ui.log}${waitHint()}</div>
        <div class="rows rows--me"></div>
        <div class="hand"></div>
      </section>
      <aside class="right">
        <div class="piles piles--op"></div>
        <div class="preview"></div>
        <div class="piles piles--me"></div>
        <div class="actions">
          <button class="btn btn--pass" data-action="pass" ${myTurn() && !g.pending ? '' : 'disabled'}>Passar</button>
          <div class="actions__row">
            ${online ? '' : '<button class="btn btn--ghost btn--small btn--icon" data-action="restart" title="Recomeçar">↻<span class="lbl"> Recomeçar</span></button>'}
            ${online
              ? '<button class="btn btn--ghost btn--small btn--icon" data-action="decks" title="Sair da sala">✕<span class="lbl"> Sair</span></button>'
              : '<button class="btn btn--ghost btn--small btn--icon" data-action="decks" title="Baralhos">☰<span class="lbl"> Baralhos</span></button>'}
            ${musicButton()}
            ${sfxButton()}
            ${fullscreenButton()}
          </div>
        </div>
      </aside>
    </div>
    ${netBar()}`;

  // líderes (o seu é clicável quando a habilidade está disponível)
  for (const p of [OP, ME]) {
    const P = g.players[p];
    const el = hoverable(cardView(getCard(P.leader)), getCard(P.leader));
    if (P.leaderUsed) el.classList.add('is-used');
    if (p === ME && myTurn() && !g.pending && canUseLeader(g, ME)) {
      el.classList.add('is-usable');
      el.title = 'Usar habilidade do líder';
      el.addEventListener('click', () => { if (!justPeeked()) void dispatch({ type: 'leader' }); });
    }
    root.querySelector(`[data-leader="${p}"]`)!.append(el);
  }

  const w = root.querySelector('.weather')!;
  g.weather.forEach((c) => w.append(view(c)));

  const order: Record<'op' | 'me', Row[]> = { op: ['siege', 'ranged', 'close'], me: ['close', 'ranged', 'siege'] };
  for (const p of [OP, ME]) {
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

  for (const p of [OP, ME]) {
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
  root.querySelector('[data-action="restart"]')?.addEventListener('click', () => { newGame(); render(); next(); });
  root.querySelector('[data-action="music"]')?.addEventListener('click', toggleMusic);
  root.querySelector('[data-action="sfx"]')!.addEventListener('click', () => { toggleSfx(); render(); });
  root.querySelector('[data-action="decks"]')!.addEventListener('click', () => {
    if (!online || g.winner !== null || confirm('Sair da partida online? O oponente vai ser avisado.')) leaveRoom();
  });
  root.querySelector('[data-action="fullscreen"]')?.addEventListener('click', () => void goFullscreen().then(() => render()));

  fitAll(); // antes de animar, para as posições finais já estarem certas

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

/**
 * Cartas demais numa fileira/mão: em vez de vazar, elas se sobrepõem (como no Witcher 3).
 * Calcula quanto falta de espaço e puxa cada carta para a esquerda por igual.
 */
function fitCards(container: HTMLElement) {
  const cards = [...container.querySelectorAll<HTMLElement>(':scope > .card')];
  for (const c of cards) c.style.marginLeft = '';
  if (cards.length < 2) return;
  const style = getComputedStyle(container);
  const avail = container.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const gap = parseFloat(style.columnGap) || 0;
  const width = cards[0]!.getBoundingClientRect().width;
  const need = cards.length * width + (cards.length - 1) * gap;
  if (need <= avail) return;
  const overlap = (need - avail) / (cards.length - 1) + gap;
  for (const c of cards.slice(1)) c.style.marginLeft = `${-overlap}px`;
}

function fitAll() {
  root.querySelectorAll<HTMLElement>('.row__cards, .hand, .weather').forEach(fitCards);
}

let resizeBound = false;
function bindResize() {
  if (resizeBound) return;
  resizeBound = true;
  window.addEventListener('resize', () => { if (root?.isConnected) fitAll(); });
}

/** Escolhas (médico, roubar descarte...), cartas reveladas e fim de jogo. */
function renderOverlays() {
  if (online && (netFailure || netStatus === 'gone')) return netModal();
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
    for (const [label, p] of [['Eu começo', ME], ['Oponente começa', OP]] as const) {
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
    const title = g.winner === ME ? 'Vitória!' : g.winner === OP ? 'Derrota' : 'Empate';
    const el = modal(title, '');
    el.classList.add('modal--end');
    const res = g.roundWinners.map((w, i) => `<li>Rodada ${i + 1}: ${w === 'draw' ? 'empate' : w === ME ? 'você' : 'oponente'}</li>`).join('');
    el.querySelector('.modal__cards')!.outerHTML = `<ul class="modal__rounds">${res}</ul>`;
    const again = document.createElement('button');
    again.className = 'btn';
    const decks = document.createElement('button');
    decks.className = 'btn btn--ghost';
    if (online) {
      const m = online;
      again.textContent = m.rematchOffer ? 'Aceitar revanche' : m.waitingRematch ? 'Esperando o oponente…' : 'Revanche';
      again.disabled = m.waitingRematch;
      again.addEventListener('click', () => { m.rematch(); render(); });
      if (m.rematchOffer) el.querySelector('.modal__box h2')!.insertAdjacentHTML('afterend', '<p class="modal__note">O oponente quer revanche!</p>');
      decks.textContent = 'Sair da sala';
      decks.addEventListener('click', leaveRoom);
    } else {
      again.textContent = 'Jogar de novo';
      again.addEventListener('click', () => { newGame(); render(); next(); });
      decks.textContent = 'Montar baralho';
      decks.addEventListener('click', leave);
    }
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

/** Texto de espera na barra de status quando é a vez do oponente online. */
function waitHint(): string {
  if (!online || g.winner !== null || ui.busy || actor() !== OP) return '';
  const t = g.phase === 'redraw' ? 'Oponente trocando cartas…'
    : g.phase === 'first' ? 'Oponente escolhendo quem começa…'
    : g.pending ? 'Oponente escolhendo uma carta…'
    : 'Vez do oponente…';
  return `<em class="status__wait">${t}</em>`;
}

/** Faixa no topo quando a conexão com o oponente caiu. */
function netBar(): string {
  if (!online || netStatus === 'connected' || netStatus === 'gone' || netFailure) return '';
  return `<div class="netbar"><span class="netbar__dot"></span>Oponente desconectado. Esperando ele voltar…
    <small>Se ele fechou o jogo, é só abrir o link da sala de novo.</small></div>`;
}

const FAILURES: Record<Failure, [string, string]> = {
  version: ['Versões diferentes', 'Vocês estão com versões diferentes do jogo. Os dois precisam recarregar a página (ou atualizar o app) e abrir o link de novo.'],
  full: ['Sala cheia', 'Essa sala já tem dois jogadores.'],
  invalid: ['Problema na partida', 'Recebemos dados inválidos do oponente. Criem uma sala nova.'],
};

function netModal() {
  const [title, text] = netFailure ? FAILURES[netFailure] : ['O oponente saiu', 'Ele saiu da sala. Crie uma sala nova para jogar de novo.'];
  const el = modal(title, '');
  el.querySelector('.modal__cards')!.outerHTML = `<p class="modal__note">${text}</p>`;
  const back = document.createElement('button');
  back.className = 'btn';
  back.textContent = 'Voltar';
  back.addEventListener('click', leaveRoom);
  el.querySelector('.modal__box')!.append(back);
}

function leaveRoom() {
  online?.leave();
  online = null;
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  leave();
}

function leave() {
  session++; // cancela animações e a vez da IA em andamento
  ui.busy = false;
  document.querySelectorAll('.drag-ghost').forEach((e) => e.remove());
  onDecks();
}

export function mountGame(el: HTMLElement, matchSetup: MatchSetup, backToDecks: () => void) {
  root = el;
  bindResize();
  setup = matchSetup;
  onDecks = backToDecks;
  online = null;
  ME = 0;
  OP = 1;
  newGame();
  onMusicChange(() => { if (!ui.busy && !drag) render(); });
  render();
  next();
}

/** Partida online já começada (o lobby chama quando os dois baralhos chegaram). */
export function mountOnline(el: HTMLElement, match: OnlineMatch, backToDecks: () => void) {
  root = el;
  bindResize();
  onDecks = backToDecks;
  online = match;
  ME = match.me;
  OP = ME === 0 ? 1 : 0;
  netStatus = match.status;
  netFailure = null;
  const calm = () => !ui.busy && !drag;
  match.on = {
    status: (st) => { netStatus = st; if (calm()) render(); },
    begin: (st) => { beginOnline(st); render(); next(); },
    remote: (m) => { remoteQueue.push(m); next(); },
    rematch: () => { if (calm()) render(); },
    fail: (why) => { netFailure = why; ui.busy = false; render(); },
  };
  beginOnline(match.state!);
  onMusicChange(() => { if (calm()) render(); });
  render();
  next();
}
