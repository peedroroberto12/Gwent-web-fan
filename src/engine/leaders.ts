// Habilidades dos líderes. Cada líder é usado uma vez por partida (exceto os passivos,
// que valem o jogo todo).
import type { Ability, Row } from '../data/cards';

export type LeaderAbility =
  | { kind: 'pull_weather'; ability: Ability } //   tira um clima específico do baralho e joga
  | { kind: 'pick_weather' } //                     escolhe qualquer clima do baralho e joga
  | { kind: 'clear_weather' }
  | { kind: 'scorch_row'; row: Row } //             queima a(s) mais forte(s) da fileira inimiga se ela somar 10+
  | { kind: 'horn'; row: Row } //                   trompa numa fileira sua
  | { kind: 'reveal' } //                           mostra 3 cartas aleatórias da mão inimiga
  | { kind: 'steal_discard' } //                    pega uma carta do descarte inimigo
  | { kind: 'restore_discard' } //                  devolve uma carta do seu descarte à mão
  | { kind: 'move_agile' } //                       move os ágeis para a melhor fileira
  | { kind: 'discard_draw' } //                     descarta 2 da mão e escolhe 1 do baralho
  | { kind: 'passive'; effect: 'random_medic' | 'cancel_leader' | 'double_spies' | 'extra_card' }
  | { kind: 'unimplemented' };

export const LEADERS: Record<string, LeaderAbility> = {
  // Reinos do Norte
  'foltest-king-of-temeria': { kind: 'pull_weather', ability: 'weather_fog' },
  'foltest-lord-commander-of-the-north': { kind: 'clear_weather' },
  'foltest-son-of-medell': { kind: 'scorch_row', row: 'ranged' },
  'foltest-the-siegemaster': { kind: 'horn', row: 'siege' },
  'foltest-the-steel-forged': { kind: 'scorch_row', row: 'siege' },
  // Nilfgaard
  'emhyr-var-emreis-emperor-of-nilfgaard': { kind: 'reveal' },
  'emhyr-var-emreis-his-imperial-majesty': { kind: 'pull_weather', ability: 'weather_rain' },
  'emhyr-var-emreis-invader-of-the-north': { kind: 'passive', effect: 'random_medic' },
  'emhyr-var-emreis-the-relentless': { kind: 'steal_discard' },
  'emhyr-var-emreis-the-white-flame': { kind: 'passive', effect: 'cancel_leader' },
  // Monstros
  'eredin-breacc-glas-the-treacherous': { kind: 'passive', effect: 'double_spies' },
  'eredin-bringer-of-death': { kind: 'restore_discard' },
  'eredin-commander-of-the-red-riders': { kind: 'horn', row: 'close' },
  'eredin-destroyer-of-worlds': { kind: 'discard_draw' },
  'eredin-king-of-the-wild-hunt': { kind: 'pick_weather' },
  // Scoia'tael
  'francesca-findabair-daisy-of-the-valley': { kind: 'passive', effect: 'extra_card' },
  'francesca-findabair-hope-of-the-aen-seidhe': { kind: 'move_agile' },
  'francesca-findabair-pureblood-elf': { kind: 'pull_weather', ability: 'weather_frost' },
  'francesca-findabair-queen-of-dol-blathanna': { kind: 'scorch_row', row: 'close' },
  'francesca-findabair-the-beautiful': { kind: 'horn', row: 'ranged' },
};

export const leaderAbility = (id: string): LeaderAbility => LEADERS[id] ?? { kind: 'unimplemented' };
