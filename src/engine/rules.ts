// Regras do Gwent clássico. Contrato público:
//   legalMoves(state)        -> jogadas possíveis para quem está na vez
//   applyMove(state, move)   -> { state: novo estado, events: o que aconteceu }
// O estado recebido nunca é alterado: applyMove trabalha numa cópia.
import { ROWS, type Row } from '../data/cards';
import { leaderAbility } from './leaders';
import { pick, rand, shuffle } from './rng';
import { def, has, isHero, isPlainUnit, leaderActive, passiveOn, rowScore, rowStrengths, score } from './score';
import {
  other,
  type CardInst,
  type GameEvent,
  type GameState,
  type Move,
  type MoveResult,
  type PlayerId,
} from './types';

/** Grupo de convocação: "Arachas Behemoth" e "Arachas" se convocam; "Vampire: Bruxa" e "Vampire: Katakan" também. */
export const musterGroup = (name: string) => name.split(':')[0]!.trim().split(/\s+/)[0]!.toLowerCase();

const NOOP_MOVE_KEYS = ['type', 'uid', 'row', 'target', 'player'] as const;
const sameMove = (a: Move, b: Move) =>
  NOOP_MOVE_KEYS.every((k) => (a as Record<string, unknown>)[k] === (b as Record<string, unknown>)[k]);

// ---------------------------------------------------------------- jogadas legais

/** Opções de uma escolha pendente (médico, roubar descarte...). */
export function pendingOptions(s: GameState): CardInst[] {
  const pd = s.pending;
  if (!pd) return [];
  const P = s.players[pd.player];
  switch (pd.source) {
    case 'medic':
      return P.discard.filter(isPlainUnit);
    case 'own_discard':
      return P.discard.filter((c) => !isHero(c));
    case 'opp_discard':
      return s.players[other(pd.player)].discard.filter((c) => !isHero(c));
    case 'deck_weather':
      return P.deck.filter((c) => def(c).type === 'weather');
    case 'own_hand':
      return P.hand;
    case 'deck_any':
      return P.deck;
  }
}

/** Quem precisa agir agora (escolha de início, troca de cartas, escolha pendente ou turno). */
export function actorOf(s: GameState): PlayerId {
  if (s.phase === 'first') return s.firstChooser!;
  if (s.phase === 'redraw') return s.redrawDone[0] ? 1 : 0;
  return s.pending ? s.pending.player : s.turn;
}

export function canUseLeader(s: GameState, p: PlayerId): boolean {
  const P = s.players[p];
  if (P.leaderUsed || P.passed || !leaderActive(s, p)) return false;
  const a = leaderAbility(P.leader);
  switch (a.kind) {
    case 'passive':
    case 'unimplemented':
      return false;
    case 'pull_weather':
      return P.deck.some((c) => has(c, a.ability));
    case 'pick_weather':
      return P.deck.some((c) => def(c).type === 'weather');
    case 'clear_weather':
      return s.weather.length > 0;
    case 'horn':
      return P.horns[a.row] === null;
    case 'reveal':
      return s.players[other(p)].hand.length > 0;
    case 'steal_discard':
      return s.players[other(p)].discard.some((c) => !isHero(c));
    case 'restore_discard':
      return P.discard.some((c) => !isHero(c));
    case 'discard_draw':
      return P.hand.length >= 2 && P.deck.length > 0;
    default:
      return true;
  }
}

export function legalMoves(s: GameState): Move[] {
  if (s.winner !== null) return [];
  if (s.phase === 'first') return [{ type: 'first', player: 0 }, { type: 'first', player: 1 }];
  if (s.phase === 'redraw') {
    const p = actorOf(s);
    const P = s.players[p];
    const moves: Move[] = [{ type: 'keep' }];
    if (s.redraws[p] > 0 && P.deck.length > 0) for (const c of P.hand) moves.push({ type: 'redraw', uid: c.uid });
    return moves;
  }
  if (s.pending) {
    const moves: Move[] = pendingOptions(s).map((c) => ({ type: 'choose', uid: c.uid }));
    if (s.pending.optional || moves.length === 0) moves.push({ type: 'choose', uid: null });
    return moves;
  }
  const p = s.turn;
  const P = s.players[p];
  if (P.passed) return [];
  const moves: Move[] = [{ type: 'pass' }];
  if (canUseLeader(s, p)) moves.push({ type: 'leader' });

  for (const c of P.hand) {
    const d = def(c);
    if (d.type === 'unit' || d.type === 'hero') {
      for (const row of d.rows) moves.push({ type: 'play', uid: c.uid, row });
    } else if (d.abilities.includes('horn')) {
      for (const row of ROWS) if (P.horns[row] === null) moves.push({ type: 'play', uid: c.uid, row });
    } else if (d.abilities.includes('decoy')) {
      for (const row of ROWS) for (const t of P.rows[row])
        if (isPlainUnit(t)) moves.push({ type: 'play', uid: c.uid, target: t.uid });
    } else {
      moves.push({ type: 'play', uid: c.uid }); // clima, queimar
    }
  }
  return moves;
}

