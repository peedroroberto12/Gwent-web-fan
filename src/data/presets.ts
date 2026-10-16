// Baralhos prontos, inspirados nas estratégias clássicas de cada facção no Gwent do Witcher 3
// (guias da comunidade). As listas são nossas; todas respeitam as regras de montagem
// (mínimo 22 unidades, máximo 10 especiais, limite de cópias) — há teste para isso.
import type { Faction } from './cards';

export interface PresetDeck {
  id: string;
  name: string;
  faction: Faction;
  leader: string;
  description: string;
  cards: string[];
}

const x = (id: string, n: number) => Array<string>(n).fill(id);

export const PRESETS: PresetDeck[] = [
  // ---------------------------------------------------------------- Reinos do Norte
  {
    id: 'nr-spies-siege',
    name: 'Espiões e Cerco',
    faction: 'northern',
    leader: 'foltest-lord-commander-of-the-north',
    description: 'Espiões fracos compram cartas; catapultas e Crinfrid com vínculo decidem a rodada. O líder limpa o clima.',
    cards: [
      'john-natalis', 'esterad-thyssen', 'philippa-eilhart', 'vernon-roche', 'geralt-of-rivia', 'mysterious-elf',
      'prince-stennis', 'sigismund-dijkstra', 'thaler', 'dun-banner-medic',
      ...x('catapult', 3), ...x('crinfrid-reavers-dragon-hunter', 3), ...x('blue-stripes-commando', 3),
      ...x('kaedweni-siege-expert', 2), 'ballista-1', 'trebuchet-1', 'siege-tower',
      'biting-frost', 'impenetrable-fog', 'clear-weather', ...x('commander-s-horn', 2), ...x('decoy', 3), ...x('scorch', 2),
    ],
  },
  {
    id: 'nr-heroes-storm',
    name: 'Heróis na Tempestade',
    faction: 'northern',
    leader: 'foltest-king-of-temeria',
    description: 'Muitos heróis, imunes ao clima. Jogue geada, névoa e chuva para derrubar o oponente enquanto seus heróis seguem fortes.',
    cards: [
      'john-natalis', 'esterad-thyssen', 'philippa-eilhart', 'vernon-roche', 'geralt-of-rivia',
      'cirilla-fiona-elen-riannon', 'triss-merigold', 'yennefer-of-vengerberg', 'mysterious-elf',
      'prince-stennis', 'sigismund-dijkstra', 'thaler', 'dun-banner-medic',
      ...x('blue-stripes-commando', 3), ...x('poor-fucking-infantry', 3),
      'keira-metz', 'sile-de-tansarville', 'dethmold', 'siegfried-of-denesle', 'ves',
      'biting-frost', 'impenetrable-fog', 'torrential-rain', ...x('commander-s-horn', 2), ...x('decoy', 2), ...x('scorch', 2),
    ],
  },

  // ---------------------------------------------------------------- Nilfgaard
  {
    id: 'ng-spies-medics',
    name: 'Espiões e Médicos',
    faction: 'nilfgaard',
    leader: 'emhyr-var-emreis-the-relentless',
    description: 'O laço clássico: espiões dão cartas, médicos e iscas reaproveitam tudo, e Nilfgaard ainda vence os empates.',
    cards: [
      'letho-of-gulet', 'menno-coehoorn', 'morvran-voorhis', 'tibor-eggebracht', 'mysterious-elf',
      'stefan-skellen', 'shilard-fitz-oesterlen', 'vattier-de-rideaux',
      'etolian-auxiliary-archers-1', 'etolian-auxiliary-archers-2', 'siege-technician',
      ...x('impera-brigade-guard', 4), ...x('nausicaa-cavalry-rider', 3), 'young-emissary-1', 'young-emissary-2',
      'black-infantry-archer-1', 'black-infantry-archer-2', 'heavy-zerrikanian-fire-scorpion',
      ...x('decoy', 3), ...x('scorch', 2), 'commander-s-horn', 'biting-frost', 'impenetrable-fog', 'clear-weather',
    ],
  },
  {
    id: 'ng-imperial-rain',
    name: 'Chuva Imperial',
    faction: 'nilfgaard',
    leader: 'emhyr-var-emreis-his-imperial-majesty',
    description: 'Arqueiros de força 10 dominam a distância enquanto a chuva do líder afoga o cerco inimigo.',
    cards: [
      'letho-of-gulet', 'menno-coehoorn', 'morvran-voorhis', 'tibor-eggebracht',
      'geralt-of-rivia', 'cirilla-fiona-elen-riannon', 'yennefer-of-vengerberg',
      'stefan-skellen', 'vattier-de-rideaux',
      'black-infantry-archer-1', 'black-infantry-archer-2', 'assire-var-anahid', 'fringilla-vigo',
      'renuald-aep-matsen', 'cynthia', 'vanhemar', 'puttkammer',
      'cahir-mawr-dyffryn-aep-ceallach', 'rainfarn', 'morteisen', 'villentretenmerth',
      'heavy-zerrikanian-fire-scorpion', 'siege-engineer',
      'torrential-rain', 'biting-frost', ...x('commander-s-horn', 2), ...x('decoy', 2), ...x('scorch', 2),
    ],
  },

  // ---------------------------------------------------------------- Scoia'tael
  {
    id: 'st-agile',
    name: 'Ágeis de Dol Blathanna',
    faction: 'scoiatael',
    leader: 'francesca-findabair-queen-of-dol-blathanna',
    description: 'Unidades ágeis escolhem a fileira certa para fugir do clima; o líder queima o corpo a corpo inimigo.',
    cards: [
      'iorveth', 'eithne', 'isengrim-faoiltiarna', 'saesenthessis', 'geralt-of-rivia', 'mysterious-elf',
      'barclay-els', 'filavandrel-aen-fidhail', 'yaevinn', 'ciaran-aep-easnillien',
      'dol-blathanna-scout-1', 'dol-blathanna-scout-2', 'dol-blathanna-scout-3',
      'vrihedd-brigade-veteran-1', 'vrihedd-brigade-veteran-2',
      'havekar-healer-1', 'havekar-healer-2', 'milva',
      'ida-emean-aep-sivney', 'dennis-cranmer', ...x('dol-blathanna-archer', 2), 'villentretenmerth',
      ...x('commander-s-horn', 2), ...x('decoy', 2), ...x('scorch', 2), 'biting-frost', 'impenetrable-fog', 'clear-weather',
    ],
  },
  {
    id: 'st-mahakam',
    name: 'Convocação de Mahakam',
    faction: 'scoiatael',
    leader: 'francesca-findabair-daisy-of-the-valley',
    description: 'Uma carta chama o clã inteiro: defensores, escaramuçadores e contrabandistas enchem a mesa de uma vez.',
    cards: [
      'iorveth', 'eithne', 'isengrim-faoiltiarna', 'saesenthessis',
      'mahakaman-defender-1', 'mahakaman-defender-2', 'mahakaman-defender-3', 'mahakaman-defender-4', 'mahakaman-defender-5',
      'dwarven-skirmisher-1', 'dwarven-skirmisher-2', 'dwarven-skirmisher-3',
      'havekar-smuggler-1', 'havekar-smuggler-2', 'havekar-smuggler-3',
      'elven-skirmisher-1', 'elven-skirmisher-2', 'elven-skirmisher-3',
      'havekar-healer-1', 'havekar-healer-2', 'havekar-healer-3',
      'milva', 'yaevinn', 'barclay-els',
      ...x('commander-s-horn', 2), ...x('decoy', 2), 'scorch', 'biting-frost', 'impenetrable-fog', 'clear-weather',
    ],
  },

  // ---------------------------------------------------------------- Monstros
  {
    id: 'mo-swarm',
    name: 'Enxame',
    faction: 'monsters',
    leader: 'eredin-bringer-of-death',
    description: 'Uma única carta de vampiro, moira ou aracnídeo convoca o grupo todo e inunda a mesa numa rodada.',
    cards: [
      'draug', 'imlerith', 'leshen', 'kayran', 'geralt-of-rivia',
      'vampire-bruxa', 'vampire-ekimmara', 'vampire-fleder', 'vampire-garkain', 'vampire-katakan',
      'crone-brewess', 'crone-weavess', 'crone-whispess',
      'arachas-1', 'arachas-2', 'arachas-3', 'arachas-behemoth',
      'ghoul-1', 'ghoul-2', 'ghoul-3',
      'villentretenmerth', 'fiend', 'plague-maiden',
      ...x('commander-s-horn', 2), ...x('scorch', 2), ...x('decoy', 2),
      'biting-frost', 'impenetrable-fog', 'torrential-rain', 'clear-weather',
    ],
  },
  {
    id: 'mo-wild-hunt',
    name: 'Caçada Selvagem',
    faction: 'monsters',
    leader: 'eredin-commander-of-the-red-riders',
    description: 'Tudo no corpo a corpo: o líder dobra a fileira e as feras mais fortes fazem o resto.',
    cards: [
      'draug', 'imlerith', 'kayran', 'leshen', 'cirilla-fiona-elen-riannon', 'geralt-of-rivia',
      'fiend', 'griffin', 'werewolf', 'frightener', 'forktail', 'plague-maiden', 'botchling',
      'crone-brewess', 'crone-weavess', 'crone-whispess', 'nekker-1', 'nekker-2', 'nekker-3',
      'earth-elemental', 'fire-elemental', 'ice-giant', 'grave-hag',
      'impenetrable-fog', 'torrential-rain', 'clear-weather', 'commander-s-horn', ...x('scorch', 2), ...x('decoy', 2),
    ],
  },
];

export const presetsFor = (f: Faction) => PRESETS.filter((p) => p.faction === f);
