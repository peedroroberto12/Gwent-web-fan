import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/basic';
import { applyMove, createGame, legalMoves } from '../src/engine';

describe('IA', () => {
  it('joga partidas completas contra si mesma, sempre com jogadas legais', () => {
    const wins = { 0: 0, 1: 0, draw: 0 };
    for (let seed = 1; seed <= 30; seed++) {
      let s = createGame({ factions: ['northern', 'nilfgaard'], seed });
      let guard = 0;
      while (s.winner === null && guard++ < 300) {
        const actor = s.pending ? s.pending.player : s.turn;
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
