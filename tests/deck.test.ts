import { describe, expect, it } from 'vitest';
import type { Faction } from '../src/data/cards';
import { canAdd, collectionFor, deckProblems, deckStats, defaultDeck } from '../src/engine';

const factions: Faction[] = ['northern', 'nilfgaard', 'monsters', 'scoiatael'];

describe('montagem de baralho', () => {
  it('o baralho padrão de cada facção é válido', () => {
    for (const f of factions) expect(deckProblems(defaultDeck(f), f)).toEqual([]);
  });

  it('exige pelo menos 22 unidades', () => {
    expect(deckProblems(['ves', 'ves'], 'northern')[0]).toMatch(/Faltam 20/);
  });

  it('limita as especiais a 10', () => {
    const deck = [...defaultDeck('northern')];
    expect(deckStats(deck).specials).toBe(10);
    expect(canAdd(deck, 'northern', 'scorch')).toBe(false);
  });

  it('respeita o número de cópias', () => {
    const deck = Array(5).fill('blue-stripes-commando');
    expect(canAdd(deck, 'northern', 'blue-stripes-commando')).toBe(false);
    expect(canAdd(['ves'], 'northern', 'ves')).toBe(false);
  });

  it('não aceita cartas de outra facção', () => {
    expect(canAdd([], 'northern', 'albrich')).toBe(false);
    expect(canAdd([], 'northern', 'geralt-of-rivia')).toBe(true);
    expect(collectionFor('northern').some((c) => c.faction === 'nilfgaard')).toBe(false);
  });
});
