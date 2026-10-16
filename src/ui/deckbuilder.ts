// Montagem de baralho antes da partida, no espírito da tela do Witcher 3:
// facção no topo, coleção à esquerda, baralho à direita, líder e estatísticas no meio.
// Uma aba alterna entre o seu baralho e o da CPU. Tudo fica salvo no navegador.
import {
  ABILITY_NAMES,
  ABILITY_TEXT,
  FACTION_NAMES,
  getCard,
  LEADER_TEXT,
  ROW_NAMES,
  type CardDef,
  type Faction,
} from '../data/cards';
import {
  canAdd,
  collectionFor,
  countOf,
  deckProblems,
  deckStats,
  defaultDeck,
  factionLeaders,
  MAX_SPECIALS,
  MIN_UNITS,
  randomDeck,
  sortForDisplay,
} from '../engine';
import { PRESETS, presetsFor } from '../data/presets';
import { cardView } from './cardView';
import { musicButton, onMusicChange, toggleMusic } from './music';
import { playCard } from './sfx';
import { enablePeek, justPeeked } from './peek';
import { fullscreenButton, goFullscreen } from './mobile';

export interface SideConfig {
  faction: Faction;
  leader: string;
  deck: string[];
}
export interface MatchSetup {
  me: SideConfig;
  cpu: SideConfig;
}

type Who = 'me' | 'cpu';
type Filter = 'all' | 'close' | 'ranged' | 'siege' | 'hero' | 'weather' | 'special';

const FACTIONS: Faction[] = ['northern', 'nilfgaard', 'scoiatael', 'monsters'];

const PERKS: Record<Faction, string> = {
  northern: 'Compra uma carta do baralho sempre que vence uma rodada.',
  nilfgaard: 'Vence qualquer rodada que terminar empatada.',
  scoiatael: 'Sempre começa jogando na primeira rodada.',
  monsters: 'Mantém uma unidade aleatória no campo ao fim de cada rodada.',
  neutral: '',
};

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'all', label: 'Todas' },
  { id: 'close', label: 'Corpo a corpo' },
  { id: 'ranged', label: 'Distância' },
  { id: 'siege', label: 'Cerco' },
  { id: 'hero', label: 'Heróis' },
  { id: 'weather', label: 'Clima' },
  { id: 'special', label: 'Especiais' },
];

function matches(c: CardDef, f: Filter): boolean {
  switch (f) {
    case 'all': return true;
    case 'hero': return c.type === 'hero';
    case 'weather': return c.type === 'weather';
    case 'special': return c.type === 'special';
    default: return (c.type === 'unit' || c.type === 'hero') && c.rows.includes(f);
  }
}

// ---------------------------------------------------------------- salvar / carregar

interface SavedSide {
  faction: Faction;
  leaders: Partial<Record<Faction, string>>;
  decks: Partial<Record<Faction, string[]>>;
}
type Saved = Record<Who, SavedSide>;

const KEY = 'gwent.decks.v1';

function freshSaved(): Saved {
  return {
    me: { faction: 'northern', leaders: {}, decks: {} },
    cpu: { faction: 'nilfgaard', leaders: {}, decks: {} },
  };
}

function load(): Saved {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...freshSaved(), ...(JSON.parse(raw) as Saved) };
  } catch {
    /* sem armazenamento: começa do padrão */
  }
  return freshSaved();
}

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(saved));
  } catch {
    /* navegação privada: tudo bem, só não lembra */
  }
}

let saved: Saved = load();

/** Configuração atual de um lado (cria baralho/líder padrão se ainda não houver). */
function side(who: Who): SideConfig {
  const s = saved[who];
  const leaders = factionLeaders(s.faction);
  let leader = s.leaders[s.faction];
  if (!leader || !leaders.includes(leader)) leader = s.leaders[s.faction] = leaders[0]!;
  let deck = s.decks[s.faction];
  // descarta cartas que não existem mais nos dados
  if (deck) deck = s.decks[s.faction] = deck.filter((id) => { try { getCard(id); return true; } catch { return false; } });
  if (!deck) deck = s.decks[s.faction] = defaultDeck(s.faction);
  return { faction: s.faction, leader, deck };
}

