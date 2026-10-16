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
  | 'deck_weather' // clima do próprio baralho -> jogado
  | 'own_hand' //     carta da própria mão -> descarte
  | 'deck_any'; //    qualquer carta do próprio baralho -> mão

export interface Pending {
  player: PlayerId;
  source: PickSource;
  optional: boolean;
  /** Quantas escolhas desta fonte ainda faltam (padrão 1). */
  count?: number;
  /** Escolha seguinte, depois desta (ex.: descartar 2 e então pegar 1 do baralho). */
  then?: PickSource;
}

/** 'first': Scoia'tael escolhe quem começa · 'redraw': troca de até 2 cartas · 'play': partida. */
export type Phase = 'first' | 'redraw' | 'play';

export interface GameState {
  phase: Phase;
  /** Quem escolhe quem começa (só na fase 'first'). */
  firstChooser: PlayerId | null;
  /** Trocas de carta restantes de cada jogador na fase 'redraw'. */
  redraws: [number, number];
  redrawDone: [boolean, boolean];
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
  | { type: 'choose'; uid: number | null }
  | { type: 'first'; player: PlayerId } //  quem começa (escolha da Scoia'tael)
  | { type: 'redraw'; uid: number } //      troca uma carta da mão no início
  | { type: 'keep' }; //                    encerra as trocas

/** O que aconteceu numa jogada — a interface usa isso para animar e narrar. */
export type GameEvent =
  | { type: 'play'; player: PlayerId; uid: number; cardId: string; from: 'hand' | 'deck' | 'discard' }
  | { type: 'ability'; player: PlayerId; cardId: string; ability: Ability | 'leader'; uid?: number }
  | { type: 'destroy'; uids: number[] }
  | { type: 'draw'; player: PlayerId; uids: number[] }
  | { type: 'return'; player: PlayerId; uid: number }
  | { type: 'reveal'; player: PlayerId; cardIds: string[] }
  | { type: 'pass'; player: PlayerId; auto?: boolean }
  | { type: 'first'; chooser: PlayerId; starter: PlayerId }
  | { type: 'redraw'; player: PlayerId; out: number; in: number }
  | { type: 'discard'; player: PlayerId; uid: number }
  | { type: 'pending'; pending: Pending }
  | { type: 'faction'; player: PlayerId; faction: Faction }
  | { type: 'round'; winner: PlayerId | 'draw'; scores: [number, number]; round: number }
  | { type: 'game'; winner: PlayerId | 'draw' };

export interface MoveResult {
  state: GameState;
  events: GameEvent[];
}
