// Protocolo da partida online.
//
// Os dois aparelhos rodam o MESMO motor de regras e trocam só as jogadas ("lockstep"):
//   1. olá      — versão das regras e quem é quem (o criador da sala é o jogador 0)
//   2. início   — cada um manda o próprio baralho e um número sorteado; a semente do
//                 embaralhamento é a combinação dos dois, então ninguém escolhe sozinho
//   3. jogadas  — só quem está na vez manda; junto vai a "impressão digital" do estado
//                 depois da jogada, e o outro lado confere se chegou no mesmo resultado
//   4. sync     — quem tem o histórico mais completo manda tudo (semente, baralhos e a
//                 lista de jogadas) e o outro lado reconstrói a partida. Serve para
//                 reconexão, para quem recarregou a página e para corrigir dessincronia.
import type { Faction } from '../data/cards';
import {
  actorOf,
  applyMove,
  createGame,
  deckProblems,
  factionLeaders,
  other,
  type GameState,
  type Move,
  type PlayerId,
} from '../engine';
import type { Json, Link } from './link';

/** Muda quando o formato das mensagens muda. */
export const PROTOCOL = 1;
const RULES = typeof __RULES_HASH__ === 'string' ? __RULES_HASH__ : 'dev';

export interface Side {
  faction: Faction;
  leader: string;
  deck: string[];
}

interface Start {
  game: number;
  side: Side;
  nonce: number;
}

/** O que fica salvo no aparelho para retomar a partida depois de uma queda. */
export interface MatchRecord {
  room: string;
  me: PlayerId;
  /** Baralho escolhido para esta sala (usado também nas revanches). */
  side: Side;
  /** Número da partida atual dentro da sala (0, 1, 2... a cada revanche). */
  game: number;
  mine: Start | null;
  theirs: Start | null;
  moves: Move[];
  /** Senha deste aparelho na sala: quem reconecta prova que é o mesmo jogador. */
  token: string;
  /** Senha do oponente, guardada na primeira conexão. */
  peerToken: string | null;
  at: number;
}

export type Status =
  | 'searching' //  ainda não achou o oponente
  | 'connected'
  | 'away' //       o oponente caiu; esperando ele voltar
  | 'gone'; //      o oponente saiu da sala de propósito

export type Failure = 'version' | 'full' | 'invalid';

export interface MatchEvents {
  status(s: Status): void;
  /** Partida começou, foi retomada ou ressincronizada: mostrar este estado sem animar. */
  begin(state: GameState): void;
  /** Jogada do oponente, já conferida. A tela anima. */
  remote(move: Move): void;
  /** O oponente pediu revanche. */
  rematch(): void;
  fail(why: Failure): void;
}

type Msg =
  | { t: 'hello'; proto: number; rules: string; player: PlayerId; token: string; game: number; started: boolean; moves: number }
  | { t: 'start'; start: Start }
  | { t: 'move'; game: number; i: number; move: Move; hash: string }
  | { t: 'sync'; game: number; starts: [Start, Start]; moves: Move[] }
  | { t: 'need' }
  | { t: 'full' }
  | { t: 'fail'; why: Failure }
  | { t: 'bye' };

// ---------------------------------------------------------------- utilidades

/** Impressão digital do estado (FNV-1a de 32 bits sobre o JSON). */
export function stateHash(s: GameState): string {
  const str = JSON.stringify(s);
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

const ROOM_ALPHABET = 'BCDFGHJKMNPQRSTVWXZ23456789'; // sem vogais (nada de palavrão sem querer) e sem 0/1
export function newRoomCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => ROOM_ALPHABET[b % ROOM_ALPHABET.length]).join('');
}
export function normalizeRoom(code: string): string | null {
  const c = code.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return c.length === 6 && [...c].every((ch) => ROOM_ALPHABET.includes(ch)) ? c : null;
}

function nonce(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! | 0;
}

