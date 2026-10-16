// PROTÓTIPO DE INTERFACE — não é o motor de regras.
// Serve para validar layout, cartas e fluxo de jogada. As regras aqui são
// simplificadas (sem médico, convocar, isca e líderes) e vão ser substituídas
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

type Side = 'me' | 'op';

interface Player {
  name: string;
  faction: Faction;
  leader: CardDef;
  deck: CardDef[];
  hand: CardDef[];
  discard: CardDef[];
  rows: Record<Row, CardDef[]>;
  horns: Record<Row, CardDef | null>;
  passed: boolean;
  gems: number;
}

const other = (s: Side): Side => (s === 'me' ? 'op' : 'me');

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

function buildDeck(faction: Faction): CardDef[] {
  const own = CARDS.filter((c) => c.faction === faction && (c.type === 'unit' || c.type === 'hero'));
  const neutral = CARDS.filter((c) =>
    ['geralt-of-rivia', 'dandelion', 'biting-frost', 'impenetrable-fog', 'torrential-rain', 'clear-weather',
      'commander-s-horn', 'scorch'].includes(c.id),
  );
  return shuffle([...own, ...neutral]).slice(0, 26);
}

function newPlayer(name: string, faction: Faction): Player {
  const deck = buildDeck(faction);
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
  me: newPlayer('Você', 'northern'),
  op: newPlayer('Oponente', 'nilfgaard'),
  weather: [] as CardDef[],
  turn: 'me' as Side,
  round: 1,
  selected: null as number | null,
  log: 'Sua vez. Escolha uma carta da mão.',
  over: false,
};

// ---------------- pontuação (simplificada) ----------------

function weatherOn(row: Row): boolean {
  return state.weather.some((w) => w.abilities.some((a) => WEATHER_ROW[a] === row));
}

function rowStrengths(side: Side, row: Row): number[] {
  const p = state[side];
  const cards = p.rows[row];
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
  const [card] = p.hand.splice(handIndex, 1);
  if (!card) return;
  const who = side === 'me' ? 'Você' : 'Oponente';

  if (target.kind === 'horn') {
    p.horns[target.row] = card;
    state.log = `${who} tocou a Trompa em ${ROW_NAMES[target.row]}.`;
  } else if (target.kind === 'row') {
    state[target.side].rows[target.row].push(card);
    state.log = `${who} jogou ${card.name}.`;
    if (card.abilities.includes('spy')) {
      draw(side, 2);
      state.log += ' Espião! Comprou 2 cartas.';
    }
  } else if (card.abilities.includes('weather_clear')) {
    state.me.discard.push(...state.weather);
    state.weather = [];
    p.discard.push(card);
    state.log = `${who} limpou o clima.`;
  } else if (card.type === 'weather') {
    if (!state.weather.some((w) => w.id === card.id)) state.weather.push(card);
    else p.discard.push(card);
    state.log = `${who} jogou ${card.name}.`;
  } else if (card.abilities.includes('scorch')) {
    scorch();
    p.discard.push(card);
    state.log = `${who} usou Queimar!`;
  } else {
    p.discard.push(card);
    state.log = `${card.name}: efeito ainda não implementado no protótipo.`;
  }
}

function scorch() {
  let max = 0;
  for (const s of ['me', 'op'] as Side[])
    for (const r of ROWS)
      rowStrengths(s, r).forEach((v, i) => {
        if (state[s].rows[r][i]!.type !== 'hero') max = Math.max(max, v);
      });
  if (max === 0) return;
  for (const s of ['me', 'op'] as Side[])
    for (const r of ROWS) {
      const str = rowStrengths(s, r);
      const keep: CardDef[] = [];
      state[s].rows[r].forEach((c, i) => {
        if (c.type !== 'hero' && str[i] === max) state[s].discard.push(c);
        else keep.push(c);
      });
      state[s].rows[r] = keep;
    }
}

function nextTurn(from: Side) {
  const next = other(from);
  if (state.me.passed && state.op.passed) return endRound();
  state.turn = state[next].passed ? from : next;
  if (state.turn === 'op') setTimeout(opponentMove, 700);
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
      .map((c, i) => ({ c, i, s: c.type === 'unit' || c.type === 'hero' ? (c.strength ?? 0) : -1 }))
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

  for (const s of ['me', 'op'] as Side[]) {
    const p = state[s];
    for (const r of ROWS) {
      p.discard.push(...p.rows[r]);
      if (p.horns[r]) p.discard.push(p.horns[r]!);
      p.rows[r] = [];
      p.horns[r] = null;
    }
    p.passed = false;
  }
  state.me.discard.push(...state.weather);
  state.weather = [];

  if (state.me.gems <= 0 || state.op.gems <= 0) {
    state.over = true;
    const result =
      state.me.gems > 0 ? 'Vitória!' : state.op.gems > 0 ? 'Derrota.' : 'Empate.';
    state.log = `${msg} Fim de jogo — ${result}`;
    state.turn = 'me';
    return;
  }
  state.round++;
  state.turn = 'me';
  state.log = `${msg} Rodada ${state.round}: sua vez.`;
}

