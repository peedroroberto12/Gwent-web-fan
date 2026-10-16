// PROTÓTIPO DE INTERFACE — não é o motor de regras.
// Serve para validar layout, cartas, animações e fluxo de jogada. As regras aqui
// são simplificadas (sem médico, convocar, isca e líderes) e vão ser substituídas
// pelo src/engine quando ele existir.
import {
  ABILITY_NAMES,
  ABILITY_TEXT,
  CARDS,
  FACTION_NAMES,
  ROW_NAMES,
  ROWS,
  WEATHER_ROW,
  type CardDef,
  type Faction,
  type Row,
} from '../data/cards';
import { cardView } from './cardView';
import { animate, returnGhost, snapshot, type Effect } from './fx';

type Side = 'me' | 'op';

/** Uma cópia concreta de carta na partida. Duas cartas iguais têm uids diferentes. */
interface Inst {
  uid: number;
  def: CardDef;
  owner: Side;
}

interface Player {
  name: string;
  faction: Faction;
  leader: CardDef;
  deck: Inst[];
  hand: Inst[];
  discard: Inst[];
  rows: Record<Row, Inst[]>;
  horns: Record<Row, Inst | null>;
  passed: boolean;
  gems: number;
}

const other = (s: Side): Side => (s === 'me' ? 'op' : 'me');
const SIDES: Side[] = ['me', 'op'];

let nextUid = 1;

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildDeck(faction: Faction, owner: Side): Inst[] {
  const own = CARDS.filter((c) => c.faction === faction && (c.type === 'unit' || c.type === 'hero'));
  const neutral = CARDS.filter((c) =>
    ['geralt-of-rivia', 'dandelion', 'biting-frost', 'impenetrable-fog', 'torrential-rain', 'clear-weather',
      'commander-s-horn', 'scorch'].includes(c.id),
  );
  return shuffle([...own, ...neutral])
    .slice(0, 26)
    .map((def) => ({ uid: nextUid++, def, owner }));
}

function newPlayer(name: string, faction: Faction, side: Side): Player {
  const deck = buildDeck(faction, side);
  return {
    name,
    faction,
    leader: CARDS.find((c) => c.faction === faction && c.type === 'leader')!,
    deck: deck.slice(10),
    hand: deck.slice(0, 10),
    discard: [],
    rows: { close: [], ranged: [], siege: [] },
    horns: { close: null, ranged: null, siege: null },
    passed: false,
    gems: 2,
  };
}

// ---------------- estado ----------------

const state = {
  me: newPlayer('Você', 'northern', 'me'),
  op: newPlayer('Oponente', 'nilfgaard', 'op'),
  weather: [] as Inst[],
  turn: 'me' as Side,
  lastActor: 'me' as Side,
  round: 1,
  selected: null as number | null,
  log: 'Sua vez. Arraste uma carta da mão até a fileira (ou clique nela).',
  over: false,
};

/** Efeitos visuais pendentes, consumidos pela próxima renderização. */
const effects = new Map<number, Effect>();

// ---------------- pontuação (simplificada) ----------------

function weatherOn(row: Row): boolean {
  return state.weather.some((w) => w.def.abilities.some((a) => WEATHER_ROW[a] === row));
}

function rowStrengths(side: Side, row: Row): number[] {
  const p = state[side];
  const cards = p.rows[row].map((i) => i.def);
  const bad = weatherOn(row);
  const hornCount = (p.horns[row] ? 1 : 0) + cards.filter((c) => c.abilities.includes('horn')).length;
  const morale = cards.filter((c) => c.abilities.includes('morale')).length;

  return cards.map((c) => {
    if (c.type === 'hero') return c.strength ?? 0;
    let s = bad ? 1 : (c.strength ?? 0);
    if (c.abilities.includes('tight_bond')) s *= cards.filter((o) => o.name === c.name).length;
    s += morale - (c.abilities.includes('morale') ? 1 : 0);
    const horns = hornCount - (c.abilities.includes('horn') ? 1 : 0);
    if (horns > 0) s *= 2;
    return s;
  });
}

const rowScore = (side: Side, row: Row) => rowStrengths(side, row).reduce((a, b) => a + b, 0);
const total = (side: Side) => ROWS.reduce((a, r) => a + rowScore(side, r), 0);

// ---------------- jogadas ----------------

