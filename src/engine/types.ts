import type { Ability, Faction, Row } from '../data/cards';

export type PlayerId = 0 | 1;
export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Uma cópia concreta de carta na partida. */
export interface CardInst {
  uid: number;
  /** id da definição em src/data/cards.json */
  id: string;
  /** Quem possui a carta (para qual descarte ela vai). */
  owner: PlayerId;
}

/** Trompa numa fileira: uma carta de Trompa, a trompa do líder ou nada. */
export type HornSlot = CardInst | 'leader' | null;

export interface PlayerState {
  faction: Faction;
  leader: string;
  leaderUsed: boolean;
  deck: CardInst[];
  hand: CardInst[];
  discard: CardInst[];
  rows: Record<Row, CardInst[]>;
  horns: Record<Row, HornSlot>;
  passed: boolean;
  gems: number;
}

/** De onde vêm as opções de uma escolha pendente. */
export type PickSource =
  | 'medic' //        unidade do próprio descarte -> jogada no campo
  | 'own_discard' //  carta do próprio descarte -> mão
  | 'opp_discard' //  carta do descarte do oponente -> mão
  | 'deck_weather'; // clima do próprio baralho -> jogado

export interface Pending {
  player: PlayerId;
  source: PickSource;
  optional: boolean;
}

export interface GameState {
  players: [PlayerState, PlayerState];
  weather: CardInst[];
  turn: PlayerId;
  round: number;
  /** Quem começou a rodada atual. */
  starter: PlayerId;
  pending: Pending | null;
  winner: PlayerId | 'draw' | null;
  roundWinners: (PlayerId | 'draw')[];
  seed: number;
  nextUid: number;
}

export type Move =
  | { type: 'play'; uid: number; row?: Row; target?: number }
  | { type: 'pass' }
  | { type: 'leader' }
  | { type: 'choose'; uid: number | null };

/** O que aconteceu numa jogada — a interface usa isso para animar e narrar. */
export type GameEvent =
  | { type: 'play'; player: PlayerId; uid: number; cardId: string; from: 'hand' | 'deck' | 'discard' }
  | { type: 'ability'; player: PlayerId; cardId: string; ability: Ability | 'leader'; uid?: number }
  | { type: 'destroy'; uids: number[] }
  | { type: 'draw'; player: PlayerId; uids: number[] }
  | { type: 'return'; player: PlayerId; uid: number }
  | { type: 'reveal'; player: PlayerId; cardIds: string[] }
  | { type: 'pass'; player: PlayerId }
  | { type: 'pending'; pending: Pending }
  | { type: 'faction'; player: PlayerId; faction: Faction }
  | { type: 'round'; winner: PlayerId | 'draw'; scores: [number, number]; round: number }
  | { type: 'game'; winner: PlayerId | 'draw' };

export interface MoveResult {
  state: GameState;
  events: GameEvent[];
}
