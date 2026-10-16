# Gwent Clássico

Recriação gratuita do Gwent de *The Witcher 3*, jogável offline no navegador.

> Fan project não oficial e sem fins lucrativos. Não aprovado nem endossado pela CD PROJEKT RED.
> The Witcher® e GWENT® são marcas registradas da CD PROJEKT Capital Group.

## Jogar

1. Baixe o `.zip` da última versão em **Releases**.
2. Extraia e abra o `index.html` no navegador.

Não precisa instalar nada nem ter internet.

## Desenvolver

Requer Node.js 22+.

```bash
npm install
npm run dev        # abre o jogo em modo desenvolvimento
npm test           # roda os testes do motor de regras
npm run build      # gera a versão final em dist/
```

## Estrutura

```
src/
  engine/   motor de regras (lógica pura, sem DOM, 100% testável)
  data/     definições de cartas, facções e baralhos
  ai/       oponente controlado pelo computador
  ui/       interface (tabuleiro, cartas, animações)
tests/      testes automatizados
scripts/    utilitários (ex: baixar imagens das cartas)
public/cards/  imagens das cartas (não versionadas)
```

Regra de ouro: `engine` não importa nada de `ui` nem de `ai`. A UI e a IA conversam com o motor só por `legalMoves(state)` e `applyMove(state, move)`.

## Escopo da v1

- Regras completas do Gwent clássico (jogo base)
- Reinos do Norte e Nilfgaard, com baralhos prontos
- Partida contra IA heurística
- Desktop primeiro

Depois: demais facções, editor de baralho, IA mais forte, multiplayer.

## Lançar uma versão

```bash
git tag v0.1.0
git push --tags
```

O GitHub Actions testa, gera o build e publica o `.zip` no Release automaticamente.
