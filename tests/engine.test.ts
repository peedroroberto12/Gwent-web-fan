import { describe, expect, it } from 'vitest';
import type { Faction, Row } from '../src/data/cards';
import {
  applyMove,
  createGame,
  defaultDeck,
  legalMoves,
  rowScore,
  rowStrengths,
  score,
  type GameState,
  type PlayerId,
} from '../src/engine';

// ---------- helpers: monta um estado controlado ----------

interface Setup {
  factions?: [Faction, Faction];
  leaders?: [string, string];
  hand0?: string[];
  hand1?: string[];
  deck0?: string[];
  deck1?: string[];
}

function game(o: Setup = {}): GameState {
  const s = createGame({
    factions: o.factions ?? ['northern', 'nilfgaard'],
    leaders: o.leaders ?? ['foltest-lord-commander-of-the-north', 'emhyr-var-emreis-emperor-of-nilfgaard'],
    decks: [[], []],
    handSize: 0,
    seed: 42,
    skipOpening: true,
  });
  s.turn = 0;
  s.starter = 0;
  const mk = (owner: PlayerId) => (id: string) => ({ uid: s.nextUid++, id, owner });
  s.players[0].hand = (o.hand0 ?? []).map(mk(0));
  s.players[1].hand = (o.hand1 ?? ['vreemde']).map(mk(1));
  s.players[0].deck = (o.deck0 ?? []).map(mk(0));
  s.players[1].deck = (o.deck1 ?? []).map(mk(1));
  return s;
}

/** Coloca cartas direto no campo. */
function put(s: GameState, p: PlayerId, row: Row, ...ids: string[]) {
  for (const id of ids) s.players[p].rows[row].push({ uid: s.nextUid++, id, owner: p });
}

function play(s: GameState, id: string, extra: { row?: Row; target?: number } = {}) {
  const c = s.players[s.turn].hand.find((x) => x.id === id);
  if (!c) throw new Error(`${id} não está na mão`);
  return applyMove(s, { type: 'play', uid: c.uid, ...extra });
}

const ids = (list: { id: string }[]) => list.map((c) => c.id);

// ---------- pontuação ----------

describe('pontuação', () => {
  it('soma a força base', () => {
    const s = game();
    put(s, 0, 'close', 'ves', 'siegfried-of-denesle'); // 5 + 5
    expect(rowScore(s, 0, 'close')).toBe(10);
  });

  it('clima reduz a 1, mas não afeta heróis', () => {
    const s = game({ hand0: ['biting-frost'] });
    put(s, 0, 'close', 'ves', 'john-natalis');
    const { state } = play(s, 'biting-frost');
    expect(rowStrengths(state, 0, 'close')).toEqual([1, 10]);
  });

  it('vínculo forte multiplica pelo número de cópias', () => {
    const s = game();
    put(s, 0, 'close', 'blue-stripes-commando', 'blue-stripes-commando', 'blue-stripes-commando');
    expect(rowStrengths(s, 0, 'close')).toEqual([12, 12, 12]);
  });

  it('moral dá +1 às outras unidades da fileira', () => {
    const s = game();
    put(s, 0, 'siege', 'kaedweni-siege-expert', 'ballista-1');
    expect(rowStrengths(s, 0, 'siege')).toEqual([1, 7]);
  });

  it('trompa dobra a fileira, e Dandelion não dobra a si mesmo', () => {
    const s = game();
    put(s, 0, 'close', 'dandelion', 'ves');
    expect(rowStrengths(s, 0, 'close')).toEqual([2, 10]);
  });

  it('ordem: clima -> vínculo -> moral -> trompa', () => {
    const s = game();
    put(s, 0, 'siege', 'catapult', 'catapult', 'kaedweni-siege-expert');
    s.players[0].horns.siege = 'leader';
    // catapulta: 8 -> vínculo ×2 = 16 -> moral +1 = 17 -> trompa ×2 = 34
    expect(rowStrengths(s, 0, 'siege')).toEqual([34, 34, 2]);
  });
});

// ---------- habilidades ----------