// ---------------------------------------------------------------- aplicar jogada

export function applyMove(state: GameState, move: Move): MoveResult {
  if (!legalMoves(state).some((m) => sameMove(m, move))) {
    throw new Error(`Jogada inválida: ${JSON.stringify(move)}`);
  }
  const s: GameState = structuredClone(state);
  const ev: GameEvent[] = [];

  switch (move.type) {
    case 'first':
      s.starter = move.player;
      s.turn = move.player;
      s.phase = 'redraw';
      ev.push({ type: 'first', chooser: s.firstChooser!, starter: move.player });
      return { state: s, events: ev };
    case 'redraw':
      redraw(s, actorOf(s), move.uid, ev);
      finishRedrawIfDone(s, ev);
      return { state: s, events: ev };
    case 'keep':
      s.redrawDone[actorOf(s)] = true;
      finishRedrawIfDone(s, ev);
      return { state: s, events: ev };
    case 'choose':
      resolvePending(s, move.uid, ev);
      break;
    case 'pass':
      pass(s, s.turn, ev);
      autoPass(s, ev);
      return { state: s, events: ev };
    case 'leader':
      useLeader(s, s.turn, ev);
      break;
    case 'play':
      playFromHand(s, s.turn, move, ev);
      break;
  }

  if (s.pending) ev.push({ type: 'pending', pending: s.pending });
  else if (s.winner === null) {
    endTurn(s);
    autoPass(s, ev);
  }
  return { state: s, events: ev };
}

function endTurn(s: GameState) {
  const o = other(s.turn);
  if (!s.players[o].passed) s.turn = o;
}

function pass(s: GameState, p: PlayerId, ev: GameEvent[], auto = false) {
  s.players[p].passed = true;
  ev.push({ type: 'pass', player: p, ...(auto ? { auto } : {}) });
  if (s.players[other(p)].passed) endRound(s, ev);
  else s.turn = other(p);
}

/** Quem está na vez sem cartas na mão e sem líder para usar passa automaticamente. */
function autoPass(s: GameState, ev: GameEvent[]) {
  for (let guard = 0; guard < 6 && s.winner === null && s.phase === 'play' && !s.pending; guard++) {
    const p = s.turn;
    const P = s.players[p];
    if (P.passed || P.hand.length > 0 || canUseLeader(s, p)) return;
    pass(s, p, ev, true);
  }
}

// ---------------------------------------------------------------- troca de cartas no início

function redraw(s: GameState, p: PlayerId, uid: number, ev: GameEvent[]) {
  const P = s.players[p];
  const i = P.hand.findIndex((c) => c.uid === uid);
  const [old] = P.hand.splice(i, 1);
  const fresh = P.deck.shift()!;
  P.hand.splice(i, 0, fresh);
  // a carta trocada volta para uma posição aleatória do baralho
  P.deck.splice(Math.floor(rand(s) * (P.deck.length + 1)), 0, old!);
  s.redraws[p]--;
  if (s.redraws[p] <= 0) s.redrawDone[p] = true;
  ev.push({ type: 'redraw', player: p, out: old!.uid, in: fresh.uid });
}

function finishRedrawIfDone(s: GameState, ev: GameEvent[]) {
  if (s.redrawDone[0] && s.redrawDone[1]) {
    s.phase = 'play';
    s.turn = s.starter;
    autoPass(s, ev);
  }
}

function takeFrom(list: CardInst[], uid: number): CardInst {
  const i = list.findIndex((c) => c.uid === uid);
  if (i < 0) throw new Error(`Carta ${uid} não encontrada`);
  return list.splice(i, 1)[0]!;
}

