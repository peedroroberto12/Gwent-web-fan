// Camada de conexão: o resto do jogo só conhece esta interface. Trocar a Trystero por
// outra coisa (Cloudflare, código manual...) é escrever outro `Link`, sem mexer na partida.

/** Mensagens são objetos JSON simples. */
export type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

export interface Link {
  /** Manda para um participante da sala (`to`) ou para todos. */
  send(msg: Json, to?: string): void;
  /** Mensagem recebida, com o id de quem mandou. */
  onMessage: (msg: Json, peer: string) => void;
  /** Alguém entrou ou saiu da sala. */
  onPeer: (peer: string, present: boolean) => void;
  close(): void;
}

/**
 * Rede de mentira na memória, para testes. Cada `join` é um aparelho entrando na sala;
 * `drop` simula a internet de um deles caindo (os outros são avisados).
 */
export function memoryHub() {
  const links = new Map<string, Link>();
  const later = (fn: () => void) => queueMicrotask(fn);
  const hub = {
    join(id: string): Link {
      const link: Link = {
        onMessage: () => {},
        onPeer: () => {},
        send(msg, to) {
          if (!links.has(id)) return;
          const copy = JSON.stringify(msg);
          for (const [other, l] of links) {
            if (other === id || (to && other !== to)) continue;
            later(() => { if (links.get(other) === l && links.has(id)) l.onMessage(JSON.parse(copy) as Json, id); });
          }
        },
        close() { hub.drop(id); },
      };
      const others = [...links.keys()];
      links.set(id, link);
      later(() => {
        for (const o of others) {
          links.get(o)?.onPeer(id, true);
          if (links.has(o)) link.onPeer(o, true);
        }
      });
      return link;
    },
    drop(id: string) {
      if (!links.delete(id)) return;
      const rest = [...links.values()];
      later(() => rest.forEach((l) => l.onPeer(id, false)));
    },
  };
  return hub;
}

/**
 * Conexão entre abas do mesmo navegador (BroadcastChannel). Só para desenvolvimento e
 * testes automáticos: abra o link com `&rede=local` em duas abas.
 */
export function localLink(room: string): Link {
  const ch = new BroadcastChannel(`gwent-${room}`);
  const self = Math.random().toString(36).slice(2, 10);
  const known = new Set<string>();
  type Packet = { from: string; to?: string; msg?: Json; hi?: boolean; bye?: boolean };
  const post = (p: Packet) => ch.postMessage(p);
  let open = true;
  const link: Link = {
    onMessage: () => {},
    onPeer: () => {},
    send(msg, to) { if (open) post({ from: self, to, msg }); },
    close() {
      if (!open) return;
      post({ from: self, bye: true });
      open = false;
      ch.close();
    },
  };
  const meet = (peer: string) => {
    if (known.has(peer)) return;
    known.add(peer);
    link.onPeer(peer, true);
  };
  ch.onmessage = (ev: MessageEvent<Packet>) => {
    const { from, to, msg, hi, bye } = ev.data;
    if (to && to !== self) return;
    if (bye) {
      if (known.delete(from)) link.onPeer(from, false);
      return;
    }
    if (hi) {
      if (!known.has(from)) post({ from: self, hi: true });
      meet(from);
      return;
    }
    meet(from);
    if (msg !== undefined) link.onMessage(msg, from);
  };
  window.addEventListener('pagehide', () => link.close());
  setTimeout(() => post({ from: self, hi: true }), 0);
  return link;
}