type Target = { kind: 'row'; side: Side; row: Row } | { kind: 'horn'; row: Row } | { kind: 'instant' };

const sameTarget = (a: Target, b: Target) =>
  a.kind === b.kind &&
  (a.kind === 'instant' ||
    (a.row === (b as { row: Row }).row && (a.kind !== 'row' || a.side === (b as { side: Side }).side)));

function targetsFor(card: CardDef, side: Side): Target[] {
  if (card.type === 'weather' || card.abilities.includes('scorch') || card.abilities.includes('decoy')) {
    return [{ kind: 'instant' }];
  }
  if (card.type === 'special' && card.abilities.includes('horn')) {
    return ROWS.filter((r) => !state[side].horns[r]).map((row) => ({ kind: 'horn', row }));
  }
  const where = card.abilities.includes('spy') ? other(side) : side;
  return card.rows.map((row) => ({ kind: 'row', side: where, row }));
}

function draw(side: Side, n: number) {
  const p = state[side];
  p.hand.push(...p.deck.splice(0, n));
}

function play(side: Side, handIndex: number, target: Target) {
  const p = state[side];
  const [inst] = p.hand.splice(handIndex, 1);
  if (!inst) return;
  const card = inst.def;
  const who = side === 'me' ? 'Você' : 'Oponente';
  state.lastActor = side;

  if (target.kind === 'horn') {
    p.horns[target.row] = inst;
    state.log = `${who} tocou a Trompa em ${ROW_NAMES[target.row]}.`;
  } else if (target.kind === 'row') {
    state[target.side].rows[target.row].push(inst);
    state.log = `${who} jogou ${card.name}.`;
    if (card.abilities.includes('spy')) {
      draw(side, 2);
      state.log += ' Espião! Comprou 2 cartas.';
    }
  } else if (card.abilities.includes('weather_clear')) {
    for (const w of state.weather) state[w.owner].discard.push(w);
    state.weather = [];
    p.discard.push(inst);
    state.log = `${who} limpou o clima.`;
  } else if (card.type === 'weather') {
    if (!state.weather.some((w) => w.def.id === card.id)) state.weather.push(inst);
    else p.discard.push(inst);
    state.log = `${who} jogou ${card.name}.`;
  } else if (card.abilities.includes('scorch')) {
    const killed = scorch();
    p.discard.push(inst);
    state.log = killed ? `${who} usou Queimar! ${killed} carta(s) destruída(s).` : `${who} usou Queimar, mas nada queimou.`;
  } else {
    p.discard.push(inst);
    state.log = `${card.name}: efeito ainda não implementado no protótipo.`;
  }
}

/** Destrói as unidades (não-heróis) mais fortes do campo. Retorna quantas morreram. */
function scorch(): number {
  let max = 0;
  for (const s of SIDES)
    for (const r of ROWS)
      rowStrengths(s, r).forEach((v, i) => {
        if (state[s].rows[r][i]!.def.type !== 'hero') max = Math.max(max, v);
      });
  if (max === 0) return 0;
  let killed = 0;
  for (const s of SIDES)
    for (const r of ROWS) {
      const str = rowStrengths(s, r);
      const keep: Inst[] = [];
      state[s].rows[r].forEach((c, i) => {
        if (c.def.type !== 'hero' && str[i] === max) {
          effects.set(c.uid, 'burn');
          state[c.owner].discard.push(c);
          killed++;
        } else keep.push(c);
      });
      state[s].rows[r] = keep;
    }
  return killed;
}

function nextTurn(from: Side) {
  const next = other(from);
  if (state.me.passed && state.op.passed) return void setTimeout(() => { endRound(); render(); }, 600);
  state.turn = state[next].passed ? from : next;
  if (state.turn === 'op') setTimeout(opponentMove, 900);
}

function opponentMove() {
  if (state.over) return;
  const op = state.op;
  const ahead = total('op') > total('me');
  if (op.hand.length === 0 || (state.me.passed && ahead) || (ahead && total('op') - total('me') > 15)) {
    op.passed = true;
    state.log = 'Oponente passou.';
  } else {
    // IA de protótipo: joga a unidade mais forte que tiver; senão, qualquer carta
    const ranked = op.hand
      .map((c, i) => ({ c: c.def, i, s: c.def.type === 'unit' || c.def.type === 'hero' ? (c.def.strength ?? 0) : -1 }))
      .sort((a, b) => b.s - a.s);
    const pick = ranked[0]!;
    const targets = targetsFor(pick.c, 'op');
    play('op', pick.i, targets[Math.floor(Math.random() * targets.length)] ?? { kind: 'instant' });
  }
  nextTurn('op');
  render();
}