function drawCards(s: GameState, p: PlayerId, n: number, ev: GameEvent[]) {
  const P = s.players[p];
  const drawn = P.deck.splice(0, n);
  P.hand.push(...drawn);
  if (drawn.length) ev.push({ type: 'draw', player: p, uids: drawn.map((c) => c.uid) });
}

function playFromHand(s: GameState, p: PlayerId, move: Extract<Move, { type: 'play' }>, ev: GameEvent[]) {
  const P = s.players[p];
  const c = takeFrom(P.hand, move.uid);
  const d = def(c);

  if (d.type === 'unit' || d.type === 'hero') {
    placeUnit(s, p, c, move.row!, 'hand', ev);
  } else if (d.abilities.includes('horn')) {
    P.horns[move.row!] = c;
    ev.push({ type: 'play', player: p, uid: c.uid, cardId: c.id, from: 'hand' });
    ev.push({ type: 'ability', player: p, cardId: c.id, ability: 'horn', uid: c.uid });
  } else if (d.abilities.includes('decoy')) {
    for (const row of ROWS) {
      const i = P.rows[row].findIndex((t) => t.uid === move.target);
      if (i < 0) continue;
      const [t] = P.rows[row].splice(i, 1, c);
      t!.owner = p;
      P.hand.push(t!);
      ev.push({ type: 'play', player: p, uid: c.uid, cardId: c.id, from: 'hand' });
      ev.push({ type: 'ability', player: p, cardId: c.id, ability: 'decoy', uid: c.uid });
      ev.push({ type: 'return', player: p, uid: t!.uid });
      break;
    }
  } else if (d.type === 'weather') {
    playWeather(s, p, c, ev);
  } else if (d.abilities.includes('scorch')) {
    ev.push({ type: 'play', player: p, uid: c.uid, cardId: c.id, from: 'hand' });
    ev.push({ type: 'ability', player: p, cardId: c.id, ability: 'scorch', uid: c.uid });
    scorchGlobal(s, ev);
    s.players[c.owner].discard.push(c);
  }
}

/** Coloca uma unidade no campo e dispara a habilidade dela. */
function placeUnit(s: GameState, p: PlayerId, c: CardInst, row: Row, from: 'hand' | 'deck' | 'discard', ev: GameEvent[]) {
  const d = def(c);
  const spy = d.abilities.includes('spy');
  s.players[spy ? other(p) : p].rows[row].push(c);
  ev.push({ type: 'play', player: p, uid: c.uid, cardId: c.id, from });

  const shown = d.abilities.find((a) => a !== 'agile');
  if (shown) ev.push({ type: 'ability', player: p, cardId: c.id, ability: shown, uid: c.uid });

  if (spy) drawCards(s, p, 2, ev);
  if (d.abilities.includes('muster')) muster(s, p, c, ev);
  if (d.abilities.includes('scorch_close')) scorchRow(s, other(p), 'close', ev);
  if (d.abilities.includes('medic')) startMedic(s, p, ev);
}

/** Convocar: joga na hora as cartas do mesmo grupo que estiverem no baralho E na mão. */
function muster(s: GameState, p: PlayerId, c: CardInst, ev: GameEvent[]) {
  const P = s.players[p];
  const group = musterGroup(def(c).name);
  // só cartas que também têm Convocar entram (ex.: Havekar Healer não vem junto com o Smuggler)
  const same = (x: CardInst) => has(x, 'muster') && musterGroup(def(x).name) === group;
  for (const [list, from] of [[P.deck, 'deck'], [P.hand, 'hand']] as const) {
    for (const x of list.filter(same)) {
      takeFrom(list, x.uid);
      P.rows[def(x).rows[0] ?? 'close'].push(x);
      ev.push({ type: 'play', player: p, uid: x.uid, cardId: x.id, from });
    }
  }
}

function startMedic(s: GameState, p: PlayerId, ev: GameEvent[]) {
  const options = s.players[p].discard.filter(isPlainUnit);
  if (!options.length) return;
  if (passiveOn(s, 'random_medic')) {
    const c = pick(s, options)!;
    takeFrom(s.players[p].discard, c.uid);
    placeUnit(s, p, c, def(c).rows[0]!, 'discard', ev);
  } else {
    s.pending = { player: p, source: 'medic', optional: true };
  }
}