export function currentSetup(): MatchSetup {
  return { me: side('me'), cpu: side('cpu') };
}

// ---------------------------------------------------------------- interface

const ui = {
  who: 'me' as Who,
  filter: { collection: 'all' as Filter, deck: 'all' as Filter },
  hover: null as CardDef | null,
  presetNote: '',
  flash: null as { grid: 'collection' | 'deck'; id: string } | null,
};

let root: HTMLElement;
let onStart: (setup: MatchSetup) => void;

function change(fn: (s: SavedSide, cfg: SideConfig) => void) {
  const cfg = side(ui.who);
  fn(saved[ui.who], cfg);
  save();
  render();
}

function addCard(id: string) {
  change((s, cfg) => {
    if (!canAdd(cfg.deck, cfg.faction, id)) return;
    s.decks[cfg.faction] = [...cfg.deck, id];
    ui.flash = { grid: 'deck', id };
    playCard('place', 0.35);
  });
}

function removeCard(id: string) {
  change((s, cfg) => {
    const i = cfg.deck.indexOf(id);
    if (i < 0) return;
    const deck = [...cfg.deck];
    deck.splice(i, 1);
    s.decks[cfg.faction] = deck;
    ui.flash = { grid: 'collection', id };
    playCard('slide', 0.35);
  });
}

function cycle<T>(list: T[], current: T, step: number): T {
  const i = list.indexOf(current);
  return list[(i + step + list.length) % list.length]!;
}

function cardTile(c: CardDef, count: number, grid: 'collection' | 'deck'): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'db__tile';
  const cv = cardView(c);
  wrap.append(cv);
  if (count > 1 || grid === 'collection') wrap.insertAdjacentHTML('beforeend', `<span class="db__count">×${count}</span>`);
  wrap.title = grid === 'collection' ? 'Clique para adicionar ao baralho' : 'Clique para tirar do baralho';
  wrap.addEventListener('mouseenter', () => { ui.hover = c; renderHover(); });
  enablePeek(wrap, c);
  wrap.addEventListener('click', () => {
    if (justPeeked()) return;
    if (grid === 'collection') addCard(c.id);
    else removeCard(c.id);
  });
  if (ui.flash?.grid === grid && ui.flash.id === c.id) {
    wrap.animate(
      [{ transform: 'scale(1.18)', filter: 'brightness(1.6)' }, { transform: 'none', filter: 'none' }],
      { duration: 380, easing: 'cubic-bezier(.3,1.4,.5,1)' },
    );
  }
  return wrap;
}

function renderHover() {
  const box = root.querySelector('.db__hover');
  if (!box) return;
  const c = ui.hover;
  if (!c) {
    box.innerHTML = '<p class="db__hint">Clique numa carta da coleção para adicionar, e numa do baralho para tirar.</p>';
    return;
  }
  const kind =
    c.type === 'hero' ? 'Herói' : c.type === 'weather' ? 'Clima' : c.type === 'special' ? 'Especial'
    : c.rows.map((r) => ROW_NAMES[r]).join(' / ');
  const abilities = c.abilities.map((a) => `<li><b>${ABILITY_NAMES[a]}</b> — ${ABILITY_TEXT[a]}</li>`).join('');
  box.innerHTML = `
    <h3>${c.name}</h3>
    <p class="db__meta">${FACTION_NAMES[c.faction]} · ${kind}${c.strength !== null ? ` · força ${c.strength}` : ''}</p>
    ${abilities ? `<ul>${abilities}</ul>` : ''}`;
}

function filterBar(grid: 'collection' | 'deck'): string {
  return FILTERS.map(
    (f) => `<button class="db__filter ${ui.filter[grid] === f.id ? 'is-active' : ''}" data-list="${grid}" data-filter="${f.id}">${f.label}</button>`,
  ).join('');
}

