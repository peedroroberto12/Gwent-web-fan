// IA "média": testa cada jogada legal com o motor e escolhe a melhor por uma
// avaliação simples (diferença de pontos + vantagem de cartas), com regras para
// decidir quando passar. Ela só olha o que um jogador humano veria: o campo,
// a própria mão e o TAMANHO da mão do oponente.
import {
  applyMove,
  def,
  legalMoves,
  pendingOptions,
  score,
  type GameState,
  type Move,
  type PlayerId,
} from '../engine';

const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

/** Valor de uma carta "guardada": heróis e especiais valem mais na mão. */
function handValue(s: GameState, p: PlayerId): number {
  return s.players[p].hand.reduce((sum, c) => {
    const d = def(c);
    if (d.type === 'hero') return sum + 4;
    if (d.type === 'special' || d.type === 'weather') return sum + 3;
    return sum + 2.5;
  }, 0);
}

function evaluate(s: GameState, me: PlayerId): number {
  const opp = other(me);
  const points = score(s, me) - score(s, opp);
  const cards = s.players[me].hand.length - s.players[opp].hand.length;
  return points + cards * 3 + handValue(s, me) * 0.2;
}

/** Simula a jogada; se ela abrir uma escolha (médico...), resolve com a melhor opção. */
function simulate(s: GameState, move: Move, me: PlayerId): GameState {
  let next = applyMove(s, move).state;
  let guard = 0;
  while (next.pending && next.pending.player === me && guard++ < 5) {
    next = applyMove(next, choosePending(next, me)).state;
  }
  return next;
}

function choosePending(s: GameState, me: PlayerId): Move {
  const opts = pendingOptions(s);
  if (!opts.length) return { type: 'choose', uid: null };
  // espiões e unidades fortes primeiro; para clima, o que mais prejudica o oponente
  let best = opts[0]!;
  let bestVal = -Infinity;
  for (const c of opts) {
    let v: number;
    try {
      v = evaluate(applyMove(s, { type: 'choose', uid: c.uid }).state, me);
    } catch {
      v = (def(c).strength ?? 0) + (def(c).abilities.includes('spy') ? 6 : 0);
    }
    if (v > bestVal) { bestVal = v; best = c; }
  }
  return { type: 'choose', uid: best.uid };
}

export function chooseMove(s: GameState, me: PlayerId): Move {
  if (s.pending && s.pending.player === me) return choosePending(s, me);

  const moves = legalMoves(s);
  const plays = moves.filter((m) => m.type !== 'pass');
  if (!plays.length) return { type: 'pass' };

  const opp = other(me);
  const my = score(s, me);
  const their = score(s, opp);
  const oppPassed = s.players[opp].passed;
  const lastLife = s.players[me].gems === 1;
  const myHand = s.players[me].hand.length;
  const oppHand = s.players[opp].hand.length;

  // ---- decidir se passa ----
  if (oppPassed && my > their) return { type: 'pass' }; //               já ganhei a rodada
  if (!oppPassed && !lastLife && my - their >= 12 && myHand >= oppHand - 1) return { type: 'pass' };
  if (!lastLife && s.round === 1 && their - my >= 20 && myHand <= oppHand) return { type: 'pass' }; // entrega e guarda cartas

  // ---- avaliar jogadas ----
  const scored = plays.map((m) => {
    const next = simulate(s, m, me);
    let v = evaluate(next, me);
    if (m.type === 'leader') v -= s.round < 3 ? 4 : 0; // líder é recurso único
    const card = m.type === 'play' ? s.players[me].hand.find((c) => c.uid === m.uid) : undefined;
    if (card && def(card).type === 'hero' && s.round === 1 && !lastLife) v -= 3; // guarda heróis
    return { m, v, next };
  });

  if (oppPassed) {
    // oponente passou: gasta o mínimo para virar; se não dá para virar, passa
    const winning = scored.filter((x) => score(x.next, me) > score(x.next, opp));
    if (winning.length) {
      winning.sort((a, b) => b.next.players[me].hand.length - a.next.players[me].hand.length || b.v - a.v);
      return winning[0]!.m;
    }
    const potential = s.players[me].hand.reduce((a, c) => a + (def(c).strength ?? 0), 0);
    if (my + potential <= their && !lastLife) return { type: 'pass' };
  }

  scored.sort((a, b) => b.v - a.v);
  const best = scored[0]!;
  // nada melhora a situação e não estou perdendo a vida: passa
  if (!lastLife && best.v < evaluate(s, me) - 3 && my >= their) return { type: 'pass' };
  return best.m;
}
