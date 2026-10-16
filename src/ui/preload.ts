// Carrega e decodifica todas as artes antes do jogo começar.
// Sem isso, a arte de uma carta só começa a carregar na primeira vez em que ela
// aparece (ex.: carta do oponente) e fica preta por um instante.
// As imagens decodificadas ficam guardadas aqui para o navegador não descartá-las.
import { CARDS } from '../data/cards';

const ICONS = [
  'ability_decoy', 'ability_fog', 'ability_frost', 'ability_horn_bottom', 'ability_horn_top',
  'ability_medic', 'ability_morale', 'ability_muster', 'ability_rain', 'ability_scorch_bottom',
  'ability_scorch_top', 'ability_spy', 'ability_sun', 'ability_tight_bond', 'close-ranged_combat',
  'close_combat', 'hero_s0', 'hero_s10', 'hero_s15', 'hero_s7', 'hero_s8', 'ranged_combat',
  'siege_combat', 'unit_strength',
];

const keep: HTMLImageElement[] = [];

function load(src: string): Promise<void> {
  const img = new Image();
  img.decoding = 'async';
  img.src = src;
  keep.push(img);
  // decode() garante que a imagem já está pronta para desenhar, não só baixada
  return img.decode().catch(() => undefined);
}

export async function preloadArt(onProgress: (done: number, total: number) => void): Promise<void> {
  const sources = [...CARDS.map((c) => c.art), ...ICONS.map((i) => `cards/icons/${i}.webp`)];
  let done = 0;
  onProgress(0, sources.length);
  // em lotes, para não abrir centenas de leituras de uma vez
  const queue = [...sources];
  const worker = async () => {
    for (let src = queue.shift(); src; src = queue.shift()) {
      await load(src);
      onProgress(++done, sources.length);
    }
  };
  await Promise.all(Array.from({ length: 12 }, worker));
}
