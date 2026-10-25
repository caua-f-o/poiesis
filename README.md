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

**Interface em Material Design 3** — navigation rail (Arquivos, Buscar, Projetos, Temas), top app bar, painéis em superfícies tonais arredondadas, chips de filtro, botões segmentados, switches, menus, diálogos, tooltips e snackbars no padrão M3, com ripple.

**9 temas** que mudam interface e editor juntos: Tinta & Ouro (padrão), Drácula (paleta oficial), One Dark, Monokai, Nord, Tokyo Night, Catppuccin Mocha, Solarizado Claro e Papel & Ouro (claro).

**Editor (CodeMirror 6)**
- Realce de sintaxe por token, com **tags estruturais diferenciadas**: `<html>`, `<head>`, `<body>` e `<!DOCTYPE>` em destaque próprio e negrito; metadados (`meta`, `link`, `title`, `script`, `style`) em itálico; seções semânticas (`header`, `main`, `section`, `h1`…) e elementos customizados em cores próprias; faixas laterais marcam as regiões do head e do body.
- Seleção sempre visível (com e sem foco), multicursor, dobra de código, guias de indentação, seletor de cor no CSS, Emmet.
- **Autocompletar ampliado**: descrição em português de tags, atributos, propriedades CSS e APIs JS; classes e ids do CSS dentro de `class=""`/`id=""` e vice-versa nos seletores; caminhos do projeto em `href`, `src`, `url()`, `fetch()` e `import`; `var(--…)`, nomes de `@keyframes`, eventos de `addEventListener`, seletores em `querySelector` e `classList`, funções de outros arquivos JS e snippets (`log`, `qs`, `ael`, `fetchjson`, `forof`…).
- **Definições**: cartão "o que é e para que serve" para tags, atributos, propriedades, pseudo-seletores e APIs — e, para classes, ids, variáveis e animações do projeto, onde são definidas e onde são usadas (clicáveis). Aparece ao passar o mouse, com `Alt+F1` ou pelo menu de contexto.
- **Ir para definição** (`F12` / `Ctrl+clique`) e **renomear em todo o projeto** (`F2`) classes, ids, variáveis CSS e keyframes.
- **Seletor de ícones Material Symbols** (`Alt+I`, menu de contexto ou botão na barra de abas): 3.932 ícones com prévia offline, busca em português ou inglês ("casa", "lixeira", "seta"…), estilos Outlined/Rounded/Sharp, preenchimento, peso e tamanho. Insere o `<span>` (ou só o nome, ou o CSS) e adiciona o `<link>` da fonte no `<head>` se faltar. Com o cursor num ícone existente, troca o ícone.
- **Autocompletar ainda mais amplo**: ao digitar `<img`, `<link`, `<script`, `<a`, `<video`, `<audio`, `<iframe` ele já oferece a tag pronta com cada arquivo do projeto (com miniatura das imagens); a lista abre sozinha ao cair em `src=""`/`href=""`/`url()`; propriedades e valores dentro de `style=""`; nomes de ícones dentro de `<span class="material-symbols-…">`; atributos `data-*` do projeto (HTML, `[data-…]` no CSS e `dataset.` no JS); chaves do `localStorage`; fontes do projeto em `font-family`; tags em `createElement`; propriedades em camelCase em `.style.`; arquivos em `.src =`, `new Image/Audio/Worker()` e `@import`; valores sugeridos para `rel`, `target`, `loading`, `meta name/content`, `role`, `autocomplete`…
- **Verificação ao vivo com correção rápida**: tags inexistentes (`<dvi>` → `<div>`), atributos (`hreff` → `href`), propriedades CSS (`colr` → `color`), valores (`display: flx` → `flex`), `var(--…)` não definidas, pseudo-classes, fechamentos trocados ou faltando, ids duplicados, `<img>` sem `alt`, caminhos de arquivos que não existem (ou que só funcionam por sorte), métodos e globais de JS digitados errado (`document.querySelecter`, `consle`), `getElementById`/`querySelector` com id ou classe que não existe no projeto, erros de sintaxe e JSON inválido. Sublinhado vermelho (erro), amarelo (aviso) ou pontilhado (dica); **clique no trecho** (ou `Ctrl+.`) para ver as sugestões e aplicar com um clique — também aparecem no topo do menu de contexto. `F8` vai para o próximo problema.
- **JSON, Markdown e texto**: JSON com realce, validação (mensagens em português, correção de vírgula sobrando e aspas simples) e formatação; Markdown com realce (inclusive blocos de código HTML/CSS/JS/JSON), formatação e pré-visualização ao lado, só código ou só visualização — imagens e links do projeto funcionam; `.txt` e `.md` com corretor ortográfico do navegador.
- **Menu de contexto** com definição, ir para definição, renomear, mostrar o elemento no preview, recortar/copiar/colar, comentar, formatar, operações de linha, maiúsculas/minúsculas, dobrar/desdobrar, ações do Emmet e busca no projeto.

**Projeto**
- Pastas de verdade: criar, renomear, mover e excluir; arrastar arquivos e pastas entre elas; soltar arquivos do computador direto numa pasta.
- Importar **adicionando** ao projeto (sem substituir nada — nomes repetidos ganham sufixo), **mesclando** ou como **projeto novo**, escolhendo a pasta de destino.
- Busca e substituição em todos os arquivos.
- Exportar em `.zip` (com pastas) ou HTML único; vários projetos, modelos, backup.

**Preview e console**: `localStorage`, `sessionStorage` e `document.cookie` funcionam no preview (a sandbox bloqueia os nativos; o Poiesis fornece substitutos e guarda o localStorage por projeto), preview ao vivo sem piscar, modos tablet/celular, janela destacada sincronizada, módulos ES e `fetch` de arquivos do projeto, console com objetos expansíveis, REPL e link `arquivo:linha`.

## Atalhos

| Ação | Atalho |
| --- | --- |
| Executar | `Ctrl+Enter` ou `Ctrl+S` |
| Paleta de comandos | `Ctrl+K` |
| Abrir arquivo | `Ctrl+P` |
| Buscar no projeto | `Ctrl+Shift+F` |
| Definição / ir para definição | `Alt+F1` / `F12` |
| Renomear no projeto | `F2` |
| Inserir / trocar ícone | `Alt+I` |
| Correções rápidas / próximo problema | `Ctrl+.` / `F8` |
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

Stack: React 19, TypeScript, Vite, Tailwind, Radix/shadcn (reestilizado em Material 3), CodeMirror 6, Emmet, Prettier, fflate. Fontes locais: Roboto Flex, JetBrains Mono, Instrument Serif e Material Symbols Rounded. Descrições de reserva do MDN via `@vscode/web-custom-data` (`python3 design/build_mdn.py`).

O build também gera `dist/LICENSE` e `dist/THIRD_PARTY_LICENSES.txt`, que traz a licença de cada pacote que entra na extensão.

## Licença

Copyright (C) 2026 Cauã F. O.

O Poiesis é software livre, distribuído sob a **GNU General Public License v3, somente a versão 3** (`GPL-3.0-only`). Você pode usar, estudar, modificar e redistribuir o código. Quem distribuir uma versão modificada precisa publicar o código-fonte dela também sob a GPL-3.0. O texto completo está em [`LICENSE`](LICENSE).

Os componentes de terceiros mantêm as próprias licenças. Destaque para as descrições do MDN em `src/lib/mdn-data.json`, que são CC BY-SA 2.5. Os detalhes estão em [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