function resolvePending(s: GameState, uid: number | null, ev: GameEvent[]) {
  const pd = s.pending!;
  s.pending = null; // limpa antes: o médico revivido pode abrir outra escolha
  if (uid === null) return;
  const p = pd.player;
  const P = s.players[p];
  switch (pd.source) {
    case 'medic': {
      const c = takeFrom(P.discard, uid);
      placeUnit(s, p, c, def(c).rows[0]!, 'discard', ev);
      break;
    }
    case 'own_discard': {
      P.hand.push(takeFrom(P.discard, uid));
      ev.push({ type: 'draw', player: p, uids: [uid] });
      break;
    }
    case 'opp_discard': {
      const c = takeFrom(s.players[other(p)].discard, uid);
      c.owner = p;
      P.hand.push(c);
      ev.push({ type: 'draw', player: p, uids: [uid] });
      break;
    }
    case 'deck_weather': {
      playWeather(s, p, takeFrom(P.deck, uid), ev, 'deck');
      break;
    }
    case 'own_hand': {
      P.discard.push(takeFrom(P.hand, uid));
      ev.push({ type: 'discard', player: p, uid });
      break;
    }
    case 'deck_any': {
      P.hand.push(takeFrom(P.deck, uid));
      ev.push({ type: 'draw', player: p, uids: [uid] });
      break;
    }
  }
  // escolhas em etapas: repete a mesma fonte ou passa para a próxima
  if (!s.pending) {
    const left = (pd.count ?? 1) - 1;
    if (left > 0) s.pending = { ...pd, count: left };
    else if (pd.then) s.pending = { player: p, source: pd.then, optional: false };
  }
}

function playWeather(s: GameState, p: PlayerId, c: CardInst, ev: GameEvent[], from: 'hand' | 'deck' = 'hand') {
  const d = def(c);
  ev.push({ type: 'play', player: p, uid: c.uid, cardId: c.id, from });
  ev.push({ type: 'ability', player: p, cardId: c.id, ability: d.abilities[0]!, uid: c.uid });
  if (d.abilities.includes('weather_clear')) {
    clearWeather(s);
    s.players[c.owner].discard.push(c);
  } else if (s.weather.some((w) => def(w).id === d.id)) {
    s.players[c.owner].discard.push(c); // esse clima já está em jogo
  } else {
    s.weather.push(c);
  }
}

/** Carta que sai do campo vai para o descarte do lado onde estava (espião vai para o do oponente). */
function toDiscardOf(s: GameState, side: PlayerId, c: CardInst) {
  c.owner = side;
  s.players[side].discard.push(c);
}

function clearWeather(s: GameState) {
  for (const w of s.weather) s.players[w.owner].discard.push(w);
  s.weather = [];
}

// ---------------------------------------------------------------- queimar

function destroy(s: GameState, victims: { p: PlayerId; row: Row; uid: number }[], ev: GameEvent[]) {
  if (!victims.length) return;
  for (const v of victims) {
    const c = takeFrom(s.players[v.p].rows[v.row], v.uid);
    toDiscardOf(s, v.p, c);
  }
  ev.push({ type: 'destroy', uids: victims.map((v) => v.uid) });
}

function strongestIn(s: GameState, cells: { p: PlayerId; row: Row }[]) {
  let max = 0;
  const all: { p: PlayerId; row: Row; uid: number; v: number }[] = [];
  for (const { p, row } of cells) {
    const str = rowStrengths(s, p, row);
    s.players[p].rows[row].forEach((c, i) => {
      if (!isPlainUnit(c)) return;
      all.push({ p, row, uid: c.uid, v: str[i]! });
      max = Math.max(max, str[i]!);
    });
  }
  return max > 0 ? all.filter((x) => x.v === max) : [];
}

function scorchGlobal(s: GameState, ev: GameEvent[]) {
  const cells = ([0, 1] as PlayerId[]).flatMap((p) => ROWS.map((row) => ({ p, row })));
  destroy(s, strongestIn(s, cells), ev);
}

function scorchRow(s: GameState, target: PlayerId, row: Row, ev: GameEvent[]) {
  if (rowScore(s, target, row) < 10) return;
  destroy(s, strongestIn(s, [{ p: target, row }]), ev);
}

// ---------------------------------------------------------------- líderes

