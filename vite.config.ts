import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Build "abre e joga": todo JS/CSS/dados embutidos no index.html,
// que funciona aberto direto do disco (file://), sem servidor.
// As imagens das cartas ficam em public/cards e são copiadas para dist/cards.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  test: {
    include: ['tests/**/*.test.ts'],
  },
});
