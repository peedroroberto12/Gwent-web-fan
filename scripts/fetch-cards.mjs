#!/usr/bin/env node
// Baixa artes e dados das cartas do repositório API-Gwent
// (https://github.com/day-s-ea/API-Gwent) e prepara para o jogo:
//
//   public/cards/art/<id>.webp   ilustração de cada carta (não versionado)
//   public/cards/icons/*.webp    ícones de força, fileira e habilidade (não versionado)
//   src/data/cards.json          dados normalizados (versionado)
//
// Uso: npm run fetch-cards        (requer git instalado)
//      npm run fetch-cards -- --data-only   (só regenera o JSON)

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SOURCE_REPO = 'https://github.com/day-s-ea/API-Gwent.git';
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_ART = join(ROOT, 'public/cards/art');
const OUT_ICONS = join(ROOT, 'public/cards/icons');
const OUT_DATA = join(ROOT, 'src/data/cards.json');
const dataOnly = process.argv.includes('--data-only');

// ---------- mapeamentos do formato deles para o nosso ----------

const FACTIONS = {
  'Northern Realms': 'northern',
  'Nilfgaardian Empire': 'nilfgaard',
  "Scoia'tael": 'scoiatael',
  Monsters: 'monsters',
  Neutral: 'neutral',
};

const TYPES = {
  Units: 'unit',
  Heroes: 'hero',
  Leaders: 'leader',
  Weather: 'weather',
  Special: 'special',
};

const ROWS = {
  'Close combat': 'close',
  'Ranged combat': 'ranged',
  Siege: 'siege',
};

const ABILITIES = {
  Hero: 'hero',
  Spy: 'spy',
  Medic: 'medic',
  Muster: 'muster',
  'Tight bond': 'tight_bond',
  'Morale boost': 'morale',
  "Commander's horn": 'horn',
  Agile: 'agile',
  Decoy: 'decoy',
  'Scorch close combat': 'scorch_close',
};

// Cartas cuja habilidade vem como frase: definimos pelo nome.
// (A Chuva Torrencial no JSON original diz "Ranged e Siege", mas no Witcher 3 ela afeta só Siege.)
const BY_NAME = {
  'Biting Frost': ['weather_frost'],
  'Impenetrable Fog': ['weather_fog'],
  'Torrential Rain': ['weather_rain'],
  'Clear Weather': ['weather_clear'],
  Scorch: ['scorch'],
};

const asList = (v) => (Array.isArray(v) ? v : v === '' || v == null ? [] : [v]);

const slug = (s) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

function normalize(raw) {
  const seen = new Map();
  const cards = raw.map((c) => {
    const { data, attributes: a, img } = c;
    const type = TYPES[a.type];
    const faction = FACTIONS[a.deck];
    if (!type || !faction) throw new Error(`Tipo/facção desconhecido em "${data.name}"`);

    let abilities = [];
    let leaderText;
    if (type === 'leader') {
      leaderText = String(a.ability).trim();
    } else if (BY_NAME[data.name]) {
      abilities = BY_NAME[data.name];
    } else {
      abilities = asList(a.ability).map((x) => {
        const id = ABILITIES[x];
        if (!id) throw new Error(`Habilidade desconhecida "${x}" em "${data.name}"`);
        return id;
      });
    }

    const rows = asList(a.row).map((r) => {
      const id = ROWS[r];
      if (!id) throw new Error(`Fileira desconhecida "${r}" em "${data.name}"`);
      return id;
    });
    if (abilities.includes('agile') && rows.length < 2) rows.splice(0, rows.length, 'close', 'ranged');

    // id único e legível: "geralt-of-rivia", "arachas-2"...
    const base = slug(data.name);
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const id = n === 1 ? base : `${base}-${n}`;

    return {
      id,
      name: data.name,
      faction,
      type,
      rows,
      strength: typeof a.strength === 'number' ? a.strength : null,
      abilities: type === 'hero' ? abilities.filter((x) => x !== 'hero') : abilities,
      ...(leaderText ? { leaderText } : {}),
      copies: data.duplicateCount,
      flavor: data.description,
      art: `cards/art/${id}.webp`,
      _src: { basic: img.background.replace('.webp', '_basic.webp'), full: img.background },
    };
  });
  // corrige "arachas" -> "arachas-1" quando há variantes, para ficar consistente
  for (const card of cards) if ((seen.get(card.id) ?? 0) > 1) card.id = `${card.id}-1`;
  for (const card of cards) card.art = `cards/art/${card.id}.webp`;
  return cards;
}

// ---------- execução ----------

const tmp = mkdtempSync(join(tmpdir(), 'api-gwent-'));
try {
  console.log('Baixando API-Gwent...');
  execFileSync('git', ['clone', '--depth', '1', '--quiet', SOURCE_REPO, tmp], { stdio: 'inherit' });

  const raw = JSON.parse(readFileSync(join(tmp, 'gwentCard.json'), 'utf8'));
  const cards = normalize(raw);

  if (!dataOnly) {
    mkdirSync(OUT_ART, { recursive: true });
    mkdirSync(OUT_ICONS, { recursive: true });
    for (const card of cards) {
      const basic = join(tmp, 'decontructed_img/basic_cards', card._src.basic);
      const full = join(tmp, 'img_gwentCards', card._src.full);
      cpSync(existsSync(basic) ? basic : full, join(ROOT, 'public', card.art));
    }
    cpSync(join(tmp, 'decontructed_img/icons'), OUT_ICONS, { recursive: true });
  }

  const clean = cards.map(({ _src, ...c }) => c);
  mkdirSync(dirname(OUT_DATA), { recursive: true });
  writeFileSync(OUT_DATA, JSON.stringify(clean, null, 2) + '\n');

  const count = (f) => clean.filter(f).length;
  console.log(`OK: ${clean.length} cartas`);
  for (const f of Object.values(FACTIONS)) console.log(`  ${f.padEnd(10)} ${count((c) => c.faction === f)}`);
  if (!dataOnly) console.log('Artes em public/cards/');
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
