// Cálculo de força, na ordem do Witcher 3:
// base -> clima (vira 1) -> espiões dobrados (líder) -> vínculo (×n) -> moral (+1) -> trompa (×2).
// Heróis ignoram tudo.
import { getCard, ROWS, WEATHER_ROW, type Ability, type Row } from '../data/cards';
import { leaderAbility } from './leaders';
import { other, type CardInst, type GameState, type PlayerId } from './types';

export const def = (c: CardInst) => getCard(c.id);
export const has = (c: CardInst, a: Ability) => def(c).abilities.includes(a);
export const isHero = (c: CardInst) => def(c).type === 'hero';
/** Unidade comum (pode ser afetada, revivida, trocada pela isca, queimada). */
export const isPlainUnit = (c: CardInst) => def(c).type === 'unit';

/** Líder do jogador está valendo? (O Chama Branca do oponente cancela.) */
export function leaderActive(s: GameState, p: PlayerId): boolean {
  const opp = leaderAbility(s.players[other(p)].leader);
  return !(opp.kind === 'passive' && opp.effect === 'cancel_leader');
}

export function passiveOn(s: GameState, effect: string, onlyFor?: PlayerId): boolean {
  return ([0, 1] as PlayerId[]).some((p) => {
    if (onlyFor !== undefined && p !== onlyFor) return false;
    const a = leaderAbility(s.players[p].leader);
    return a.kind === 'passive' && a.effect === effect && leaderActive(s, p);
  });
}

export function weatherRows(s: GameState): Set<Row> {
  const rows = new Set<Row>();
  for (const w of s.weather) for (const a of def(w).abilities) {
    const r = WEATHER_ROW[a];
    if (r) rows.add(r);
  }
  return rows;
}

export function rowStrengths(s: GameState, p: PlayerId, row: Row): number[] {
  const P = s.players[p];
  const cards = P.rows[row];
  const bad = weatherRows(s).has(row);
  const doubleSpies = passiveOn(s, 'double_spies');
  const morale = cards.filter((c) => has(c, 'morale')).length;

  return cards.map((c) => {
    const d = def(c);
    if (d.type === 'hero') return d.strength ?? 0;
    if (d.type !== 'unit') return 0; // isca no campo
    let v = d.strength ?? 0;
    if (bad) v = Math.min(v, 1);
    if (doubleSpies && d.abilities.includes('spy')) v *= 2;
    if (d.abilities.includes('tight_bond')) v *= cards.filter((o) => def(o).name === d.name).length;
    v += morale - (d.abilities.includes('morale') ? 1 : 0);
    const horn = P.horns[row] !== null || cards.some((o) => o !== c && has(o, 'horn'));
    if (horn) v *= 2;
    return v;
  });
}

export const rowScore = (s: GameState, p: PlayerId, row: Row) =>
  rowStrengths(s, p, row).reduce((a, b) => a + b, 0);

export const score = (s: GameState, p: PlayerId) => ROWS.reduce((a, r) => a + rowScore(s, p, r), 0);