function endRound() {
  const me = total('me');
  const op = total('op');
  let msg: string;
  if (me > op) { state.op.gems--; msg = `Você venceu a rodada ${state.round} (${me} × ${op}).`; }
  else if (op > me) { state.me.gems--; msg = `Oponente venceu a rodada ${state.round} (${op} × ${me}).`; }
  else { state.me.gems--; state.op.gems--; msg = `Empate na rodada ${state.round} (${me} × ${op}).`; }

  for (const s of SIDES) {
    const p = state[s];
    for (const r of ROWS) {
      for (const c of p.rows[r]) state[c.owner].discard.push(c);
      if (p.horns[r]) p.discard.push(p.horns[r]!);
      p.rows[r] = [];
      p.horns[r] = null;
    }
    p.passed = false;
  }
  for (const w of state.weather) state[w.owner].discard.push(w);
  state.weather = [];

  if (state.me.gems <= 0 || state.op.gems <= 0) {
    state.over = true;
    const result = state.me.gems > 0 ? 'Vitória!' : state.op.gems > 0 ? 'Derrota.' : 'Empate.';
    state.log = `${msg} Fim de jogo — ${result}`;
    state.turn = 'me';
    return;
  }
  state.round++;
  state.turn = 'me';
  state.log = `${msg} Rodada ${state.round}: sua vez.`;
}

// ---------------- interação: clique ----------------

const myTurn = () => state.turn === 'me' && !state.me.passed && !state.over;

function onHandClick(i: number) {
  if (!myTurn()) return;
  const card = state.me.hand[i]?.def;
  if (!card) return;
  const targets = targetsFor(card, 'me');
  if (targets.length === 1) {
    // só um destino possível (clima, queimar, unidade de fileira única): joga direto
    state.selected = null;
    play('me', i, targets[0]!);
    nextTurn('me');
  } else {
    state.selected = state.selected === i ? null : i;
  }
  render();
}

function onTargetClick(t: Target) {
  if (state.selected === null) return;
  const i = state.selected;
  state.selected = null;
  play('me', i, t);
  nextTurn('me');
  render();
}

function onPass() {
  if (!myTurn()) return;
  state.me.passed = true;
  state.selected = null;
  state.log = 'Você passou.';
  nextTurn('me');
  render();
}

function restart() {
  state.me = newPlayer('Você', 'northern', 'me');
  state.op = newPlayer('Oponente', 'nilfgaard', 'op');
  state.weather = [];
  state.turn = 'me';
  state.lastActor = 'me';
  state.round = 1;
  state.selected = null;
  state.over = false;
  state.log = 'Nova partida. Sua vez.';
  render();
}

// ---------------- interação: arrastar ----------------

interface Drag {
  index: number;
  uid: number;
  startX: number;
  startY: number;
  offX: number;
  offY: number;
  ghost: HTMLElement | null;
  hover: Element | null;
}

let drag: Drag | null = null;

function onHandPointerDown(e: PointerEvent, i: number, el: HTMLElement) {
  if (e.button !== 0) return;
  const inst = state.me.hand[i];
  if (!inst) return;
  const r = el.getBoundingClientRect();
  drag = { index: i, uid: inst.uid, startX: e.clientX, startY: e.clientY, offX: e.clientX - r.left, offY: e.clientY - r.top, ghost: null, hover: null };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  e.preventDefault();
}