describe('habilidades', () => {
  it('espião vai para o lado do oponente e compra 2', () => {
    const s = game({ hand0: ['prince-stennis'], deck0: ['ves', 'ves', 'ves'] });
    const { state, events } = play(s, 'prince-stennis', { row: 'close' });
    expect(ids(state.players[1].rows.close)).toEqual(['prince-stennis']);
    expect(state.players[0].hand).toHaveLength(2);
    expect(state.players[0].deck).toHaveLength(1);
    expect(events.some((e) => e.type === 'ability' && e.ability === 'spy')).toBe(true);
  });

  it('médico abre escolha e revive a unidade escolhida', () => {
    const s = game({ hand0: ['dun-banner-medic'] });
    s.players[0].discard.push({ uid: 900, id: 'ves', owner: 0 }, { uid: 901, id: 'john-natalis', owner: 0 });
    const r1 = play(s, 'dun-banner-medic', { row: 'siege' });
    expect(r1.state.pending?.source).toBe('medic');
    // herói não pode ser revivido
    expect(legalMoves(r1.state)).toEqual([{ type: 'choose', uid: 900 }, { type: 'choose', uid: null }]);
    const r2 = applyMove(r1.state, { type: 'choose', uid: 900 });
    expect(ids(r2.state.players[0].rows.close)).toEqual(['ves']);
    expect(r2.state.pending).toBeNull();
    expect(r2.state.turn).toBe(1);
  });

  it('médico reviver um espião dispara o espião', () => {
    const s = game({ hand0: ['dun-banner-medic'], deck0: ['ves', 'ves'] });
    s.players[0].discard.push({ uid: 900, id: 'thaler', owner: 0 });
    const r1 = play(s, 'dun-banner-medic', { row: 'siege' });
    const r2 = applyMove(r1.state, { type: 'choose', uid: 900 });
    expect(ids(r2.state.players[1].rows.siege)).toEqual(['thaler']);
    expect(r2.state.players[0].hand).toHaveLength(2);
  });

  it('convocar puxa do baralho as cartas do mesmo grupo', () => {
    const s = game({
      factions: ['monsters', 'nilfgaard'],
      hand0: ['arachas-1'],
      deck0: ['arachas-2', 'arachas-behemoth', 'ghoul-1'],
    });
    const { state } = play(s, 'arachas-1', { row: 'close' });
    expect(ids(state.players[0].rows.close).sort()).toEqual(['arachas-1', 'arachas-2']);
    expect(ids(state.players[0].rows.siege)).toEqual(['arachas-behemoth']);
    expect(ids(state.players[0].deck)).toEqual(['ghoul-1']);
  });

  it('convocar também puxa as cartas do grupo que estão na mão (as 3 Moiras)', () => {
    const s = game({
      factions: ['monsters', 'nilfgaard'],
      hand0: ['crone-brewess', 'crone-weavess', 'ghoul-1'],
      deck0: ['crone-whispess', 'nekker-1'],
    });
    const { state } = play(s, 'crone-brewess', { row: 'close' });
    expect(ids(state.players[0].rows.close).sort()).toEqual(['crone-brewess', 'crone-weavess', 'crone-whispess']);
    expect(ids(state.players[0].hand)).toEqual(['ghoul-1']);
    expect(ids(state.players[0].deck)).toEqual(['nekker-1']);
  });

  it('isca troca de lugar com uma unidade, que volta para a mão', () => {
    const s = game({ hand0: ['decoy'] });
    put(s, 0, 'close', 'ves');
    const target = s.players[0].rows.close[0]!.uid;
    const { state } = play(s, 'decoy', { target });
    expect(ids(state.players[0].rows.close)).toEqual(['decoy']);
    expect(ids(state.players[0].hand)).toEqual(['ves']);
  });

  it('isca não pode pegar heróis', () => {
    const s = game({ hand0: ['decoy'] });
    put(s, 0, 'close', 'john-natalis');
    expect(legalMoves(s).filter((m) => m.type === 'play')).toEqual([]);
  });

  it('isca pode recuperar o espião do oponente no seu lado', () => {
    const s = game({ hand0: ['decoy'] });
    s.players[0].rows.close.push({ uid: 950, id: 'stefan-skellen', owner: 1 });
    const { state } = play(s, 'decoy', { target: 950 });
    expect(state.players[0].hand[0]).toMatchObject({ id: 'stefan-skellen', owner: 0 });
  });

  it('queimar destrói as mais fortes dos dois lados, poupando heróis', () => {
    const s = game({ hand0: ['scorch'] });
    put(s, 0, 'close', 'ves', 'john-natalis'); //  5, herói 10
    put(s, 1, 'close', 'rainfarn'); //              4
    put(s, 1, 'ranged', 'assire-var-anahid'); //    6  <- mais forte
    put(s, 1, 'siege', 'siege-engineer'); //        6  <- empate
    const { state, events } = play(s, 'scorch');
    expect(ids(state.players[1].rows.ranged)).toEqual([]);
    expect(ids(state.players[1].rows.siege)).toEqual([]);
    expect(ids(state.players[0].rows.close)).toEqual(['ves', 'john-natalis']);
    expect(events.find((e) => e.type === 'destroy')).toMatchObject({ uids: expect.any(Array) });
    expect(ids(state.players[0].discard)).toEqual(['scorch']);
  });

  it('Villentretenmerth só queima se o corpo a corpo inimigo somar 10+', () => {
    const fraco = game({ hand0: ['villentretenmerth'] });
    put(fraco, 1, 'close', 'rainfarn', 'morteisen'); // 7
    expect(ids(play(fraco, 'villentretenmerth', { row: 'close' }).state.players[1].rows.close)).toHaveLength(2);

    const forte = game({ hand0: ['villentretenmerth'] });
    put(forte, 1, 'close', 'rainfarn', 'cahir-mawr-dyffryn-aep-ceallach'); // 4 + 6
    expect(ids(play(forte, 'villentretenmerth', { row: 'close' }).state.players[1].rows.close)).toEqual(['rainfarn']);
  });

  it('clima repetido vai para o descarte; tempo limpo remove tudo', () => {
    const s = game({ hand0: ['biting-frost', 'biting-frost', 'clear-weather'], hand1: ['vreemde', 'vreemde'] });
    let r = play(s, 'biting-frost');
    r = applyMove(r.state, { type: 'play', uid: r.state.players[1].hand[0]!.uid, row: 'close' });
    r = play(r.state, 'biting-frost');
    expect(r.state.weather).toHaveLength(1);
    expect(r.state.players[0].discard).toHaveLength(1);
    r = applyMove(r.state, { type: 'play', uid: r.state.players[1].hand[0]!.uid, row: 'close' });
    r = play(r.state, 'clear-weather');
    expect(r.state.weather).toHaveLength(0);
    expect(r.state.players[0].discard).toHaveLength(3);
  });

  it('trompa especial só entra em fileira sem trompa', () => {
    const s = game({ hand0: ['commander-s-horn'] });
    s.players[0].horns.close = 'leader';
    const rows = legalMoves(s).filter((m) => m.type === 'play').map((m) => (m as { row: Row }).row);
    expect(rows).toEqual(['ranged', 'siege']);
  });
});