function useLeader(s: GameState, p: PlayerId, ev: GameEvent[]) {
  const P = s.players[p];
  const a = leaderAbility(P.leader);
  P.leaderUsed = true;
  ev.push({ type: 'ability', player: p, cardId: P.leader, ability: 'leader' });

  switch (a.kind) {
    case 'pull_weather': {
      const c = P.deck.find((x) => has(x, a.ability))!;
      playWeather(s, p, takeFrom(P.deck, c.uid), ev, 'deck');
      break;
    }
    case 'pick_weather':
      s.pending = { player: p, source: 'deck_weather', optional: false };
      break;
    case 'clear_weather':
      clearWeather(s);
      break;
    case 'scorch_row':
      scorchRow(s, other(p), a.row, ev);
      break;
    case 'horn':
      P.horns[a.row] = 'leader';
      break;
    case 'reveal': {
      const hand = [...s.players[other(p)].hand];
      shuffle(s, hand);
      ev.push({ type: 'reveal', player: p, cardIds: hand.slice(0, 3).map((c) => c.id) });
      break;
    }
    case 'steal_discard':
      s.pending = { player: p, source: 'opp_discard', optional: false };
      break;
    case 'restore_discard':
      s.pending = { player: p, source: 'own_discard', optional: false };
      break;
    case 'discard_draw':
      s.pending = { player: p, source: 'own_hand', optional: false, count: 2, then: 'deck_any' };
      break;
    case 'move_agile': {
      // move cada unidade ágil para a fileira (corpo a corpo / distância) onde ela vale mais
      for (const from of ['close', 'ranged'] as Row[]) {
        const to: Row = from === 'close' ? 'ranged' : 'close';
        for (const c of [...P.rows[from]]) {
          if (!has(c, 'agile') || isHero(c)) continue;
          const before = score(s, p);
          takeFrom(P.rows[from], c.uid);
          P.rows[to].push(c);
          if (score(s, p) <= before) P.rows[from].push(takeFrom(P.rows[to], c.uid));
        }
      }
      break;
    }
  }
}

// ---------------------------------------------------------------- fim de rodada

function endRound(s: GameState, ev: GameEvent[]) {
  const scores: [number, number] = [score(s, 0), score(s, 1)];
  let w: PlayerId | 'draw' = scores[0] > scores[1] ? 0 : scores[1] > scores[0] ? 1 : 'draw';

  if (w === 'draw') {
    // Nilfgaard vence empates
    const ng = ([0, 1] as PlayerId[]).filter((p) => s.players[p].faction === 'nilfgaard');
    if (ng.length === 1) {
      w = ng[0]!;
      ev.push({ type: 'faction', player: w, faction: 'nilfgaard' });
    }
  }
  if (w === 'draw') { s.players[0].gems--; s.players[1].gems--; }
  else s.players[other(w)].gems--;
  s.roundWinners.push(w);
  ev.push({ type: 'round', winner: w, scores, round: s.round });

  // Reinos do Norte compram 1 carta ao vencer uma rodada
  if (w !== 'draw' && s.players[w].faction === 'northern') {
    ev.push({ type: 'faction', player: w, faction: 'northern' });
    drawCards(s, w, 1, ev);
  }

  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    // Monstros mantêm uma unidade aleatória no campo
    let kept: { row: Row; c: CardInst } | null = null;
    if (P.faction === 'monsters') {
      const units = ROWS.flatMap((row) => P.rows[row].filter((c) => def(c).type !== 'special').map((c) => ({ row, c })));
      kept = pick(s, units) ?? null;
      if (kept) ev.push({ type: 'faction', player: p, faction: 'monsters' });
    }
    for (const row of ROWS) {
      for (const c of P.rows[row]) if (c !== kept?.c) toDiscardOf(s, p, c);
      const h = P.horns[row];
      if (h && h !== 'leader') s.players[h.owner].discard.push(h);
      P.rows[row] = [];
      P.horns[row] = null;
    }
    if (kept) P.rows[kept.row].push(kept.c);
    P.passed = false;
  }
  clearWeather(s);

  const [g0, g1] = [s.players[0].gems, s.players[1].gems];
  if (g0 <= 0 || g1 <= 0) {
    s.winner = g0 > 0 ? 0 : g1 > 0 ? 1 : 'draw';
    ev.push({ type: 'game', winner: s.winner });
    return;
  }
  s.round++;
  // quem perdeu a rodada começa a próxima; em empate, alterna
  s.starter = w === 'draw' ? other(s.starter) : other(w);
  s.turn = s.starter;
}

