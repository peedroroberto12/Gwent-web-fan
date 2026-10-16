// Sorteio determinístico (mulberry32). A semente fica no estado, então a mesma
// semente + as mesmas jogadas sempre dão a mesma partida: bom para testes e replays.
import type { GameState } from './types';

export function rand(s: GameState): number {
  s.seed = (s.seed + 0x6d2b79f5) | 0;
  let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function shuffle<T>(s: GameState, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand(s) * (i + 1));
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function pick<T>(s: GameState, arr: T[]): T | undefined {
  return arr.length ? arr[Math.floor(rand(s) * arr.length)] : undefined;
}
