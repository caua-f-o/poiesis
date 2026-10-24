# Poiesis

> **ποίησις** (*poíēsis*) — para os gregos, o ato de trazer à existência o que antes não era.
> Código vira forma.

Extensão do Chrome que abre um editor de código web numa aba: HTML, CSS e JavaScript com realce de sintaxe estilo VS Code, preview ao vivo ao lado, console de verdade e importação de projetos inteiros.

**O ícone:** um `</>` cuja barra brota — o caule dourado nasce no meio da sintaxe e abre em folha e botão. Para Heidegger, a *physis* (a flor que desabrocha) é a forma mais alta de *poiesis*; aqui, o código é a semente.

## Instalar

1. Descompacte `Poiesis.zip`.
2. Abra `chrome://extensions` e ligue o **Modo do desenvolvedor**.
3. Clique em **Carregar sem compactação** e escolha a pasta `Poiesis`.
4. Clique no ícone da extensão (ou `Alt+Shift+P`) para abrir o editor.

## O que tem

- **Editor CodeMirror 6** com cores por token, autocompletar (inclusive APIs do DOM), fechamento automático de tags e chaves, dobra de código, guias de indentação, multicursor, busca/substituição e seletor de cor nos valores CSS.
- **Emmet**: `ul>li*3` + `Tab`, `!` + `Tab` para o esqueleto HTML.
- **Preview ao vivo** com buffer duplo (não pisca e mantém a rolagem), modos tela cheia / tablet / celular com rotação, e janela destacada sincronizada.
- **HTML + CSS + JS ligados de verdade**: `<link href="css/estilo.css">`, `<script src="js/app.js">`, `@import`, `url()`, imagens, `import`/`export` entre módulos ES e `fetch("dados.json")` funcionam com os arquivos do projeto.
- **Console** com objetos expansíveis, contador de repetições, filtros, REPL que executa na página e link `arquivo:linha` que pula para o código (o erro também aparece sublinhado no editor).
- **Importar** arquivos soltos ou uma pasta inteira (botão ou arrastar e soltar), como projeto novo ou mesclado.
- **Exportar** o projeto em `.zip` ou como **HTML único** com tudo embutido.
- **Projetos múltiplos** salvos localmente, com modelos (Gênese, Em branco, Canvas generativo, Módulos ES), duplicar, renomear, desfazer exclusão e backup/restauração em `.json`.
- **Formatação com Prettier** (`Shift+Alt+F`), paleta de comandos e abertura rápida de arquivos.

## Atalhos

| Ação | Atalho |
| --- | --- |
| Executar | `Ctrl+Enter` ou `Ctrl+S` |
| Paleta de comandos | `Ctrl+K` |
| Abrir arquivo | `Ctrl+P` |
| Importar arquivos | `Ctrl+O` |
| Formatar | `Shift+Alt+F` |
| Buscar / substituir | `Ctrl+F` / `Ctrl+H` |
| Comentar linha | `Ctrl+/` |
| Quebra de linha | `Alt+Z` |
| Barra lateral / console | `Ctrl+B` / `Ctrl+J` |
| Alternar layout | `Ctrl+\` |
| Recarregar preview | `Ctrl+R` |

## Como funciona a segurança

O código do usuário roda numa **página sandbox** declarada no manifesto: origem isolada, sem acesso às APIs da extensão nem aos seus dados. É isso que permite scripts inline, `eval` e bibliotecas de CDN no preview, enquanto as páginas da extensão continuam com a CSP rígida do Manifest V3. A única permissão pedida é `storage`.

## Desenvolver

```bash
pnpm install
pnpm icons   # recorta a fonte Material Symbols só com os ícones usados (precisa de Python + fonttools + brotli)
pnpm build   # gera a extensão em dist/
```

Stack: React 19, TypeScript, Vite, Tailwind, shadcn/ui, CodeMirror 6, Emmet, Prettier, fflate. Fontes locais: Manrope, JetBrains Mono, Instrument Serif e Material Symbols Rounded.