export function validSide(s: unknown): s is Side {
  if (!s || typeof s !== 'object') return false;
  const x = s as Side;
  if (typeof x.faction !== 'string' || typeof x.leader !== 'string' || !Array.isArray(x.deck)) return false;
  if (!x.deck.every((id) => typeof id === 'string')) return false;
  try {
    return factionLeaders(x.faction).includes(x.leader) && deckProblems(x.deck, x.faction).length === 0;
  } catch {
    return false;
  }
}

function validStart(s: unknown): s is Start {
  if (!s || typeof s !== 'object') return false;
  const x = s as Start;
  return Number.isInteger(x.game) && x.game >= 0 && Number.isInteger(x.nonce) && validSide(x.side);
}

/** Monta a partida a partir dos dois inícios (na ordem dos jogadores) e reaplica as jogadas. */
export function rebuild(starts: [Start, Start], moves: Move[]): GameState {
  const [a, b] = starts;
  let s = createGame({
    factions: [a.side.faction, b.side.faction],
    leaders: [a.side.leader, b.side.leader],
    decks: [a.side.deck, b.side.deck],
    seed: (a.nonce ^ b.nonce) | 0,
  });
  for (const m of moves) s = applyMove(s, m).state;
  return s;
}

// ---------------------------------------------------------------- armazenamento

const PREFIX = 'gwent.online.';
const MAX_AGE = 3 * 24 * 3600 * 1000;

export interface Store {
  load(room: string): MatchRecord | null;
  save(rec: MatchRecord): void;
  drop(room: string): void;
}

/**
 * Salva no localStorage. `tab` separa abas do mesmo navegador (só no modo de teste
 * `rede=local`, em que as duas abas dividem o mesmo armazenamento).
 */
export const browserStore = (tab = ''): Store => ({
  load(room) {
    try {
      const raw = localStorage.getItem(PREFIX + room + tab);
      if (!raw) return null;
      const rec = JSON.parse(raw) as MatchRecord;
      return Date.now() - rec.at < MAX_AGE ? rec : null;
    } catch {
      return null;
    }
  },
  save(rec) {
    try {
      // limpa salas velhas de vez em quando
      for (let i = localStorage.length - 1; i >= 0; i--) {
        const k = localStorage.key(i);
        if (!k?.startsWith(PREFIX) || k === PREFIX + rec.room + tab) continue;
        const old = JSON.parse(localStorage.getItem(k) ?? 'null') as MatchRecord | null;
        if (!old || Date.now() - old.at > MAX_AGE) localStorage.removeItem(k);
      }
      localStorage.setItem(PREFIX + rec.room + tab, JSON.stringify({ ...rec, at: Date.now() }));
    } catch {
      /* sem armazenamento: só não dá para retomar depois de recarregar */
    }
  },
  drop(room) {
    try {
      localStorage.removeItem(PREFIX + room + tab);
    } catch {
      /* nada */
    }
  },
});

export const memoryStore = (): Store => {
  const m = new Map<string, string>();
  return {
    load: (room) => (m.has(room) ? (JSON.parse(m.get(room)!) as MatchRecord) : null),
    save: (rec) => void m.set(rec.room, JSON.stringify(rec)),
    drop: (room) => void m.delete(room),
  };
};

export function newRecord(room: string, me: PlayerId, side: Side): MatchRecord {
  return { room, me, side, game: 0, mine: null, theirs: null, moves: [], token: String(nonce() >>> 0), peerToken: null, at: Date.now() };
}

// ---------------------------------------------------------------- a partida

export class OnlineMatch {
  readonly rec: MatchRecord;
  state: GameState | null = null;
  status: Status = 'searching';
  /** Pedido de revanche do oponente que ainda não foi aceito. */
  rematchOffer: Start | null = null;
  on: MatchEvents = { status() {}, begin() {}, remote() {}, rematch() {}, fail() {} };

  private peer: string | null = null;
  private present = new Set<string>();
  private closed = false;