// ---------------- interação ----------------

function onHandClick(i: number) {
  if (state.turn !== 'me' || state.me.passed || state.over) return;
  const card = state.me.hand[i];
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
  if (state.turn !== 'me' || state.over) return;
  state.me.passed = true;
  state.selected = null;
  state.log = 'Você passou.';
  nextTurn('me');
  render();
}

function restart() {
  state.me = newPlayer('Você', 'northern');
  state.op = newPlayer('Oponente', 'nilfgaard');
  state.weather = [];
  state.turn = 'me';
  state.round = 1;
  state.selected = null;
  state.over = false;
  state.log = 'Nova partida. Sua vez.';
  render();
}

// ---------------- renderização ----------------

let root: HTMLElement;
let preview: HTMLElement;

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
  el.addEventListener('mouseenter', () => showPreview(card));
  return el;
}

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

function render() {
  const sel = state.selected !== null ? state.me.hand[state.selected] : undefined;
  const valid = sel ? targetsFor(sel, 'me') : [];
  const isValid = (t: Target) =>
    valid.some((v) =>
      v.kind === t.kind &&
      (v.kind === 'instant' || (v.row === (t as { row: Row }).row &&
        (v.kind !== 'row' || v.side === (t as { side: Side }).side))),
    );

  root.innerHTML = `
    <div class="board">
      <aside class="side">
        ${playerPanel('op')}
        <div class="weather" title="Clima"></div>
        ${playerPanel('me')}
        <div class="actions">
          <button class="btn" data-action="pass" ${state.turn !== 'me' || state.me.passed || state.over ? 'disabled' : ''}>Passar</button>
          <button class="btn btn--ghost" data-action="restart">Nova partida</button>
        </div>
      </aside>
      <section class="field">
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

  // líderes
  for (const s of ['op', 'me'] as Side[]) {
    const slot = root.querySelector(`[data-leader="${s}"]`)!;
    slot.append(hoverable(cardView(state[s].leader), state[s].leader));
  }

  // clima
  const w = root.querySelector('.weather')!;
  state.weather.forEach((c) => w.append(hoverable(cardView(c), c)));

  // fileiras
  const order: Record<Side, Row[]> = { op: ['siege', 'ranged', 'close'], me: ['close', 'ranged', 'siege'] };
  for (const side of ['op', 'me'] as Side[]) {
    const box = root.querySelector(`.rows--${side}`)!;
    for (const row of order[side]) {
      const p = state[side];
      const el = document.createElement('div');
      const rowTarget: Target = { kind: 'row', side, row };
      const hornTarget: Target = { kind: 'horn', row };
      el.className = `row row--${row} ${weatherOn(row) ? `weather--${row}` : ''} ${isValid(rowTarget) ? 'is-target' : ''}`;
      el.innerHTML = `
        <div class="row__score">${rowScore(side, row)}</div>
        <div class="row__horn ${side === 'me' && isValid(hornTarget) ? 'is-target' : ''}"></div>
        <div class="row__cards"><span class="row__label">${ROW_NAMES[row]}</span></div>`;
      const strengths = rowStrengths(side, row);
      const cards = el.querySelector('.row__cards')!;
      p.rows[row].forEach((c, i) => cards.append(hoverable(cardView(c, { strength: strengths[i] }), c)));
      if (p.horns[row]) el.querySelector('.row__horn')!.append(hoverable(cardView(p.horns[row]!), p.horns[row]!));

      if (isValid(rowTarget)) cards.addEventListener('click', () => onTargetClick(rowTarget));
      if (side === 'me' && isValid(hornTarget))
        el.querySelector('.row__horn')!.addEventListener('click', () => onTargetClick(hornTarget));
      box.append(el);
    }
  }

  // mão
  const hand = root.querySelector('.hand')!;
  state.me.hand.forEach((c, i) => {
    const el = hoverable(cardView(c), c);
    if (state.selected === i) el.classList.add('is-selected');
    el.addEventListener('click', () => onHandClick(i));
    hand.append(el);
  });

  // pilhas
  for (const s of ['op', 'me'] as Side[]) {
    const p = state[s];
    const top = p.discard[p.discard.length - 1];
    const piles = root.querySelector(`.piles--${s}`)!;
    piles.innerHTML = `
      <div class="pile"><div class="discard"></div><small>Descarte ${p.discard.length}</small></div>
      <div class="pile"><div class="cardback"><span>${p.deck.length}</span></div><small>Baralho</small></div>`;
    if (top) piles.querySelector('.discard')!.append(hoverable(cardView(top), top));
  }

  preview = root.querySelector('.preview')!;
  showPreview(sel ?? null);

  root.querySelector('[data-action="pass"]')!.addEventListener('click', onPass);
  root.querySelector('[data-action="restart"]')!.addEventListener('click', restart);
}

export function mountPrototype(el: HTMLElement) {
  root = el;
  render();
}
