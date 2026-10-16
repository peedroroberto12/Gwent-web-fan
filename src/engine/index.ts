// Motor de regras: lógica pura, sem DOM. A UI e a IA usam só o que está exportado aqui.
export const VERSION = '0.1.0';

export * from './types';
export { createGame, defaultDeck, factionLeaders, type GameOptions } from './setup';
export { applyMove, canUseLeader, legalMoves, musterGroup, pendingOptions } from './rules';
export { def, isHero, rowScore, rowStrengths, score, weatherRows } from './score';
export { leaderAbility, LEADERS, type LeaderAbility } from './leaders';
export {
  canAdd,
  collectionFor,
  countOf,
  deckProblems,
  deckStats,
  sortForDisplay,
  MAX_SPECIALS,
  MIN_UNITS,
  type DeckStats,
} from './deck';