  constructor(
    private link: Link,
    rec: MatchRecord,
    private store: Store = browserStore(),
  ) {
    this.rec = rec;
    if (!rec.mine) rec.mine = { game: rec.game, side: rec.side, nonce: nonce() };
    if (this.started) {
      try {
        this.state = rebuild(this.ordered(rec.mine, rec.theirs!), rec.moves);
      } catch {
        // histórico corrompido: recomeça a negociação desta partida
        rec.theirs = null;
        rec.moves = [];
      }
    }
    this.save();
    link.onMessage = (msg, peer) => this.receive(msg, peer);
    link.onPeer = (peer, here) => this.peerChange(peer, here);
  }

  get me(): PlayerId {
    return this.rec.me;
  }
  get room(): string {
    return this.rec.room;
  }
  get started(): boolean {
    const { mine, theirs, game } = this.rec;
    return !!mine && !!theirs && mine.game === game && theirs.game === game;
  }
  /** Já mandei pedido de revanche e estou esperando o oponente aceitar. */
  get waitingRematch(): boolean {
    return !this.started && this.rec.game > 0;
  }

  /** Eu joguei. Chame ANTES de animar; lança erro se a jogada não for válida agora. */
  local(move: Move) {
    if (!this.state || actorOf(this.state) !== this.me) throw new Error('não é a sua vez');
    const next = applyMove(this.state, move).state;
    const i = this.rec.moves.length;
    this.state = next;
    this.rec.moves.push(move);
    this.save();
    this.send({ t: 'move', game: this.rec.game, i, move, hash: stateHash(next) });
  }

  /** Pedir revanche ou aceitar a do oponente. */
  rematch() {
    const offer = this.rematchOffer;
    const game = Math.max(this.rec.game + 1, offer?.game ?? 0);
    this.rec.game = game;
    this.rec.mine = { game, side: this.rec.side, nonce: nonce() };
    this.rec.theirs = offer && offer.game === game ? offer : null;
    this.rec.moves = [];
    this.rematchOffer = null;
    this.state = null;
    this.save();
    this.send({ t: 'start', start: this.rec.mine });
    this.tryBegin();
  }

  /** Sair da sala de vez. */
  leave() {
    if (this.closed) return;
    this.send({ t: 'bye' });
    this.closed = true;
    this.store.drop(this.room);
    setTimeout(() => this.link.close(), 150); // dá tempo do "tchau" sair
  }

  // ------------------------------------------------------------ interno

  private ordered(mine: Start, theirs: Start): [Start, Start] {
    return this.me === 0 ? [mine, theirs] : [theirs, mine];
  }

  private save() {
    if (!this.closed) this.store.save(this.rec);
  }

  /** Por padrão só para o oponente desta sala; nada sai se ainda não há oponente. */
  private send(msg: Msg, to: string | null = this.peer) {
    if (!this.closed && to) this.link.send(msg as unknown as Json, to);
  }

  private setStatus(s: Status) {
    if (this.status === s) return;
    this.status = s;
    this.on.status(s);
  }

  private hello(to: string) {
    this.send({
      t: 'hello',
      proto: PROTOCOL,
      rules: RULES,
      player: this.me,
      token: this.rec.token,
      game: this.rec.game,
      started: this.started,
      moves: this.rec.moves.length,
    }, to);
  }

  private peerChange(peer: string, here: boolean) {
    if (this.closed) return;
    if (here) {
      this.present.add(peer);
      this.hello(peer);
    } else {
      this.present.delete(peer);
      if (peer === this.peer) {
        this.peer = null;
        if (this.status !== 'gone') this.setStatus('away');
      }
    }
  }

  private sync() {
    if (!this.started) return;
    this.send({ t: 'sync', game: this.rec.game, starts: this.ordered(this.rec.mine!, this.rec.theirs!), moves: this.rec.moves });
  }

  private tryBegin() {
    if (!this.started || this.state) return;
    this.state = rebuild(this.ordered(this.rec.mine!, this.rec.theirs!), this.rec.moves);
    this.save();
    this.on.begin(this.state);
  }

  /** Algo não bateu: o jogador 0 é a referência; o 1 pede a versão dele. */
  private desync() {
    if (this.me === 1) this.send({ t: 'need' });
    else this.sync();
  }

