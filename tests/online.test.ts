import { describe, expect, it } from 'vitest';
import { chooseMove } from '../src/ai/basic';
import { actorOf, defaultDeck, factionLeaders, type PlayerId } from '../src/engine';
import type { Faction } from '../src/data/cards';
import { memoryHub } from '../src/net/link';
import { memoryStore, newRecord, OnlineMatch, stateHash, type Side, type Store } from '../src/net/match';

const side = (f: Faction): Side => ({ faction: f, leader: factionLeaders(f)[0]!, deck: defaultDeck(f) });
const flush = async (n = 20) => { for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0)); };

function setup(fa: Faction = 'northern', fb: Faction = 'monsters') {
  const net = memoryHub();
  const sa = memoryStore();
  const sb = memoryStore();
  const A = new OnlineMatch(net.join('A'), newRecord('ROOM01', 0, side(fa)), sa);
  const B = new OnlineMatch(net.join('B'), newRecord('ROOM01', 1, side(fb)), sb);
  return { net, A, B, sa, sb };
}

/** Mesmo jogador, conexão nova (a mesma "memória" do aparelho). */
function reattach(m: OnlineMatch, link: ReturnType<ReturnType<typeof memoryHub>['join']>): OnlineMatch {
  const store = memoryStore();
  store.save(m.rec);
  return new OnlineMatch(link, store.load(m.room)!, store);
}

/** Joga pela IA do lado de quem está na vez. */
function step(ms: OnlineMatch[]): boolean {
  for (const m of ms) {
    const s = m.state;
    if (s && s.winner === null && actorOf(s) === m.me) {
      m.local(chooseMove(s, m.me as PlayerId));
      return true;
    }
  }
  return false;
}

async function playOut(ms: OnlineMatch[], limit = 2000) {
  for (let i = 0; i < limit; i++) {
    if (!step(ms)) {
      await flush();
      if (!step(ms) && ms.every((m) => m.state?.winner !== null && m.state?.winner !== undefined)) return;
    }
    await flush(2);
  }
}

describe('partida online', () => {
  it('os dois lados começam com o mesmo estado e terminam iguais', async () => {
    const { A, B } = setup();
    await flush();
    expect(A.state).not.toBeNull();
    expect(stateHash(A.state!)).toBe(stateHash(B.state!));
    await playOut([A, B]);
    expect(A.state!.winner).not.toBeNull();
    expect(stateHash(A.state!)).toBe(stateHash(B.state!));
    expect(A.rec.moves.length).toBe(B.rec.moves.length);
  });

  it('a semente depende dos dois lados', async () => {
    const x = setup();
    const y = setup();
    await flush();
    // mesmos baralhos, sorteios diferentes: mãos diferentes (praticamente sempre)
    expect(JSON.stringify(x.A.state!.players[0].hand)).not.toBe(JSON.stringify(y.A.state!.players[0].hand));
  });

  it('jogadas feitas durante a queda chegam pela sincronização', async () => {
    const { net, A, B } = setup();
    await flush();
    for (let i = 0; i < 8; i++) { step([A, B]); await flush(2); }
    // o B cai da sala; quem estiver na vez joga com o outro fora
    net.drop('B');
    await flush();
    expect(A.status).toBe('away');
    const B2 = reattach(B, net.join('B-volta'));
    step([A]) || step([B2]);
    await flush();
    expect(A.status).toBe('connected');
    expect(stateHash(A.state!)).toBe(stateHash(B2.state!));
    await playOut([A, B2]);
    expect(stateHash(A.state!)).toBe(stateHash(B2.state!));
  });

  it('quem recarregou a página retoma do histórico salvo', async () => {
    const { net, A, B, sb } = setup();
    await flush();
    for (let i = 0; i < 6; i++) { step([A, B]); await flush(2); }
    const before = stateHash(B.state!);
    net.drop('B');
    // "recarrega" o B: id novo na sala, mesmo armazenamento
    const B2 = new OnlineMatch(net.join('B2'), (sb as Store).load('ROOM01')!, sb);
    expect(stateHash(B2.state!)).toBe(before);
    await flush();
    expect(A.status).toBe('connected');
    await playOut([A, B2]);
    expect(stateHash(A.state!)).toBe(stateHash(B2.state!));
  });

  it('quem perdeu o armazenamento recebe a partida do oponente', async () => {
    const { net, A, B } = setup();
    await flush();
    for (let i = 0; i < 6; i++) { step([A, B]); await flush(2); }
    net.drop('B');
    await flush();
    const B2 = new OnlineMatch(net.join('B2'), newRecord('ROOM01', 1, side('monsters')), memoryStore());
    await flush();
    expect(stateHash(B2.state!)).toBe(stateHash(A.state!));
  });

  it('revanche: os dois aceitam e começa uma partida nova', async () => {
    const { A, B } = setup('scoiatael', 'nilfgaard');
    let offers = 0;
    B.on.rematch = () => offers++;
    await flush();
    await playOut([A, B]);
    const first = stateHash(A.state!);
    A.rematch();
    await flush();
    expect(offers).toBe(1);
    expect(A.waitingRematch).toBe(true);
    B.rematch();
    await flush();
    expect(A.started && B.started).toBe(true);
    expect(A.rec.game).toBe(1);
    expect(stateHash(A.state!)).not.toBe(first);
    expect(stateHash(A.state!)).toBe(stateHash(B.state!));
  });

  it('dessincronia é corrigida com o estado do jogador 0', async () => {
    const { A, B } = setup();
    let begins = 0;
    B.on.begin = () => begins++;
    await flush();
    for (let i = 0; i < 4; i++) { step([A, B]); await flush(2); }
    // estraga o estado do B de propósito
    B.state = { ...B.state!, round: 3 };
    for (let i = 0; i < 6; i++) { step([A, B]); await flush(2); }
    expect(begins).toBeGreaterThan(0);
    expect(stateHash(A.state!)).toBe(stateHash(B.state!));
  });

  it('terceiro jogador recebe "sala cheia"', async () => {
    const { net, A, B } = setup();
    await flush();
    let failed = '';
    const C = new OnlineMatch(net.join('C'), newRecord('ROOM01', 1, side('monsters')), memoryStore());
    C.on.fail = (w) => (failed = w);
    await flush();
    expect(failed).toBe('full');
    expect(C.state).toBeNull();
    expect(B.status).toBe('connected');
    step([A, B]);
    await flush();
    expect(stateHash(A.state!)).toBe(stateHash(B.state!));
  });
});
