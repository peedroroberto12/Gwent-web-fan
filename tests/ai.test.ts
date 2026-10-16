import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/basic';
import { actorOf, applyMove, createGame, legalMoves, type Faction } from '../src/engine';

describe('IA', () => {
  it('joga partidas completas contra si mesma, sempre com jogadas legais', () => {
    const wins = { 0: 0, 1: 0, draw: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      const fs: Faction[] = ['northern', 'nilfgaard', 'scoiatael', 'monsters'];
      let s = createGame({ factions: [fs[seed % 4]!, fs[(seed + 2) % 4]!], seed });
      let guard = 0;
      while (s.winner === null && guard++ < 300) {
        const actor = actorOf(s);
        const m = chooseMove(s, actor);
        expect(legalMoves(s)).toContainEqual(m);
        s = applyMove(s, m).state;
      }
      expect(s.winner).not.toBeNull();
      wins[s.winner as 0 | 1 | 'draw']++;
    }
    console.log('vitórias NR x NG x empates:', wins);
  });
});
