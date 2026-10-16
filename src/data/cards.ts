// Tipos e acesso às definições de cartas.
// O cards.json é gerado por `npm run fetch-cards` a partir do API-Gwent.
import raw from './cards.json';

export type Faction = 'northern' | 'nilfgaard' | 'scoiatael' | 'monsters' | 'neutral';
export type CardType = 'unit' | 'hero' | 'leader' | 'weather' | 'special';
export type Row = 'close' | 'ranged' | 'siege';
export type Ability =
  | 'spy'
  | 'medic'
  | 'muster'
  | 'tight_bond'
  | 'morale'
  | 'horn'
  | 'agile'
  | 'decoy'
  | 'scorch'
  | 'scorch_close'
  | 'weather_frost'
  | 'weather_fog'
  | 'weather_rain'
  | 'weather_clear';

export interface CardDef {
  id: string;
  name: string;
  faction: Faction;
  type: CardType;
  rows: Row[];
  strength: number | null;
  abilities: Ability[];
  leaderText?: string;
  copies: number;
  flavor: string;
  art: string;
}

export const CARDS = raw as CardDef[];

const byId = new Map(CARDS.map((c) => [c.id, c]));

export function getCard(id: string): CardDef {
  const card = byId.get(id);
  if (!card) throw new Error(`Carta desconhecida: ${id}`);
  return card;
}

export const ROWS: Row[] = ['close', 'ranged', 'siege'];

export const FACTION_NAMES: Record<Faction, string> = {
  northern: 'Reinos do Norte',
  nilfgaard: 'Império Nilfgaardiano',
  scoiatael: "Scoia'tael",
  monsters: 'Monstros',
  neutral: 'Neutra',
};

export const ROW_NAMES: Record<Row, string> = {
  close: 'Corpo a corpo',
  ranged: 'À distância',
  siege: 'Cerco',
};

export const ABILITY_NAMES: Record<Ability, string> = {
  spy: 'Espião',
  medic: 'Médico',
  muster: 'Convocar',
  tight_bond: 'Vínculo forte',
  morale: 'Moral',
  horn: 'Trompa do comandante',
  agile: 'Ágil',
  decoy: 'Isca',
  scorch: 'Queimar',
  scorch_close: 'Queimar (corpo a corpo)',
  weather_frost: 'Geada cortante',
  weather_fog: 'Névoa impenetrável',
  weather_rain: 'Chuva torrencial',
  weather_clear: 'Tempo limpo',
};

export const ABILITY_TEXT: Record<Ability, string> = {
  spy: 'Vai para o lado do oponente (conta para ele) e você compra 2 cartas.',
  medic: 'Escolha uma unidade do seu descarte e jogue-a na hora (exceto heróis e especiais).',
  muster: 'Ao jogar, procure no baralho as cartas de mesmo nome e jogue todas.',
  tight_bond: 'Ao lado de cartas iguais na mesma fileira, multiplica a força de cada uma pelo número delas.',
  morale: 'Soma +1 a todas as unidades da fileira (exceto ela mesma).',
  horn: 'Dobra a força de todas as unidades da fileira. Limite de 1 por fileira.',
  agile: 'Pode ser jogada em corpo a corpo ou à distância.',
  decoy: 'Troque por uma carta do seu campo para devolvê-la à mão.',
  scorch: 'Destrói a(s) carta(s) mais forte(s) do campo. Descartada após o uso.',
  scorch_close:
    'Destrói a(s) unidade(s) corpo a corpo mais forte(s) do oponente se a fileira dele somar 10 ou mais.',
  weather_frost: 'A força de todas as unidades corpo a corpo vira 1, para os dois jogadores.',
  weather_fog: 'A força de todas as unidades à distância vira 1, para os dois jogadores.',
  weather_rain: 'A força de todas as unidades de cerco vira 1, para os dois jogadores.',
  weather_clear: 'Remove todos os efeitos de clima.',
};

/** Fileira afetada por cada carta de clima. */
export const WEATHER_ROW: Partial<Record<Ability, Row>> = {
  weather_frost: 'close',
  weather_fog: 'ranged',
  weather_rain: 'siege',
};