function startDrag(d: Drag) {
  const inst = state.me.hand[d.index]!;
  const src = root.querySelector<HTMLElement>(`.hand [data-uid="${d.uid}"]`)!;
  const r = src.getBoundingClientRect();
  const ghost = cardView(inst.def);
  ghost.classList.add('drag-ghost');
  Object.assign(ghost.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px` });
  document.body.append(ghost);
  d.ghost = ghost;
  state.selected = d.index; // destaca os destinos válidos
  render();
}

/** Lê o destino sob o ponteiro (o fantasma tem pointer-events: none). */
function dropTargetAt(x: number, y: number): { el: Element; target: Target } | null {
  const under = document.elementFromPoint(x, y);
  if (!under || state.selected === null) return null;
  const card = state.me.hand[state.selected]!.def;
  const valid = targetsFor(card, 'me');

  if (valid[0]?.kind === 'instant') {
    const field = under.closest('.field');
    return field ? { el: field, target: { kind: 'instant' } } : null;
  }
  const zone = under.closest<HTMLElement>('[data-drop]');
  if (!zone) return null;
  const [kind, a, b] = zone.dataset.drop!.split(':');
  const t: Target = kind === 'horn' ? { kind: 'horn', row: a as Row } : { kind: 'row', side: a as Side, row: b as Row };
  return valid.some((v) => sameTarget(v, t)) ? { el: zone, target: t } : null;
}

function onPointerMove(e: PointerEvent) {
  if (!drag) return;
  if (!drag.ghost) {
    if (Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) < 6) return;
    if (!myTurn()) return;
    startDrag(drag);
  }
  const g = drag.ghost!;
  g.style.left = `${e.clientX - drag.offX}px`;
  g.style.top = `${e.clientY - drag.offY}px`;

  const hit = dropTargetAt(e.clientX, e.clientY);
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

  if (!d.ghost) return onHandClick(d.index); // não arrastou: é um clique

  d.hover?.classList.remove('is-hover');
  const hit = e.type === 'pointerup' ? dropTargetAt(e.clientX, e.clientY) : null;
  const ghostRect = d.ghost.getBoundingClientRect();

  if (hit) {
    d.ghost.remove();
    state.selected = null;
    play('me', d.index, hit.target);
    nextTurn('me');
    render(new Map([[String(d.uid), ghostRect]]));
  } else {
    // destino inválido: a carta volta para a mão
    state.selected = null;
    render();
    const home = root.querySelector(`.hand [data-uid="${d.uid}"]`) as HTMLElement | null;
    if (home) {
      home.style.visibility = 'hidden';
      const ghost = d.ghost;
      returnGhost(ghost, home.getBoundingClientRect());
      setTimeout(() => (home.style.visibility = ''), 330);
    } else d.ghost.remove();
  }
}

// ---------------- renderização ----------------

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
  const abilities = card.abilities
    .map((a) => `<li><b>${ABILITY_NAMES[a]}</b> — ${ABILITY_TEXT[a]}</li>`)
    .join('');
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
    `<h3>${card.name}</h3>
     <p class="preview__meta">${FACTION_NAMES[card.faction]} · ${kind}</p>
     ${card.leaderText ? `<p class="preview__leader">${card.leaderText}</p>` : ''}
     ${abilities ? `<ul class="preview__abilities">${abilities}</ul>` : ''}
     <p class="preview__flavor">“${card.flavor}”</p>`,
  );
}

function hoverable(el: HTMLElement, card: CardDef) {
  el.addEventListener('mouseenter', () => { if (!drag?.ghost) showPreview(card); });
  return el;
}

const instView = (i: Inst, strength?: number) =>
  hoverable(cardView(i.def, { uid: i.uid, owner: i.owner, strength }), i.def);

function playerPanel(side: Side): string {
  const p = state[side];
  const gems = [0, 1].map((i) => `<span class="gem ${i < p.gems ? 'on' : ''}"></span>`).join('');
  const lead = total(side) > total(other(side));
  return `
    <div class="player player--${side} ${state.turn === side && !state.over ? 'is-turn' : ''}">
      <div class="player__leader" data-leader="${side}"></div>
      <div class="player__info">
        <strong>${p.name}</strong>
        <small>${FACTION_NAMES[p.faction]}</small>
        <div class="player__stats">
          <span class="handcount" title="Cartas na mão">${p.hand.length}</span>
          <span class="gems">${gems}</span>
          ${p.passed ? '<span class="tag">Passou</span>' : ''}
        </div>
      </div>
      <div class="player__total ${lead ? 'lead' : ''}">${total(side)}</div>
    </div>`;
}

function render(overrides?: Map<string, DOMRect>) {
  const before = snapshot(root);

  const sel = state.selected !== null ? state.me.hand[state.selected]?.def : undefined;
  const valid = sel ? targetsFor(sel, 'me') : [];
  const isValid = (t: Target) => valid.some((v) => sameTarget(v, t));
  const weatherNow = new Set(ROWS.filter(weatherOn));

  root.innerHTML = `
    <div class="board">
      <aside class="side">
        ${playerPanel('op')}
        <div class="weather" title="Clima"></div>
        ${playerPanel('me')}
        <div class="actions">
          <button class="btn" data-action="pass" ${myTurn() ? '' : 'disabled'}>Passar</button>
          <button class="btn btn--ghost" data-action="restart">Nova partida</button>
        </div>
      </aside>
      <section class="field ${valid[0]?.kind === 'instant' ? 'is-instant-target' : ''}">
        <div class="rows rows--op"></div>
        <div class="status">Rodada ${state.round} · ${state.log}</div>
        <div class="rows rows--me"></div>
        <div class="hand"></div>
      </section>
      <aside class="info">
        <div class="piles piles--op"></div>
        <div class="preview"></div>
        <div class="piles piles--me"></div>
      </aside>
    </div>`;

  for (const s of ['op', 'me'] as Side[]) {
    const leader = state[s].leader;
    root.querySelector(`[data-leader="${s}"]`)!.append(hoverable(cardView(leader), leader));
  }

  const w = root.querySelector('.weather')!;
  state.weather.forEach((c) => w.append(instView(c)));

  const order: Record<Side, Row[]> = { op: ['siege', 'ranged', 'close'], me: ['close', 'ranged', 'siege'] };
  for (const side of ['op', 'me'] as Side[]) {
    const box = root.querySelector(`.rows--${side}`)!;
    for (const row of order[side]) {
      const p = state[side];
      const el = document.createElement('div');
      const rowTarget: Target = { kind: 'row', side, row };
      const hornTarget: Target = { kind: 'horn', row };
      const weatherClass = weatherNow.has(row) ? `weather--${row} ${prevWeather.has(row) ? '' : 'weather-new'}` : '';
      el.className = `row row--${row} ${weatherClass} ${isValid(rowTarget) ? 'is-target' : ''}`;
      el.innerHTML = `
        <div class="row__score">${rowScore(side, row)}</div>
        <div class="row__horn ${side === 'me' && isValid(hornTarget) ? 'is-target' : ''}" ${side === 'me' ? `data-drop="horn:${row}"` : ''}></div>
        <div class="row__cards" data-drop="row:${side}:${row}"><span class="row__label">${ROW_NAMES[row]}</span></div>`;
      const strengths = rowStrengths(side, row);
      const cards = el.querySelector('.row__cards')!;
      p.rows[row].forEach((c, i) => cards.append(instView(c, strengths[i])));
      if (p.horns[row]) el.querySelector('.row__horn')!.append(instView(p.horns[row]!));

      if (isValid(rowTarget)) cards.addEventListener('click', () => onTargetClick(rowTarget));
      if (side === 'me' && isValid(hornTarget))
        el.querySelector('.row__horn')!.addEventListener('click', () => onTargetClick(hornTarget));
      box.append(el);
    }
  }
  prevWeather = weatherNow;

  const hand = root.querySelector('.hand')!;
  state.me.hand.forEach((c, i) => {
    const el = instView(c);
    if (state.selected === i) el.classList.add(drag?.ghost ? 'is-dragging' : 'is-selected');
    el.addEventListener('pointerdown', (e) => onHandPointerDown(e, i, el));
    hand.append(el);
  });

  for (const s of SIDES) {
    const p = state[s];
    const top = p.discard[p.discard.length - 1];
    const piles = root.querySelector(`.piles--${s}`)!;
    piles.innerHTML = `
      <div class="pile"><div class="discard"></div><small>Descarte ${p.discard.length}</small></div>
      <div class="pile"><div class="cardback"><span>${p.deck.length}</span></div><small>Baralho</small></div>`;
    if (top) piles.querySelector('.discard')!.append(instView(top));
  }

  preview = root.querySelector('.preview')!;
  showPreview(sel ?? null);

  root.querySelector('[data-action="pass"]')!.addEventListener('click', onPass);
  root.querySelector('[data-action="restart"]')!.addEventListener('click', restart);

  animate(root, before, {
    effects,
    overrides,
    // carta nova na mão vem do baralho; no campo, vem de quem acabou de jogar
    origin: (el) =>
      el.closest('.hand')
        ? root.querySelector('.piles--me .cardback')
        : root.querySelector(`.player--${state.lastActor} .player__leader`),
    exit: (owner) => root.querySelector(`.piles--${owner ?? 'me'} .discard`),
  });
}

export function mountPrototype(el: HTMLElement) {
  root = el;
  render();
}