// ---------- líderes ----------

describe('líderes', () => {
  it('Destroyer of Worlds: descarta 2 da mão e escolhe 1 do baralho', () => {
    const s = game({
      factions: ['monsters', 'nilfgaard'],
      leaders: ['eredin-destroyer-of-worlds', 'emhyr-var-emreis-emperor-of-nilfgaard'],
      hand0: ['ghoul-1', 'nekker-1', 'arachas-1'],
      deck0: ['draug', 'ghoul-2'],
    });
    let r = applyMove(s, { type: 'leader' });
    expect(r.state.pending).toMatchObject({ source: 'own_hand', count: 2 });
    r = applyMove(r.state, { type: 'choose', uid: r.state.players[0].hand[0]!.uid });
    expect(r.state.pending).toMatchObject({ source: 'own_hand', count: 1 });
    r = applyMove(r.state, { type: 'choose', uid: r.state.players[0].hand[0]!.uid });
    expect(r.state.pending?.source).toBe('deck_any');
    const draug = r.state.players[0].deck.find((c) => c.id === 'draug')!;
    r = applyMove(r.state, { type: 'choose', uid: draug.uid });
    expect(ids(r.state.players[0].hand).sort()).toEqual(['arachas-1', 'draug']);
    expect(ids(r.state.players[0].discard).sort()).toEqual(['ghoul-1', 'nekker-1']);
    expect(r.state.turn).toBe(1);
  });

  it('Siegemaster põe trompa no cerco', () => {
    const s = game({ leaders: ['foltest-the-siegemaster', 'emhyr-var-emreis-emperor-of-nilfgaard'] });
    put(s, 0, 'siege', 'ballista-1');
    const { state } = applyMove(s, { type: 'leader' });
    expect(rowScore(state, 0, 'siege')).toBe(12);
    expect(state.players[0].leaderUsed).toBe(true);
    expect(legalMoves(state).some((m) => m.type === 'leader')).toBe(false);
  });

  it('Son of Medell queima a mais forte à distância se somar 10+', () => {
    const s = game({ leaders: ['foltest-son-of-medell', 'emhyr-var-emreis-emperor-of-nilfgaard'] });
    put(s, 1, 'ranged', 'assire-var-anahid', 'cynthia'); // 6 + 4
    const { state } = applyMove(s, { type: 'leader' });
    expect(ids(state.players[1].rows.ranged)).toEqual(['cynthia']);
  });

  it('King of Temeria joga a névoa do baralho', () => {
    const s = game({ leaders: ['foltest-king-of-temeria', 'emhyr-var-emreis-emperor-of-nilfgaard'], deck0: ['ves', 'impenetrable-fog'] });
    const { state } = applyMove(s, { type: 'leader' });
    expect(ids(state.weather)).toEqual(['impenetrable-fog']);
    expect(ids(state.players[0].deck)).toEqual(['ves']);
  });

  it('Emperor revela até 3 cartas da mão inimiga', () => {
    const s = game({
      leaders: ['foltest-lord-commander-of-the-north', 'emhyr-var-emreis-emperor-of-nilfgaard'],
      hand0: ['ves', 'ves', 'ves', 'ves'],
    });
    s.turn = 1;
    const { events } = applyMove(s, { type: 'leader' });
    const reveal = events.find((e) => e.type === 'reveal');
    expect(reveal).toMatchObject({ player: 1, cardIds: ['ves', 'ves', 'ves'] });
  });

  it('Relentless rouba uma carta do descarte inimigo', () => {
    const s = game({ leaders: ['foltest-lord-commander-of-the-north', 'emhyr-var-emreis-the-relentless'] });
    s.players[0].discard.push({ uid: 900, id: 'ves', owner: 0 });
    s.turn = 1;
    const r1 = applyMove(s, { type: 'leader' });
    expect(r1.state.pending?.source).toBe('opp_discard');
    const r2 = applyMove(r1.state, { type: 'choose', uid: 900 });
    expect(r2.state.players[1].hand.find((c) => c.uid === 900)?.owner).toBe(1);
  });

  it('White Flame cancela o líder do oponente', () => {
    const s = game({ leaders: ['foltest-the-siegemaster', 'emhyr-var-emreis-the-white-flame'] });
    expect(legalMoves(s).some((m) => m.type === 'leader')).toBe(false);
  });

  it('Invader of the North faz o médico reviver uma carta aleatória', () => {
    const s = game({ leaders: ['foltest-lord-commander-of-the-north', 'emhyr-var-emreis-invader-of-the-north'], hand0: ['dun-banner-medic'] });
    s.players[0].discard.push({ uid: 900, id: 'ves', owner: 0 });
    const { state } = play(s, 'dun-banner-medic', { row: 'siege' });
    expect(state.pending).toBeNull();
    expect(ids(state.players[0].rows.close)).toEqual(['ves']);
  });
});

