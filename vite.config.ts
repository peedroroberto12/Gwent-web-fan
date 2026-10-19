import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Impressão digital das regras (motor + dados das cartas + protocolo online).
 * Dois jogadores online só podem jogar juntos com regras idênticas; caso contrário
 * cada aparelho calcularia um resultado diferente. Mudou CSS? A partida continua compatível.
 */
function rulesHash(): string {
  const files = [
    ...readdirSync('src/engine').map((f) => `src/engine/${f}`),
    'src/data/cards.json',
    'src/data/cards.ts',
    'src/net/match.ts',
  ].sort();
  const h = createHash('sha256');
  for (const f of files) h.update(readFileSync(f));
  return h.digest('hex').slice(0, 10);
}

// Build "abre e joga": todo JS/CSS/dados embutidos no index.html,
// que funciona aberto direto do disco (file://), sem servidor.
// As imagens das cartas ficam em public/cards e são copiadas para dist/cards.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  define: {
    __RULES_HASH__: JSON.stringify(rulesHash()),
  },
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
