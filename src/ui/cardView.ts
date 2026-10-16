// Desenha uma carta: ilustração + camadas de ícones (força, habilidade, fileira).
// Os ícones do API-Gwent têm o tamanho da carta inteira (325x450) com fundo
// transparente, então basta empilhá-los por cima da arte.
import type { Ability, CardDef } from '../data/cards';

const ICON = (name: string) => `cards/icons/${name}.webp`;

const ABILITY_ICON: Partial<Record<Ability, string>> = {
  spy: 'ability_spy',
  medic: 'ability_medic',
  muster: 'ability_muster',
  tight_bond: 'ability_tight_bond',
  morale: 'ability_morale',
  horn: 'ability_horn_bottom',
  scorch_close: 'ability_scorch_bottom',
};

const TOP_ICON: Partial<Record<Ability, string>> = {
  weather_frost: 'ability_frost',
  weather_fog: 'ability_fog',
  weather_rain: 'ability_rain',
  weather_clear: 'ability_sun',
  horn: 'ability_horn_top',
  decoy: 'ability_decoy',
  scorch: 'ability_scorch_top',
};

const ROW_ICON = { close: 'close_combat', ranged: 'ranged_combat', siege: 'siege_combat' } as const;

export interface CardViewOptions {
  /** Força atual (com clima, trompa etc.). Se omitida, usa a base. */
  strength?: number;
}

export function cardView(card: CardDef, opts: CardViewOptions = {}): HTMLElement {
  const el = document.createElement('div');
  el.className = `card card--${card.type}`;
  el.dataset.cardId = card.id;

  const layers: string[] = [`<img class="card__art" src="${card.art}" alt="" draggable="false">`];

  if (card.type === 'unit') {
    layers.push(`<img class="card__layer" src="${ICON('unit_strength')}" alt="">`);
    const base = card.strength ?? 0;
    const now = opts.strength ?? base;
    const mod = now > base ? 'up' : now < base ? 'down' : '';
    layers.push(`<span class="card__strength ${mod}">${now}</span>`);
  } else if (card.type === 'hero') {
    layers.push(`<img class="card__layer" src="${ICON(`hero_s${card.strength}`)}" alt="">`);
  } else if (card.type === 'weather' || card.type === 'special') {
    const top = card.abilities.map((a) => TOP_ICON[a]).find(Boolean);
    if (top) layers.push(`<img class="card__layer" src="${ICON(top)}" alt="">`);
  }

  if (card.type === 'unit' || card.type === 'hero') {
    const ability = card.abilities.map((a) => ABILITY_ICON[a]).find(Boolean);
    if (ability) layers.push(`<img class="card__layer" src="${ICON(ability)}" alt="">`);
    const row = card.abilities.includes('agile') ? 'close-ranged_combat' : card.rows[0] && ROW_ICON[card.rows[0]];
    if (row) layers.push(`<img class="card__layer" src="${ICON(row)}" alt="">`);
  }

  el.innerHTML = layers.join('');
  el.title = card.name;
  return el;
}