// ---------- rodadas e partida ----------

describe('rodadas', () => {
  function bothPass(s: GameState) {
    let r = applyMove(s, { type: 'pass' });
    r = applyMove(r.state, { type: 'pass' });
    return r;
  }

  it('quem passou não joga mais; o outro continua', () => {
    const s = game({ hand0: ['ves'], hand1: ['vreemde', 'vreemde'] });
    const r = applyMove(s, { type: 'pass' });
    const r2 = applyMove(r.state, { type: 'play', uid: r.state.players[1].hand[0]!.uid, row: 'close' });
    expect(r2.state.turn).toBe(1);
  });

  it('vencedor tira uma gema do perdedor e o campo é limpo', () => {
    const s = game();
    put(s, 0, 'close', 'ves');
    const { state, events } = bothPass(s);
    expect(state.players[1].gems).toBe(1);
    expect(state.players[0].rows.close).toEqual([]);
    expect(events.find((e) => e.type === 'round')).toMatchObject({ winner: 0, scores: [5, 0] });
  });

  it('Nilfgaard vence empates', () => {
    const { state } = bothPass(game());
    expect(state.players[0].gems).toBe(1);
    expect(state.players[1].gems).toBe(2);
  });

  it('empate sem Nilfgaard: os dois perdem gema', () => {
    const { state } = bothPass(game({ factions: ['northern', 'scoiatael'], leaders: ['foltest-lord-commander-of-the-north', 'francesca-findabair-the-beautiful'] }));
    expect([state.players[0].gems, state.players[1].gems]).toEqual([1, 1]);
  });

  it('espião vai para o descarte do lado onde estava no fim da rodada', () => {
    const s = game();
    s.players[1].rows.close.push({ uid: 990, id: 'prince-stennis', owner: 0 });
    const { state } = bothPass(s);
    expect(state.players[1].discard.find((c) => c.uid === 990)?.owner).toBe(1);
    expect(state.players[0].discard.some((c) => c.uid === 990)).toBe(false);
  });

  it('quem fica sem cartas e sem líder passa automaticamente', () => {
    const s = game({ hand0: ['ves'], hand1: ['vreemde', 'vreemde'] });
    s.players[0].leaderUsed = true;
    let r = play(s, 'ves', { row: 'close' });
    r = applyMove(r.state, { type: 'play', uid: r.state.players[1].hand[0]!.uid, row: 'close' });
    expect(r.state.players[0].passed).toBe(true);
    expect(r.events).toContainEqual({ type: 'pass', player: 0, auto: true });
    expect(r.state.turn).toBe(1);
  });

  it('Reinos do Norte compram 1 carta ao vencer a rodada', () => {
    const s = game({ deck0: ['ves'] });
    put(s, 0, 'close', 'ves');
    const { state } = bothPass(s);
    expect(state.players[0].hand).toHaveLength(1);
  });

  it('a partida acaba quando alguém perde as 2 gemas', () => {
    const s = game();
    s.players[0].gems = 1;
    const { state, events } = bothPass(s); // Nilfgaard vence o empate
    expect(state.winner).toBe(1);
    expect(events.at(-1)).toEqual({ type: 'game', winner: 1 });
    expect(legalMoves(state)).toEqual([]);
  });

  it('jogada inválida é rejeitada e o estado original não muda', () => {
    const s = game({ hand0: ['ves'] });
    const before = JSON.stringify(s);
    expect(() => applyMove(s, { type: 'play', uid: 12345, row: 'close' })).toThrow();
    applyMove(s, { type: 'play', uid: s.players[0].hand[0]!.uid, row: 'close' });
    expect(JSON.stringify(s)).toBe(before);
  });
});

