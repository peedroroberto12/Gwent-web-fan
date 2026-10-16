import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/basic';
import { actorOf, applyMove, createGame, legalMoves, type Faction } from '../src/engine';

function setup(hand: string[], discard: string[] = []) {
  const s = createGame({ factions: ['northern', 'nilfgaard'], decks: [[], []], handSize: 0, seed: 1, skipOpening: true });
  s.turn = 1;
  s.players[1].hand = hand.map((id) => ({ uid: s.nextUid++, id, owner: 1 as const }));
  s.players[1].discard = discard.map((id) => ({ uid: s.nextUid++, id, owner: 1 as const }));
  s.players[0].hand = [{ uid: s.nextUid++, id: 'ves', owner: 0 }, { uid: s.nextUid++, id: 'ves', owner: 0 }];
  s.players[1].leaderUsed = true;
  return s;
}
const playedId = (s: ReturnType<typeof setup>, m: ReturnType<typeof chooseMove>) =>
  m.type === 'play' ? s.players[1].hand.find((c) => c.uid === m.uid)?.id : m.type;

describe('IA: uso das cartas especiais', () => {
  it('não joga médico (Yennefer) sem ninguém para reviver', () => {
    const s = setup(['yennefer-of-vengerberg', 'cahir-mawr-dyffryn-aep-ceallach']);
    expect(playedId(s, chooseMove(s, 1))).toBe('cahir-mawr-dyffryn-aep-ceallach');
  });

  it('joga o médico quando há uma boa unidade no descarte', () => {
    const s = setup(['siege-technician', 'vreemde'], ['black-infantry-archer-1']);
    expect(playedId(s, chooseMove(s, 1))).toBe('siege-technician');
  });

  it('não usa Queimar quando ele destruiria mais força dela do que do oponente', () => {
    const s = setup(['scorch', 'vreemde']);
    s.players[1].rows.ranged.push({ uid: 900, id: 'black-infantry-archer-1', owner: 1 });
    s.players[0].rows.close.push({ uid: 901, id: 'ves', owner: 0 });
    expect(playedId(s, chooseMove(s, 1))).not.toBe('scorch');
  });

  it('não joga clima que prejudica mais a ela mesma', () => {
    const s = setup(['torrential-rain', 'vreemde']);
    s.players[1].rows.siege.push({ uid: 900, id: 'heavy-zerrikanian-fire-scorpion', owner: 1 });
    expect(playedId(s, chooseMove(s, 1))).not.toBe('torrential-rain');
  });
});

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
