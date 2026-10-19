// Conexão real pela internet: Trystero (WebRTC). Os aparelhos se encontram por relays
// públicos do Nostr e depois conversam direto, sem servidor no meio.
import type { Link, Json } from './link';

const APP_ID = 'io.github.peedroroberto12.gwent';

export async function trysteroLink(room: string): Promise<Link> {
  const { joinRoom } = await import('trystero');
  const r = joinRoom({ appId: APP_ID }, room);
  const action = r.makeAction<Json>('gwent');
  const link: Link = {
    onMessage: () => {},
    onPeer: () => {},
    send(msg, to) { void action.send(msg, to ? { target: to } : undefined).catch(() => {}); },
    close() { void r.leave(); },
  };
  action.onMessage = (data, { peerId }) => link.onMessage(data, peerId);
  r.onPeerJoin = (peer) => link.onPeer(peer, true);
  r.onPeerLeave = (peer) => link.onPeer(peer, false);
  window.addEventListener('pagehide', () => void r.leave());
  return link;
}
