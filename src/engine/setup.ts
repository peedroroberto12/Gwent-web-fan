import { CARDS, type Faction } from '../data/cards';
import { leaderAbility } from './leaders';
import { pick, rand, shuffle } from './rng';
import type { CardInst, GameState, PlayerId, PlayerState } from './types';

/** Neutras incluídas no baralho padrão (id -> cópias). */
const NEUTRALS: Record<string, number> = {
  'geralt-of-rivia': 1,
  'cirilla-fiona-elen-riannon': 1,
  'yennefer-of-vengerberg': 1,
  'triss-merigold': 1,
  'mysterious-elf': 1,
  dandelion: 1,
  villentretenmerth: 1,
  vesemir: 1,
  'zoltan-chivay': 1,
  'biting-frost': 1,
  'impenetrable-fog': 1,
  'torrential-rain': 1,
  'clear-weather': 1,
  'commander-s-horn': 2,
  decoy: 2,
  scorch: 2,
};

/** Baralho padrão de uma facção: todas as unidades dela (com cópias) + neutras. */
export function defaultDeck(faction: Faction): string[] {
  const ids: string[] = [];
  for (const c of CARDS) {
    if (c.faction === faction && (c.type === 'unit' || c.type === 'hero')) {
      for (let i = 0; i < c.copies; i++) ids.push(c.id);
    }
  }
  for (const [id, n] of Object.entries(NEUTRALS)) for (let i = 0; i < n; i++) ids.push(id);
  return ids;
}

export function factionLeaders(faction: Faction): string[] {
  return CARDS.filter(
    (c) => c.faction === faction && c.type === 'leader' && leaderAbility(c.id).kind !== 'unimplemented',
  ).map((c) => c.id);
}

export interface GameOptions {
  factions: [Faction, Faction];
  leaders?: [string?, string?];
  decks?: [string[]?, string[]?];
  seed?: number;
  handSize?: number;
  /** Pular a escolha de quem começa e a troca de cartas (usado nos testes). */
  skipOpening?: boolean;
}

export function createGame(opts: GameOptions): GameState {
  const s: GameState = {
    phase: 'redraw',
    firstChooser: null,
    redraws: [2, 2],
    redrawDone: [false, false],
    players: [emptyPlayer(opts.factions[0]), emptyPlayer(opts.factions[1])],
    weather: [],
    turn: 0,
    round: 1,
    starter: 0,
    pending: null,
    winner: null,
    roundWinners: [],
    seed: (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) | 0,
    nextUid: 1,
  };

  for (const p of [0, 1] as PlayerId[]) {
    const P = s.players[p];
    P.leader = opts.leaders?.[p] ?? pick(s, factionLeaders(P.faction)) ?? '';
    const ids = opts.decks?.[p] ?? defaultDeck(P.faction);
    const deck: CardInst[] = ids.map((id) => ({ uid: s.nextUid++, id, owner: p }));
    P.deck = shuffle(s, deck);
    const ability = leaderAbility(P.leader);
    const extra = ability.kind === 'passive' && ability.effect === 'extra_card' ? 1 : 0;
    P.hand = P.deck.splice(0, (opts.handSize ?? 10) + extra);
  }

  // cara ou coroa; se só um lado é Scoia'tael, ele escolhe quem começa
  s.starter = rand(s) < 0.5 ? 0 : 1;
  s.turn = s.starter;
  const scoia = ([0, 1] as PlayerId[]).filter((p) => s.players[p].faction === 'scoiatael');
  if (scoia.length === 1) {
    s.phase = 'first';
    s.firstChooser = scoia[0]!;
  }
  if (opts.skipOpening) s.phase = 'play';
  return s;
}

function emptyPlayer(faction: Faction): PlayerState {
  return {
    faction,
    leader: '',
    leaderUsed: false,
    deck: [],
    hand: [],
    discard: [],
    rows: { close: [], ranged: [], siege: [] },
    horns: { close: null, ranged: null, siege: null },
    passed: false,
    gems: 2,
  };
}