describe('abertura', () => {
  it('cada jogador troca até 2 cartas; a trocada volta ao baralho', () => {
    let s = createGame({ factions: ['northern', 'nilfgaard'], seed: 3 });
    expect(s.phase).toBe('redraw');
    const before = s.players[0].hand[0]!.uid;
    s = applyMove(s, { type: 'redraw', uid: before }).state;
    expect(s.players[0].hand).toHaveLength(10);
    expect(s.players[0].deck.some((c) => c.uid === before)).toBe(true);
    s = applyMove(s, { type: 'redraw', uid: s.players[0].hand[1]!.uid }).state;
    expect(s.redrawDone[0]).toBe(true); // usou as 2 trocas
    expect(legalMoves(s).filter((m) => m.type === 'redraw').length).toBe(10); // vez do jogador 1
    s = applyMove(s, { type: 'keep' }).state;
    expect(s.phase).toBe('play');
    expect(s.turn).toBe(s.starter);
  });

  it("Scoia'tael escolhe quem começa", () => {
    let s = createGame({ factions: ['scoiatael', 'nilfgaard'], seed: 5 });
    expect(s.phase).toBe('first');
    expect(legalMoves(s)).toEqual([{ type: 'first', player: 0 }, { type: 'first', player: 1 }]);
    s = applyMove(s, { type: 'first', player: 1 }).state;
    expect(s.phase).toBe('redraw');
    expect(s.starter).toBe(1);
  });
});

describe('partida completa', () => {
  it('jogadas aleatórias sempre terminam sem erro', () => {
    const fs: Faction[] = ['northern', 'nilfgaard', 'scoiatael', 'monsters'];
    for (let seed = 1; seed <= 40; seed++) {
      const pair: [Faction, Faction] = [fs[seed % 4]!, fs[(seed + 1) % 4]!];
      let s = createGame({ factions: pair, seed });
      let guard = 0;
      while (s.winner === null && guard++ < 500) {
        const moves = legalMoves(s);
        s = applyMove(s, moves[(seed * 7 + guard * 13) % moves.length]!).state;
      }
      expect(s.winner).not.toBeNull();
      // nenhuma carta some ou duplica
      const all = [0, 1].flatMap((p) => {
        const P = s.players[p as PlayerId];
        return [...P.deck, ...P.hand, ...P.discard, ...Object.values(P.rows).flat()];
      });
      expect(new Set(all.map((c) => c.uid)).size).toBe(all.length);
      expect(all.length + s.weather.length).toBe(defaultDeck(pair[0]).length + defaultDeck(pair[1]).length);
      expect(score(s, 0)).toBeGreaterThanOrEqual(0);
    }
  });
});
