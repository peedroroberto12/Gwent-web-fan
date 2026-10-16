// Regras de montagem de baralho do Gwent do Witcher 3:
//   - pelo menos 22 unidades (unidades comuns + heróis)
//   - no máximo 10 cartas especiais (clima + especiais)
//   - cada carta respeita o número de cópias que existe dela
//   - só cartas da facção escolhida + neutras
import { CARDS, getCard, type CardDef, type Faction } from '../data/cards';

export const MIN_UNITS = 22;
export const MAX_SPECIALS = 10;

export interface DeckStats {
  total: number;
  units: number;
  specials: number;
  heroes: number;
  strength: number;
}

const isUnit = (c: CardDef) => c.type === 'unit' || c.type === 'hero';
const isSpecial = (c: CardDef) => c.type === 'special' || c.type === 'weather';

/** Cartas que podem entrar num baralho da facção (sem líderes). */
export function collectionFor(faction: Faction): CardDef[] {
  return CARDS.filter((c) => c.type !== 'leader' && (c.faction === faction || c.faction === 'neutral'));
}

export function deckStats(ids: string[]): DeckStats {
  const cards = ids.map(getCard);
  return {
    total: cards.length,
    units: cards.filter(isUnit).length,
    specials: cards.filter(isSpecial).length,
    heroes: cards.filter((c) => c.type === 'hero').length,
    strength: cards.filter(isUnit).reduce((a, c) => a + (c.strength ?? 0), 0),
  };
}

export function countOf(ids: string[], id: string): number {
  return ids.reduce((n, x) => n + (x === id ? 1 : 0), 0);
}

/** Pode adicionar mais uma cópia desta carta? */
export function canAdd(ids: string[], faction: Faction, id: string): boolean {
  const c = getCard(id);
  if (c.type === 'leader' || (c.faction !== faction && c.faction !== 'neutral')) return false;
  if (countOf(ids, id) >= c.copies) return false;
  if (isSpecial(c) && deckStats(ids).specials >= MAX_SPECIALS) return false;
  return true;
}

/** Problemas que impedem começar a partida com este baralho (vazio = válido). */
export function deckProblems(ids: string[], faction: Faction): string[] {
  const s = deckStats(ids);
  const problems: string[] = [];
  if (s.units < MIN_UNITS) problems.push(`Faltam ${MIN_UNITS - s.units} unidade(s) (mínimo ${MIN_UNITS}).`);
  if (s.specials > MAX_SPECIALS) problems.push(`Especiais demais: ${s.specials}/${MAX_SPECIALS}.`);
  const seen = new Map<string, number>();
  for (const id of ids) seen.set(id, (seen.get(id) ?? 0) + 1);
  for (const [id, n] of seen) {
    const c = getCard(id);
    if (c.faction !== faction && c.faction !== 'neutral') problems.push(`${c.name} não é desta facção.`);
    else if (n > c.copies) problems.push(`${c.name}: no máximo ${c.copies} cópia(s).`);
  }
  return problems;
}

/** Ordem do Witcher 3: heróis, depois unidades por força, depois clima e especiais. */
export function sortForDisplay(a: CardDef, b: CardDef): number {
  const rank = (c: CardDef) => (c.type === 'hero' ? 0 : c.type === 'unit' ? 1 : c.type === 'weather' ? 2 : 3);
  return rank(a) - rank(b) || (b.strength ?? 0) - (a.strength ?? 0) || a.name.localeCompare(b.name);
}
