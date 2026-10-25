# Avisos de terceiros

O código do Poiesis é distribuído sob a **GNU GPL v3, somente a versão 3** (`GPL-3.0-only`), conforme o arquivo [`LICENSE`](LICENSE).

O pacote da extensão também inclui componentes de terceiros, cada um sob a sua própria licença. A lista completa, com o texto de cada licença, é gerada a cada build em `dist/THIRD_PARTY_LICENSES.txt` e só inclui o que de fato entra no pacote. O resumo está abaixo.

## Dados e componentes com licença própria

| Item | Onde fica | Licença |
| --- | --- | --- |
| Descrições de reserva do [MDN Web Docs](https://developer.mozilla.org), por Mozilla Contributors, extraídas via [`@vscode/web-custom-data`](https://github.com/microsoft/vscode-custom-data) | `src/lib/mdn-data.json` | [CC BY-SA 2.5](https://creativecommons.org/licenses/by-sa/2.5/). O arquivo de dados é redistribuído sob essa mesma licença e fica separado do código GPL. |
| Componentes base do [shadcn/ui](https://github.com/shadcn-ui/ui), modificados para Material 3 | `src/components/ui/` | MIT. Copyright (c) 2023 shadcn |

## Fontes e ícones

| Item | Licença |
| --- | --- |
| [Material Symbols](https://github.com/google/material-design-icons) (Google), inteiros e no recorte usado na interface | Apache-2.0 |
| Roboto Flex, JetBrains Mono e Instrument Serif (via Fontsource) | SIL Open Font License 1.1 |

## Bibliotecas incluídas no pacote

| Biblioteca | Licença |
| --- | --- |
| React, React DOM | MIT |
| CodeMirror 6 e Lezer | MIT |
| Radix UI, Floating UI, cmdk, sonner, clsx, tailwind-merge | MIT |
| Prettier (standalone) | MIT |
| marked | MIT |
| fflate | MIT |
| Emmet (`emmet`, `@emmetio/*`) | MIT |
| `@replit/codemirror-css-color-picker` e `@replit/codemirror-indentation-markers` | MIT |
| DOMPurify | MPL-2.0 ou Apache-2.0 (usada aqui sob a Apache-2.0) |
| class-variance-authority | Apache-2.0 |
| lucide-react | ISC |
| tslib | 0BSD |

### Pendência conhecida

O pacote `@emmetio/codemirror6-plugin` (integração do Emmet com o CodeMirror) não declara licença, nem no npm nem no repositório. O núcleo do Emmet que ele embute é MIT. Antes de publicar, ou obtemos do autor uma licença explícita, ou trocamos o plugin por uma integração própria em cima do núcleo `emmet` (MIT).