function render() {
  const cfg = side(ui.who);
  const stats = deckStats(cfg.deck);
  const mine = deckProblems(side('me').deck, side('me').faction);
  const cpu = deckProblems(side('cpu').deck, side('cpu').faction);
  const problems = [...mine.map((p) => `Você: ${p}`), ...cpu.map((p) => `CPU: ${p}`)];
  const leaders = factionLeaders(cfg.faction);

  root.innerHTML = `
    <div class="db faction-${cfg.faction}">
      <header class="db__head">
        <div class="db__tabs">
          <button class="db__tab ${ui.who === 'me' ? 'is-active' : ''}" data-who="me">Seu baralho</button>
          <button class="db__tab ${ui.who === 'cpu' ? 'is-active' : ''}" data-who="cpu">Baralho da CPU</button>
        </div>
        <div class="db__faction">
          <button class="db__arrow" data-faction="-1" aria-label="Facção anterior">‹</button>
          <div class="db__faction-name">
            <h1>${FACTION_NAMES[cfg.faction]}</h1>
            <p>${PERKS[cfg.faction]}</p>
          </div>
          <button class="db__arrow" data-faction="1" aria-label="Próxima facção">›</button>
        </div>
        <div class="db__head-actions">${fullscreenButton()}${musicButton()}</div>
      </header>

      <section class="db__panel">
        <div class="db__panel-head"><h2>Coleção</h2></div>
        <div class="db__filters">${filterBar('collection')}</div>
        <div class="db__grid" data-grid="collection"></div>
      </section>

      <section class="db__center">
        <h2>Líder</h2>
        <div class="db__leader">
          <button class="db__arrow db__arrow--small" data-leader="-1" ${leaders.length < 2 ? 'disabled' : ''}>‹</button>
          <div class="db__leader-card"></div>
          <button class="db__arrow db__arrow--small" data-leader="1" ${leaders.length < 2 ? 'disabled' : ''}>›</button>
        </div>
        <p class="db__leader-name">${getCard(cfg.leader).name}</p>
        <p class="db__leader-text">${LEADER_TEXT[cfg.leader] ?? ''}</p>

        <dl class="db__stats">
          <div><dt>Total de cartas no baralho</dt><dd>${stats.total}</dd></div>
          <div class="${stats.units < MIN_UNITS ? 'is-bad' : ''}"><dt>Número de unidades</dt><dd>${stats.units}/${MIN_UNITS}</dd></div>
          <div class="${stats.specials > MAX_SPECIALS ? 'is-bad' : ''}"><dt>Cartas especiais</dt><dd>${stats.specials}/${MAX_SPECIALS}</dd></div>
          <div><dt>Força total das unidades</dt><dd>${stats.strength}</dd></div>
          <div><dt>Cartas de herói</dt><dd>${stats.heroes}</dd></div>
        </dl>

        <div class="db__presets">
          <select class="db__select" data-action="preset" aria-label="Baralhos prontos">
            <option value="">Baralhos prontos…</option>
            ${presetsFor(cfg.faction).map((p) => `<option value="${p.id}">${p.name}</option>`).join('')}
            <option value="__default">Coleção completa</option>
            <option value="__random">Aleatório</option>
          </select>
          <button class="btn btn--ghost btn--small" data-action="clear">Esvaziar</button>
        </div>
        ${ui.presetNote ? `<p class="db__preset-note">${ui.presetNote}</p>` : ''}
        <button class="btn db__start" data-action="start" ${problems.length ? 'disabled' : ''}>Começar partida</button>
        ${problems.length ? `<ul class="db__problems">${problems.map((p) => `<li>${p}</li>`).join('')}</ul>` : ''}
        <div class="db__hover"></div>
      </section>

      <section class="db__panel">
        <div class="db__panel-head"><h2>Baralho</h2><span>${stats.total} cartas</span></div>
        <div class="db__filters">${filterBar('deck')}</div>
        <div class="db__grid" data-grid="deck"></div>
      </section>
    </div>`;

  // coleção: o que ainda dá para adicionar
  const colGrid = root.querySelector('.db__grid[data-grid="collection"]')!;
  const collection = collectionFor(cfg.faction).filter((c) => matches(c, ui.filter.collection)).sort(sortForDisplay);
  for (const c of collection) {
    const left = c.copies - countOf(cfg.deck, c.id);
    if (left > 0) colGrid.append(cardTile(c, left, 'collection'));
  }
  if (!colGrid.children.length) colGrid.innerHTML = '<p class="db__empty">Nada aqui.</p>';

  // baralho: cartas únicas com contador
  const deckGrid = root.querySelector('.db__grid[data-grid="deck"]')!;
  const unique = [...new Set(cfg.deck)].map(getCard).filter((c) => matches(c, ui.filter.deck)).sort(sortForDisplay);
  for (const c of unique) deckGrid.append(cardTile(c, countOf(cfg.deck, c.id), 'deck'));
  if (!deckGrid.children.length) deckGrid.innerHTML = '<p class="db__empty">Clique nas cartas da coleção para montar o baralho.</p>';

  const leaderCard = cardView(getCard(cfg.leader));
  leaderCard.addEventListener('mouseenter', () => { ui.hover = getCard(cfg.leader); renderHover(); });
  enablePeek(leaderCard, getCard(cfg.leader));
  root.querySelector('.db__leader-card')!.append(leaderCard);
  renderHover();
  ui.flash = null;

  // eventos
  root.querySelectorAll<HTMLElement>('[data-who]').forEach((b) =>
    b.addEventListener('click', () => { ui.who = b.dataset.who as Who; ui.hover = null; ui.presetNote = ''; render(); }));
  root.querySelectorAll<HTMLElement>('[data-faction]').forEach((b) =>
    b.addEventListener('click', () => change((s) => { s.faction = cycle(FACTIONS, s.faction, Number(b.dataset.faction)); ui.hover = null; ui.presetNote = ''; })));
  root.querySelectorAll<HTMLElement>('[data-leader]').forEach((b) =>
    b.addEventListener('click', () => change((s, c) => { s.leaders[c.faction] = cycle(leaders, c.leader, Number(b.dataset.leader)); })));
  root.querySelectorAll<HTMLElement>('[data-filter]').forEach((b) =>
    b.addEventListener('click', () => {
      ui.filter[b.dataset.list as 'collection' | 'deck'] = b.dataset.filter as Filter;
      render();
    }));
  root.querySelector<HTMLSelectElement>('[data-action="preset"]')!.addEventListener('change', (ev) => {
    const value = (ev.target as HTMLSelectElement).value;
    if (!value) return;
    change((s, c) => {
      if (value === '__default') {
        s.decks[c.faction] = defaultDeck(c.faction);
        ui.presetNote = 'Todas as cartas da facção, com as neutras principais.';
      } else if (value === '__random') {
        const r = randomDeck(c.faction, leaders);
        s.decks[c.faction] = r.cards;
        s.leaders[c.faction] = r.leader;
        ui.presetNote = 'Baralho sorteado — escolha de novo para outro.';
      } else {
        const p = PRESETS.find((x) => x.id === value)!;
        s.decks[c.faction] = [...p.cards];
        s.leaders[c.faction] = p.leader;
        ui.presetNote = p.description;
      }
    });
    playCard('shuffle', 0.45);
  });
  root.querySelector('[data-action="clear"]')!.addEventListener('click', () =>
    change((s, c) => { s.decks[c.faction] = []; ui.presetNote = ''; }));
  root.querySelector('[data-action="start"]')!.addEventListener('click', () => {
    if (!problems.length) onStart(currentSetup());
  });
  root.querySelector('[data-action="music"]')?.addEventListener('click', toggleMusic);
  root.querySelector('[data-action="fullscreen"]')?.addEventListener('click', () => void goFullscreen().then(() => render()));
}

export function mountDeckBuilder(el: HTMLElement, start: (setup: MatchSetup) => void) {
  root = el;
  onStart = start;
  onMusicChange(() => render());
  render();
}
