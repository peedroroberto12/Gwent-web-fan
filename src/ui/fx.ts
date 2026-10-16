// Animações das cartas usando a técnica FLIP (First, Last, Invert, Play):
//   1. antes de redesenhar, `snapshot()` anota a posição de cada carta (pelo data-uid);
//   2. depois de redesenhar, `animate()` compara e anima cada carta da posição
//      antiga até a nova. Cartas novas surgem de uma origem (baralho, oponente);
//      cartas que sumiram viram "fantasmas" que voam para o descarte ou queimam.
// A interface continua simples: ela só redesenha tudo, e este módulo cuida do movimento.

export type Effect = 'burn';

interface Snap {
  rect: DOMRect;
  html: string;
  owner: string | undefined;
  strength: string | undefined;
}

export type Snapshot = Map<string, Snap>;

const reduced = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let layer: HTMLElement | null = null;
function fxLayer(): HTMLElement {
  if (!layer || !layer.isConnected) {
    layer = document.createElement('div');
    layer.className = 'fx-layer';
    document.body.append(layer);
  }
  return layer;
}

export function snapshot(root: ParentNode): Snapshot {
  const snap: Snapshot = new Map();
  root.querySelectorAll<HTMLElement>('.card[data-uid]').forEach((el) => {
    snap.set(el.dataset.uid!, {
      rect: el.getBoundingClientRect(),
      html: el.outerHTML,
      owner: el.dataset.owner,
      strength: el.querySelector('.card__strength')?.textContent ?? undefined,
    });
  });
  return snap;
}

/** Diz de onde uma carta que não existia antes deve surgir. */
export type OriginFor = (el: HTMLElement) => Element | null;

export interface AnimateOptions {
  origin: OriginFor;
  /** Para onde vai uma carta que sumiu (normalmente o descarte do dono). */
  exit: (owner: string | undefined) => Element | null;
  /** Efeitos especiais por uid (ex.: carta queimada). Consumidos aqui. */
  effects: Map<number, Effect>;
  /** Posições forçadas (ex.: onde a carta foi solta no arraste). */
  overrides?: Map<string, DOMRect>;
}

export function animate(root: ParentNode, before: Snapshot, opts: AnimateOptions) {
  const effects = new Map(opts.effects);
  opts.effects.clear();
  if (reduced()) return;

  const seen = new Set<string>();
  let enterIndex = 0;

  root.querySelectorAll<HTMLElement>('.card[data-uid]').forEach((el) => {
    const uid = el.dataset.uid!;
    seen.add(uid);
    const to = el.getBoundingClientRect();
    const from = opts.overrides?.get(uid) ?? before.get(uid)?.rect;

    // carta destruída que reaparece no descarte: queima no lugar e só depois surge lá
    const snap = before.get(uid);
    if (snap && effects.get(Number(uid)) === 'burn') {
      burn(makeGhost(snap), snap.rect);
      el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, delay: 1000, fill: 'backwards' });
      return;
    }

    if (from) {
      const dx = from.left - to.left;
      const dy = from.top - to.top;
      const s = from.width / to.width;
      if (Math.abs(dx) > 1 || Math.abs(dy) > 1 || Math.abs(s - 1) > 0.02) {
        el.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) scale(${s})`, zIndex: 50 },
            { transform: 'none', zIndex: 50 },
          ],
          { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)' },
        );
      }
      // força mudou: o número dá um "pulo"
      const oldStr = before.get(uid)?.strength;
      const num = el.querySelector<HTMLElement>('.card__strength');
      if (num && oldStr !== undefined && num.textContent !== oldStr) {
        num.animate(
          [{ transform: 'translate(-50%,-50%) scale(1.9)' }, { transform: 'translate(-50%,-50%) scale(1)' }],
          { duration: 450, easing: 'cubic-bezier(.3,1.6,.5,1)' },
        );
      }
      return;
    }

    // carta nova: voa da origem (baralho / painel do oponente)
    const src = opts.origin(el)?.getBoundingClientRect();
    const delay = enterIndex++ * 45;
    if (src) {
      const dx = src.left + src.width / 2 - (to.left + to.width / 2);
      const dy = src.top + src.height / 2 - (to.top + to.height / 2);
      el.animate(
        [
          { transform: `translate(${dx}px, ${dy}px) scale(.5) rotate(-8deg)`, opacity: 0, zIndex: 50 },
          { opacity: 1, offset: 0.25 },
          { transform: 'none', opacity: 1, zIndex: 50 },
        ],
        { duration: 520, delay, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' },
      );
    } else {
      el.animate([{ transform: 'scale(.6)', opacity: 0 }, { transform: 'none', opacity: 1 }], {
        duration: 300,
        delay,
        fill: 'backwards',
      });
    }
  });

  // cartas que sumiram
  let exitIndex = 0;
  for (const [uid, snap] of before) {
    if (seen.has(uid)) continue;
    const ghost = makeGhost(snap);
    if (effects.get(Number(uid)) === 'burn') {
      burn(ghost, snap.rect);
    } else {
      flyAway(ghost, snap.rect, opts.exit(snap.owner)?.getBoundingClientRect(), exitIndex++ * 35);
    }
  }
}

function makeGhost(snap: Snap): HTMLElement {
  const wrap = document.createElement('div');
  wrap.innerHTML = snap.html;
  const ghost = wrap.firstElementChild as HTMLElement;
  ghost.removeAttribute('data-uid');
  ghost.classList.add('fx-ghost');
  Object.assign(ghost.style, {
    left: `${snap.rect.left}px`,
    top: `${snap.rect.top}px`,
    width: `${snap.rect.width}px`,
  });
  fxLayer().append(ghost);
  return ghost;
}

function flyAway(ghost: HTMLElement, from: DOMRect, to: DOMRect | undefined, delay: number) {
  const frames: Keyframe[] = to
    ? [
        { transform: 'none', opacity: 1 },
        { transform: 'translateY(-10px) scale(1.05)', opacity: 1, offset: 0.2 },
        {
          transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`,
          opacity: 0.2,
        },
      ]
    : [{ opacity: 1 }, { opacity: 0, transform: 'scale(.7)' }];
  const anim = ghost.animate(frames, { duration: 560, delay, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'both' });
  anim.onfinish = () => ghost.remove();
}