  private receive(raw: Json, from: string) {
    if (this.closed || !raw || typeof raw !== 'object' || Array.isArray(raw)) return;
    const msg = raw as unknown as Msg;

    if (msg.t === 'hello') {
      if (msg.proto !== PROTOCOL || msg.rules !== RULES) {
        this.send({ t: 'fail', why: 'version' }, from);
        this.on.fail('version');
        return;
      }
      // a vaga do oponente é de quem conectou primeiro; ele pode voltar com outro id
      // (recarregou a página), e um estranho só entra se a vaga estiver livre
      const sameSeat = this.rec.peerToken === null || this.rec.peerToken === msg.token;
      const seatFree = this.peer === null || this.peer === from || !this.present.has(this.peer);
      if (msg.player === this.me || (!sameSeat && !seatFree)) {
        this.send({ t: 'full' }, from);
        return;
      }
      this.rec.peerToken = msg.token;
      const isNew = this.peer !== from;
      this.peer = from;
      this.save();
      this.setStatus('connected');
      if (isNew) this.hello(from); // garante que o outro lado também recebeu o meu olá
      this.reconcile(msg);
      return;
    }

    if (msg.t === 'full') {
      if (this.peer === null || this.peer === from) {
        this.peer = null;
        this.on.fail('full');
      }
      return;
    }
    if (msg.t === 'fail') {
      if (this.peer === null || this.peer === from) this.on.fail(msg.why);
      return;
    }
    if (from !== this.peer) return; // só conversa com o oponente desta sala

    switch (msg.t) {
      case 'bye':
        this.peer = null;
        this.setStatus('gone');
        return;
      case 'need':
        this.sync();
        return;
      case 'start':
        return this.onStart(msg.start);
      case 'move':
        return this.onMove(msg);
      case 'sync':
        return this.onSync(msg);
    }
  }

  private reconcile(h: Extract<Msg, { t: 'hello' }>) {
    const r = this.rec;
    if (this.started) {
      const behind = h.game < r.game || (h.game === r.game && (!h.started || h.moves < r.moves.length));
      if (behind) this.sync();
    } else if (r.mine) {
      this.send({ t: 'start', start: r.mine });
    }
  }

  private onStart(s: Start) {
    if (!validStart(s)) {
      this.send({ t: 'fail', why: 'invalid' });
      this.on.fail('invalid');
      return;
    }
    const r = this.rec;
    if (s.game === r.game && !this.started) {
      r.theirs = s;
      this.tryBegin();
    } else if (s.game > r.game) {
      // o oponente já está na próxima partida: pedido de revanche
      this.rematchOffer = s;
      this.on.rematch();
    }
  }

  private onMove(m: Extract<Msg, { t: 'move' }>) {
    const r = this.rec;
    if (!this.started || !this.state || m.game !== r.game) {
      if (m.game >= r.game) this.send({ t: 'need' });
      return;
    }
    if (m.i < r.moves.length) return; // repetida
    if (m.i > r.moves.length) {
      this.send({ t: 'need' }); // perdi alguma no caminho
      return;
    }
    let next: GameState;
    try {
      if (actorOf(this.state) !== other(this.me)) throw new Error('fora de vez');
      next = applyMove(this.state, m.move).state;
    } catch {
      this.desync();
      return;
    }
    if (stateHash(next) !== m.hash) {
      this.desync();
      return;
    }
    this.state = next;
    r.moves.push(m.move);
    this.save();
    this.on.remote(m.move);
  }

  private onSync(m: Extract<Msg, { t: 'sync' }>) {
    if (!Array.isArray(m.starts) || !validStart(m.starts[0]) || !validStart(m.starts[1]) || !Array.isArray(m.moves)) return;
    let state: GameState;
    try {
      state = rebuild(m.starts, m.moves);
    } catch {
      this.on.fail('invalid');
      return;
    }
    const r = this.rec;
    r.game = m.game;
    r.mine = m.starts[this.me];
    r.theirs = m.starts[other(this.me)];
    r.side = r.mine.side;
    r.moves = m.moves;
    this.rematchOffer = null;
    this.state = state;
    this.save();
    this.on.begin(state);
  }
}