/** Carta destruída: brilha em brasa, solta faíscas e vira cinza. */
function burn(ghost: HTMLElement, rect: DOMRect) {
  ghost.classList.add('fx-burning');
  const anim = ghost.animate(
    [
      { filter: 'none', transform: 'none', opacity: 1 },
      { filter: 'brightness(1.8) sepia(1) saturate(5) hue-rotate(-25deg)', transform: 'scale(1.08)', offset: 0.3 },
      { filter: 'brightness(.6) sepia(1) saturate(3) hue-rotate(-30deg)', offset: 0.6 },
      { filter: 'brightness(.1) grayscale(1) blur(2px)', transform: 'scale(.8) translateY(-14px)', opacity: 0 },
    ],
    { duration: 1100, easing: 'ease-in', fill: 'both' },
  );
  anim.onfinish = () => ghost.remove();

  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  for (let i = 0; i < 18; i++) {
    const spark = document.createElement('span');
    spark.className = 'fx-spark';
    spark.style.left = `${cx + (Math.random() - 0.5) * rect.width}px`;
    spark.style.top = `${cy + (Math.random() - 0.3) * rect.height * 0.6}px`;
    fxLayer().append(spark);
    const dx = (Math.random() - 0.5) * 90;
    const dy = -40 - Math.random() * 110;
    spark
      .animate(
        [
          { transform: 'translate(0,0) scale(1)', opacity: 1 },
          { transform: `translate(${dx}px, ${dy}px) scale(.2)`, opacity: 0 },
        ],
        { duration: 700 + Math.random() * 600, delay: 150 + Math.random() * 300, easing: 'ease-out', fill: 'both' },
      )
      .onfinish = () => spark.remove();
  }
}

/** Anima um elemento solto (fantasma do arraste) até um retângulo e remove. */
export function returnGhost(ghost: HTMLElement, to: DOMRect | undefined) {
  const from = ghost.getBoundingClientRect();
  if (!to || reduced()) return ghost.remove();
  const anim = ghost.animate(
    [
      { transform: 'none' },
      {
        transform: `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`,
        rotate: '0deg',
      },
    ],
    { duration: 320, easing: 'cubic-bezier(.3,1.3,.5,1)', fill: 'both' },
  );
  anim.onfinish = () => ghost.remove();
}
