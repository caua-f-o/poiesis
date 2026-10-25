# Roadmap do Poiesis

Este é o plano vivo de evolução do Poiesis. A especificação detalhada dos módulos 1, 4, 5 e 6 (objetivos, limites técnicos e critérios de aceite) está em [`docs/especificacao-modulos-1-4-5-6.md`](docs/especificacao-modulos-1-4-5-6.md). Ela continua valendo, inclusive as regras comuns e a definição de pronto. Aqui ficam a ordem, o status e os módulos que entraram depois: 7 (pasta local), 8 (mascotes Lúmen e Pólen) e 9 (música de foco).

**Visão:** uma IDE web local-first, com recursos online opcionais e integrada ao fluxo de criação de extensões, sem virar cópia do DevTools ou do VS Code.

## Fases

| Fase | Entrega | Status |
| --- | --- | --- |
| **0 — Fundação** | Armazenamento em IndexedDB (um registro por projeto, gravação incremental e atômica), migração do formato antigo, indicador de espaço, canal do preview versionado e validado, testes E2E no repositório | ✅ 2.4.0 |
| **1 — Histórico local** (módulo 6) | Snapshots por hash, automáticos e manuais, pontos antes de operações destrutivas, linha do tempo, comparador lado a lado e em linha, restauração de trecho, arquivo ou projeto, retenção, exportar e importar | ✅ 2.4.0 |
| **2 — Pasta local** (módulo 7) | Editar diretamente uma pasta do computador, como opção nas preferências | ✅ 2.5.0 |
| **3 — Network MVP** (módulo 4) | Captura de `fetch`/XHR do preview, mocks locais, latência e erros simulados | ✅ 2.6.0 |
| **4 — Inspetor MVP** (módulo 1) | Seleção no preview, árvore DOM, estilos computados, box model, edição temporária | ✅ 2.7.0 |
| **5 — Extension Studio MVP** (módulo 5) | Templates MV3, editor de manifesto sincronizado, validação e exportação em ZIP | ✅ 2.8.0 |
| **6 — Integração avançada** | Edição persistente pelo inspetor (com mapeamento seguro), fixtures, mocks de `chrome.*`, snapshots coordenados entre módulos | ✅ 2.9.0 |
| **7 — Companhia e foco** (módulos 8 e 9) | Mascotes Lúmen e Pólen; botão de música de fundo para foco | Planejado |

O Network veio antes do Inspetor porque reaproveita o `fetch` virtual que o runtime do preview já tem. É incremento, não reescrita, e já valida a ponte tipada que o Inspetor também vai usar.

## O que já existe (fases 0 e 1)

**Armazenamento**
- Banco `poiesis` no IndexedDB, com os stores `meta`, `projects`, `blobs` e `revisions` (`src/lib/db.ts`).
- Cada projeto é um registro separado. Só o que mudou é regravado, numa transação única.
- **Migração do formato antigo** (`chrome.storage.local`): é copiada e conferida, e só então marcada como feita. A cópia antiga continua lá como reserva. Se o IndexedDB falhar, o Poiesis continua no formato antigo e avisa.
- Erros de espaço aparecem com uma mensagem clara, e o uso de espaço está nas Preferências.

**Canal do preview** (`src/lib/bridge.ts`)
- A origem tem que ser a janela do iframe sandbox. O código do usuário dentro da página e iframes de terceiros não podem mandar comandos.
- Cada mensagem traz versão e o token de sessão do editor, e tipo e campos são conferidos (com limites de tamanho).

**Histórico** (`src/lib/history.ts` e `src/components/HistoryPanel.tsx`)
- O conteúdo é guardado por SHA-256: cada versão diferente de um arquivo existe uma vez só. Uma revisão só aparece depois que todo o conteúdo dela foi gravado, na mesma transação.
- **Versões automáticas:** depois de 30 s a 2 min sem editar (configurável, ou desligado), ao trocar de projeto e ao esconder a aba. Nunca duplica uma versão sem mudança.
- **Versões antes de operações:** excluir arquivo, pasta ou projeto, importar, substituir em todo o projeto, renomear símbolo e restaurar.
- **Pontos manuais:** com nome, nota e fixação.
- **Retenção:** guarda até N automáticas por projeto (50, 150 ou 500); manuais e fixadas nunca saem sozinhas. Há coleta de blobs órfãos e limpeza do histórico de projetos excluídos.
- **Comparador:** compara com o estado atual ou com a versão anterior, lado a lado ou em linha, e mostra imagens lado a lado.
- **Restauração:** de um trecho (com as setas, depois "Aplicar trechos"), de um arquivo ou do projeto inteiro. Sempre grava antes uma versão do estado atual e oferece "Desfazer".
- **Exportar e importar:** formato `poiesis-history` v1. Na importação, cada conteúdo é conferido pelo hash; se algo foi adulterado, nada é importado.

**Testes:** `pnpm build && pnpm test:e2e` roda todas as suítes em `tests/e2e/` (Playwright + Chromium com a extensão carregada).

**Pendências da Fase 1:**
- Filtro de "segredos conhecidos" (por exemplo `.env`) nos snapshots: hoje o limite por tamanho de arquivo cobre o caso dos binários grandes.
- Recuperar um projeto excluído direto pelo histórico: hoje o histórico dele fica guardado até ser limpo, mas não há botão para recriar o projeto.

## O que já existe (fase 6)

**Integração entre os módulos** (`src/lib/inspect.ts`, `src/lib/ext/fixtures.ts`, `src/components/ChromeSimDialog.tsx`):

- **Inspetor → código ("Aplicar no código"):** as mudanças temporárias viram edição de verdade nos arquivos, só onde o lugar é inequívoco:
  - declaração de regra: a regra com o mesmo seletor **e o mesmo contexto** (`@media`, `@supports`, `@layer`, `@container`) precisa aparecer exatamente uma vez, no `.css` ou num `<style>` do HTML. O valor é trocado no lugar; declaração desligada vira comentário; propriedade nova entra no fim do bloco com a indentação dele;
  - estilo do elemento: o atributo `style` é alterado na tag certa do HTML-fonte (pelo mesmo caminho do "Ver no código"). Elemento criado por script não tem lugar no código e não é gravado;
  - o valor gravado é o que você digitou (não a forma normalizada pelo navegador), e valores com `;`, `{`, `}` ou comentários são recusados;
  - regra repetida, de folha externa, de `@import` ou criada por script: nada é gravado; o aviso explica o motivo e oferece copiar o CSS. Nunca finge que gravou;
  - antes de gravar, uma versão vai para o histórico ("Antes de aplicar do inspetor") e o aviso tem "Desfazer".
- **Simulação do chrome.* com fixtures** (`poiesis.chrome.json`, editável num diálogo ou no JSON):
  - `chrome.storage` inicial (local e sync, com a cota real do sync); ao salvar, o preview pode recomeçar com esses dados, e dá para copiar o estado atual do preview para a fixture;
  - abas fictícias para `tabs.query`/`tabs.get` (url e título só aparecem com a permissão `tabs` ou `host_permissions`, como no Chrome);
  - **respostas simuladas** para `runtime.sendMessage` (service worker), `tabs.sendMessage` (content script) e mensagens para outras extensões: a primeira regra cuja "mensagem contém" casar responde com o JSON (ou falha com um erro), com atraso opcional, em promessa ou callback. O console diz qual regra respondeu e que o código real não rodou. Sem regra, falha como no Chrome;
  - só dados JSON, nada executado; fica no histórico e fora do ZIP da extensão.
- **Extensão ↔ Rede:** os mocks de `poiesis.mocks.json` valem para o popup, as opções e o painel lateral; o painel Rede avisa que as requisições do service worker e dos content scripts só aparecem no DevTools da extensão instalada.
- **Extensão ↔ Inspetor:** o inspetor funciona no popup, nas opções e no painel lateral simulados.
- **Rede → histórico:** "Criar mock" e salvar mocks gravam antes uma versão ("Antes de mudar os mocks"/"Antes de criar um mock"); a fixture criada de uma resposta sai com campos de segredo mascarados (`token`, `password`, `senha`, `segredo`, `chave`…).
- As versões do histórico dizem de qual módulo vieram, com rótulo e ícone próprios (inspetor, mocks, extensão, pasta).

**Testes:** `tests/e2e/integracao.py` (33 verificações): gravação de regra, propriedade nova no fim do bloco, desligar, estilo inline, `@media`, `<style>` no HTML, regra ambígua não gravada, valor perigoso recusado, desfazer, fixture com segredo mascarado, versões no histórico, storage/abas/respostas simuladas (promessa, callback e erro), inspetor no popup, mocks de rede no popup e fixture fora do ZIP.

**Pendências da Fase 6:**
- Rodar o próprio service worker do projeto dentro do preview (em vez de respostas declaradas) e simular `onMessage` de verdade entre as partes.
- Aplicar no código mudanças de estados forçados (`:hover`) como regra nova.

## O que já existe (fase 5)

**Extension Studio** (painel **Extensão** na barra lateral; o núcleo fica em `src/lib/ext/`, a interface em `src/components/ExtensionPanel.tsx`, `ManifestForm.tsx` e `ExtensionDialogs.tsx`):

- **Nova extensão:** modelos combináveis de popup, página de opções, painel lateral, content script e service worker, além do par **principal/complementar** para conversa entre extensões. O código vem comentado em português, com ícones PNG gerados e um LEIA-ME de como testar. "Transformar este projeto em extensão" cria um manifesto para um projeto que já existe.
- **Manifesto em formulário ou JSON** (alternância na barra de abas): identidade, popup, ícones, service worker, opções, painel lateral, content scripts, permissões e `externally_connectable`. O formulário regrava o JSON a partir do objeto inteiro, então **campos que ele não conhece continuam lá** (e aparecem listados). Com JSON inválido, o formulário não sobrescreve nada e manda corrigir no JSON.
- **Validação** antes de exportar, mostrada no painel, no formulário e sublinhada no editor (com correção de um clique quando dá):
  - manifesto: versão, nome, chaves do MV2 (`browser_action`, `background.scripts`, CSP em texto, `web_accessible_resources` antigos), chaves desconhecidas com sugestão, padrões de URL, IDs de extensão, `default_locale` × `_locales`;
  - arquivos: tudo o que o manifesto referencia existe (com aviso de maiúsculas/minúsculas), ícones em PNG com o tamanho declarado, nomes que o Chrome recusa (começando com `_`);
  - CSP do MV3 nas páginas: scripts inline (com "Mover para um arquivo .js"), `onclick=`, `javascript:`, scripts de outros sites, `eval`;
  - APIs × permissões: `chrome.storage` sem `"storage"`, permissão declarada e não usada, APIs que não existem em content scripts, `import` em service worker sem `"type": "module"`, DOM no service worker.
- **Permissões explicadas:** o que cada uma faz, o risco, o aviso que o Chrome mostra na instalação, e a diferença entre `permissions`, `optional_permissions` e `host_permissions`. O painel resume o que o usuário vai ver ao instalar.
- **Mapa da extensão:** manifesto → pontos de entrada → scripts, estilos e módulos que cada um carrega, e a lista dos arquivos sem vínculo.
- **Preview simulado:** popup (encolhe para o conteúdo, até 800×600, como no Chrome), opções e painel lateral (~360 px), com `chrome.*` **simulado** e marcado como simulação: `storage` (guardado por projeto, com `onChanged` e cota do `sync`), `runtime` (`getManifest`, `getURL`, `openOptionsPage`…), `tabs`/`windows` com uma aba fictícia, `i18n` com `_locales`, `permissions`, `sidePanel.open`, `action`. Sem a permissão, a API fica `undefined`, como no Chrome. Mensagens para o service worker, content scripts ou outras extensões **falham com o mesmo erro do Chrome** e avisam no console que precisam da extensão instalada.
- **Gerador de ícones:** de uma imagem (do projeto ou do computador, inclusive SVG) para PNGs de 16, 32, 48 e 128 px, com margem e fundo opcionais, já ligados no manifesto.
- **Exportação:** ZIP com o `manifest.json` na raiz, pronto para "Carregar sem compactação". Ficam fora só os arquivos do Poiesis (`poiesis.mocks.json` e fixtures que a extensão não usa) e nomes que escapariam da pasta. Com erros, um diálogo lista tudo antes ("Corrigir antes" ou "Exportar mesmo assim").
- Mudanças pelo formulário, correções, ícones e "transformar em extensão" gravam antes uma versão no histórico ("Antes de mudar a extensão").

**Segurança desta fase:**
- O `chrome.*` do preview é JavaScript comum dentro da página isolada: não há nenhuma API privilegiada por trás, e o Poiesis continua só com `storage` e `unlimitedStorage`.
- As mensagens novas do preview (`ext-storage` e `ext-size`) passam pela mesma ponte validada: sessão, tipo, objeto JSON e limite de tamanho; o tamanho do popup é limitado. Testado com mensagem forjada.
- No modelo principal/complementar, o Chrome só entrega mensagens dos IDs de `externally_connectable.ids`, e o service worker confere o remetente e o formato de novo antes de agir. IDs inválidos são recusados no formulário.
- O texto do manifesto e dos arquivos é sempre exibido como texto (testado com HTML no nome).

**Testes:** `tests/e2e/extensao.py` (58 verificações). Além do editor, o teste **exporta o ZIP, descompacta e carrega a extensão num Chromium de verdade**: o service worker sobe, o popup usa o `chrome.storage` real, o content script roda numa página de `matches`, opções e painel lateral abrem sem erro de CSP; e duas extensões exportadas (principal e complementar) conversam depois da configuração, enquanto uma terceira, não autorizada, é recusada.

**Pendências da Fase 5:**
- O preview não roda o service worker nem content scripts (limite do navegador). As respostas simuladas e as fixtures de `chrome.*` chegaram na Fase 6.
- Faltam modelos de DevTools, nova aba e regras de `declarativeNetRequest`.
- A validação de `_locales` confere o arquivo do idioma padrão, mas ainda não as chaves `__MSG_…__` uma a uma.

## O que já existe (fase 4)

**Aba Elementos** (ao lado do Console e da Rede; o inspetor fica em `src/lib/runtime.js`, a validação e o vínculo com o código em `src/lib/inspect.ts`, a interface em `src/components/InspectorPanel.tsx`):

- **Seleção no preview:** botão na barra do preview ou `Ctrl+Shift+C`. O elemento sob o mouse ganha contorno com margem, borda, preenchimento e conteúdo; o clique seleciona e **não chega à página** (nem `mousedown`, `pointerdown`, duplo clique ou menu). `Esc` cancela. Fora do modo de seleção, o inspetor não escuta nada na página.
- **Árvore DOM:** carregada aos poucos, navegável pelo teclado (setas, Enter), com breadcrumb e busca por seletor ou texto. O runtime, o importmap e os estilos do próprio Poiesis ficam fora. Elementos **criados por script** aparecem marcados como "dinâmico" (o runtime acompanha `createElement`, `cloneNode`, `innerHTML` e afins desde o início).
- **Estilos:** `elemento.style` e as regras que casam, da mais específica para a menos, com seletor, especificidade (aproximada), arquivo e contexto (`@media`, `@supports`, `@layer`, `@container`). As declarações aparecem como foram escritas (com atalhos, como `margin: 4px 0`), e as que perdem para outra regra aparecem riscadas. Folhas de outra origem (CDN) são contadas, mas não lidas.
- **Calculado:** os valores finais das propriedades principais (ou todas), com as variáveis CSS usadas resolvidas. **Caixa:** o box model com margem, borda, preenchimento e tamanho. **Atributos:** a lista completa, sempre como texto.
- **Estados forçados:** `:hover`, `:focus`, `:active`, `:focus-visible` e `:focus-within`, aplicados com cópias das regras (o estado real da página não é tocado).
- **Edição temporária:** mudar o valor, ligar e desligar declarações e acrescentar propriedades, no elemento ou na regra. Nada vai para o arquivo; um contador mostra as mudanças, "Copiar CSS" gera o CSS delas agrupado por seletor e arquivo, e "Descartar" recarrega o preview.
- **Código ↔ preview:** "Ver no código" abre o HTML na tag do elemento; o arquivo de cada regra abre na linha do seletor; no editor HTML, `Ctrl+Shift+C` (ou o menu de contexto "Inspecionar este elemento no preview") seleciona no preview o elemento sob o cursor. Depois de recarregar, o mesmo elemento continua selecionado, se ainda existir.

**Segurança desta fase:**
- O inspetor usa o mesmo canal validado da Rede: as ordens vão do editor ao sandbox, que repassa só campos simples e com limite de tamanho, e o runtime só as aceita da janela pai. Um iframe de terceiro na página não consegue ligar a seleção (testado).
- Tudo o que vem da página (tags, atributos, textos, seletores, valores) passa por `parseInspect`, com tipos e limites, e é exibido como texto. Um atributo com `<img onerror>` aparece literal (testado). Mensagens com sessão errada são ignoradas.
- O contorno fica num shadow root fechado, com HTML fixo, sem nada da página dentro.
- As propriedades editadas passam por um filtro de nome (`PROP_RE`) e os valores vão por `style.setProperty`, nunca por texto de CSS montado.
- **Correções encontradas na revisão:** nomes de arquivo com aspas ou `-->` agora são escapados nos atributos e comentários que o preview injeta, e um CSS com `</style` dentro não fecha mais a tag antes da hora. Também foi corrigido um travamento da interface quando `scrollIntoView` devolvia uma promessa.

**Testes:** `tests/e2e/inspetor.py` (32 verificações).

**Pendências da Fase 4:**
- A especificidade é calculada de forma aproximada (cobre `:is`, `:not` e `:where` só pela soma simples).
- Pseudo-elementos (`::before`, `::after`) e animações ainda não aparecem no painel.
- ~~Persistir uma edição no arquivo~~ (feito na Fase 6).

## O que já existe (fase 3)

**Painel Rede** (aba ao lado do Console; `src/lib/net.ts`, instrumentação em `src/lib/runtime.js`, `src/components/NetworkPanel.tsx`):

- **Registro:** `fetch`, XHR e `sendBeacon` com método, URL, status, duração, tamanho, origem (rede, arquivo do projeto ou mock) e onde foi chamado (`arquivo:linha`, clicável).
  - Recursos carregados por tags (`<img>`, `<script>`, CSS…) e WebSockets aparecem **marcados como observados sem detalhes**, porque o navegador não expõe cabeçalhos nem corpo deles.
  - Filtros por tipo, mocks, erros e texto.
  - O registro fica só na memória, por projeto, com no máximo 500 entradas, e não passa de um projeto para outro. Ele é limpo a cada execução, a menos que "Preservar" esteja ligado.
- **Detalhes:** resumo com diagnóstico, cabeçalhos, parâmetros e corpo enviados, e resposta (JSON formatado e realçado; texto puro).
  - O diagnóstico separa provável CORS (explicando que a origem do preview é `null`), sem conexão, timeout, cancelamento, HTTP 4xx/5xx, resposta opaca e erro simulado.
- **XHR também lê arquivos do projeto** (antes só o `fetch` lia), simulando o ciclo de eventos completo.
- **Mocks** em `poiesis.mocks.json`, um arquivo do projeto, então entram no histórico e na pasta vinculada:
  - método, padrão de URL (`*` e `**`, sem regex do usuário), status, cabeçalhos, corpo literal ou vindo de arquivo do projeto (fixture), latência de até 30 s, falha de rede ou timeout;
  - funcionam offline, em `fetch` e XHR, e respeitam o `AbortController`;
  - editor visual ou JSON direto, e o JSON é validado (regras inválidas são apontadas e descartadas);
  - "Criar mock" a partir de uma resposta real grava o corpo em `mocks/…json` e cria a regra. Só o corpo e o `Content-Type` são guardados.
- **Console de APIs:** monta uma requisição (método, URL, cabeçalhos, corpo, timeout) que a **página do preview** envia, valendo CORS e mocks, sem nenhuma permissão nova. Também dá para repetir qualquer requisição do registro.
- **Exportação HAR 1.2**, sempre com dados sensíveis mascarados.

**Segurança desta fase:**
- Cada registro que chega da página passa por validação de tipo, tamanho e formato (`sanitizeEntry`). Os corpos são limitados a 256 KB, com aviso de truncado.
- Tudo o que vem da página é exibido como texto: nenhum `innerHTML`. Isso é testado com uma resposta HTML maliciosa.
- `Authorization`, `Cookie`, `Set-Cookie`, chaves de API, tokens na URL e campos como `password`/`token` em corpos JSON ou de formulário aparecem mascarados por padrão (o olho revela só na sessão) e sempre mascarados no HAR. Valores sensíveis digitados no console de APIs ficam em campo de senha.
- O console de APIs aceita só `http(s)` ou caminhos do projeto (recusa `javascript:`, `data:`, `chrome-extension:`…) e métodos conhecidos, e envia `credentials: "omit"`. A ordem chega pelo sandbox, que repassa só campos simples, e o runtime só aceita da janela pai (iframes de terceiros na página não conseguem disparar).
- As mensagens de rede são aplicadas em lote, então uma página que dispara milhares de requisições não trava o editor.
- **Correção encontrada na revisão:** conteúdo com `$&`, `$'` ou `` $` `` (em arquivos, mocks ou SVG) era interpretado como padrão de substituição ao montar o preview e ao substituir em todo o projeto. Agora a inserção é sempre literal.

**Testes:** `tests/e2e/rede.py` (46 verificações, com a "internet" simulada pelo Playwright).

## O que já existe (fase 2)

**Pasta local** (`src/lib/localfs.ts` e `src/lib/useFolderSync.ts`), as quatro etapas:

1. **Leitura e escrita:** abrir uma pasta como projeto ou vincular um projeto existente.
   - Se a pasta já tiver arquivos, você escolhe: "gravar o projeto na pasta" ou "trazer a pasta para o projeto".
   - Grava só os arquivos que mudaram, com debounce e uma operação de disco por vez.
   - Criar, renomear, mover e excluir valem na pasta. Pastas que ficaram vazias são removidas sem recursão, então nunca apaga o que o Poiesis não mostra.
2. **Mudanças externas e conflitos:**
   - A pasta é varrida ao focar a aba, a cada 4 s com a aba visível e pelo `FileSystemObserver` quando o navegador tem.
   - Uma mudança de fora sem edição local pendente entra sozinha, com uma versão "Antes de mudanças da pasta" no histórico.
   - Se o arquivo mudou no disco e também tem edição local, o Poiesis **não sobrescreve**. A versão local vai para o histórico (motivo "Conflito"), a do disco é carregada e o comparador abre.
   - Arquivo apagado fora mas com edição local pendente é gravado de novo.
3. **Reconexão:**
   - Na abertura, confere a permissão e se a pasta ainda existe.
   - Sem permissão ou sem a pasta, mostra uma faixa de aviso e o projeto fica **somente leitura** (editor travado e alterações bloqueadas), com "Permitir acesso / Tentar de novo" e "Desvincular".
   - Mudanças feitas com o Poiesis fechado entram na reabertura.
4. **Ignorados e polimento:**
   - Lista configurável nas Preferências, mais o `.gitignore` da pasta.
   - Limites: 2.000 arquivos, 20 MB por arquivo e 300 MB por projeto, com o que ficou de fora mostrado no menu da pasta.
   - Indicador na barra de status com menu (sincronizar, reconectar, desvincular), comandos na paleta, botões no painel Projetos e indicação da pasta em cada projeto da lista.

**Testes:** `tests/e2e/pasta.py` usa uma pasta do OPFS no lugar do seletor do sistema, que não dá para automatizar, e cobre leitura, ignorados, escrita, criar/renomear/excluir, mudança externa, conflito, reabertura, pasta removida, vincular e desligar a opção.

**Limites conhecidos:**
- O pedido de permissão do Chrome depois de reiniciar só é testável à mão, porque o OPFS nunca pede permissão.
- Com a opção desligada, projetos já vinculados continuam vinculados (o indicador e o menu "Desvincular" continuam aparecendo). Só somem as entradas para abrir e vincular pastas novas.

---

## Módulo 7 — Pasta local (edição direta no computador)

### Objetivo

Permitir que um projeto do Poiesis seja uma **pasta real do computador**, aberta, editada e salva no lugar, sem importar nem exportar. Isso aproxima o fluxo do de um editor desktop e torna o Poiesis útil para projetos que já existem (inclusive outras extensões). É uma **opção nas Preferências**, desligada por padrão. O modo atual, com os projetos guardados no navegador, continua sendo o padrão.

### Como funciona no Chrome

A [File System Access API](https://developer.chrome.com/docs/capabilities/web-apis/file-system-access) (`showDirectoryPicker`) funciona em páginas de extensão e **não precisa de nenhuma permissão nova no manifesto**: o acesso é concedido pelo usuário, pasta por pasta, pelo seletor do sistema. O identificador da pasta (`FileSystemDirectoryHandle`) pode ser guardado no IndexedDB, que já existe desde a Fase 0. Depois de reabrir o navegador, o Chrome pede de novo a confirmação (`requestPermission`, que exige um clique), a menos que o usuário tenha escolhido "Permitir sempre neste site", disponível nas versões recentes.

### Funcionalidades

- **Preferência "Pasta no computador"** (desligada por padrão). Ligada, ela habilita:
  - "Abrir pasta…" na barra de projetos e na paleta de comandos, que cria um projeto vinculado;
  - "Vincular a uma pasta…" num projeto existente, que pergunta antes se deve gravar os arquivos do projeto na pasta ou trazer os da pasta.
- **Indicador de vínculo:** um ícone e o caminho da pasta no topo e na barra de status. Também mostra o estado: vinculado, aguardando permissão, desconectado ou em conflito.
- **Leitura:** varre a pasta respeitando uma lista de ignorados (`node_modules`, `.git`, `dist`, `build` e o `.gitignore` quando houver) e limites de quantidade e tamanho, com aviso do que ficou de fora. Textos entram como arquivos editáveis e binários como assets, carregados sob demanda.
- **Escrita:** salva no disco com debounce, só os arquivos alterados, usando o stream gravável do arquivo (o Chrome grava num temporário e troca no fim, então não deixa arquivo pela metade). Criar, renomear, mover e excluir arquivos e pastas no explorador reflete na pasta.
- **Mudanças externas:** quando o arquivo é editado fora do Poiesis (VS Code, git pull), ele detecta (pelo `FileSystemObserver` onde existir; senão comparando data de modificação e tamanho ao focar a aba e a cada tantos segundos) e:
  - se não houver edição local pendente, recarrega o arquivo e avisa;
  - se houver, entra em **conflito**: grava um snapshot das duas versões e abre o comparador do histórico para o usuário escolher.
- **Histórico continua valendo:** os snapshots ficam no IndexedDB (nunca dentro da pasta), então dá para voltar no tempo mesmo editando no disco.
- **Sem permissão ou sem a pasta** (apagada, movida, disco removido): o projeto fica **somente leitura** com o último conteúdo conhecido, com um botão "Reconectar" ou "Salvar como projeto do navegador". Nada é perdido em silêncio.
- **Desvincular:** o projeto vira um projeto comum do navegador, com uma cópia do conteúdo atual.

### Limites e cuidados

- Precisa do Chrome 122 ou mais novo para a permissão persistente. Em versões antigas, a confirmação aparece a cada sessão. Edge e Opera seguem o Chromium; Firefox não tem a API, e lá a opção fica escondida.
- O Chrome bloqueia pastas sensíveis (raiz do disco, pasta do sistema, a própria pasta de perfil), e o Poiesis mostra a mensagem do navegador.
- **Privacidade:** nada sai do computador. Os arquivos são lidos e gravados localmente, então a ficha da loja e o `PRIVACIDADE.md` não mudam. Só ganham uma linha explicando a opção.
- O preview continua no sandbox. Ele recebe o conteúdo montado pelo editor e **nunca** o identificador da pasta.
- Arquivos grandes demais ou binários em excesso ficam fora do índice do autocompletar e do histórico automático, pelos limites que já existem.

### Critérios de aceite

- [ ] Com a opção desligada, nada muda na interface nem no comportamento.
- [ ] Abrir uma pasta lista os arquivos (respeitando os ignorados) e o preview funciona igual a um projeto importado.
- [ ] Editar e salvar grava no disco só os arquivos alterados; uma interrupção não deixa arquivo pela metade.
- [ ] Criar, renomear, mover e excluir no explorador refletem na pasta, com snapshot antes das operações destrutivas.
- [ ] Mudança feita fora do Poiesis é detectada; sem edição local, recarrega; com edição local, abre o conflito sem perder nenhuma das versões.
- [ ] Ao reabrir o navegador, o projeto pede a permissão com um clique e volta ao estado vinculado.
- [ ] Pasta removida ou sem permissão deixa o projeto somente leitura, com caminho de recuperação claro.
- [ ] Testes E2E com uma pasta temporária: leitura, escrita, mudança externa, conflito e desvincular.

### Etapas

1. **Leitura e escrita básicas:** abrir, editar, salvar, criar e excluir, com a preferência e o indicador de vínculo.
2. **Mudanças externas e conflitos,** integrados ao comparador do histórico.
3. **Reconexão,** permissão persistente, somente leitura e desvincular.
4. **Ignorados configuráveis,** limites e polimento (status na barra, paleta de comandos e atalhos).

## Módulo 8 — Mascotes Lúmen e Pólen

### Objetivo

Dois mascotes que fazem companhia enquanto a pessoa programa, no espírito do "Claude buddy": pequenos, simpáticos e discretos. Eles dão personalidade ao Poiesis e reagem ao que acontece no editor, sem atrapalhar o trabalho.

### Ideia inicial

- **Lúmen** e **Pólen** ficam num canto da interface (posição configurável) e podem ser escondidos a qualquer momento.
- Reagem a eventos locais do editor: salvar, erro no console, verificação sem problemas, preview recarregado, muito tempo parado, fim de uma sessão longa (lembrete de pausa).
- Falas curtas e ocasionais, nunca em sequência; dá para silenciar as falas e manter só as animações.
- Uma dica rápida de vez em quando (atalhos, recursos pouco conhecidos), desligável.

### Regras

- **Desligável** nas Preferências, com opção de mostrar só um, os dois ou nenhum.
- **Sem rede, sem telemetria:** tudo roda localmente, com as artes e as falas empacotadas na extensão.
- Não cobre o editor nem o preview, não rouba o foco e respeita `prefers-reduced-motion` (sem animação, só troca de pose).
- Acessível: as falas usam uma região `aria-live` educada, e o mascote pode ser ignorado pelo leitor de tela.
- Leve: animação em CSS ou SVG, sem biblioteca pesada.

### Em aberto

- **Arte:** a ilustração dos dois (possivelmente feita pelo autor) e o estilo das poses.
- **Personalidade** de cada um e como se diferenciam (por exemplo, um mais curioso e outro mais calmo).
- O conjunto de eventos e falas da primeira versão.

## Módulo 9 — Música de foco

### Objetivo

Um botão para tocar uma música de fundo relaxante, que ajuda na concentração.

### Ideia inicial

- Botão na barra superior (ou junto dos mascotes) para tocar e pausar, com volume e repetição.
- **Desligado por padrão.** Só começa depois de um clique, conforme as regras de reprodução automática do navegador.
- Entrada e saída suaves (*fade*), e pausa automática opcional quando a aba fica escondida.
- A preferência de volume fica salva localmente.

### Regras

- A faixa (a definir) vem **empacotada na extensão**: sem streaming e sem nenhuma conexão externa, para manter a privacidade.
- Só faixas com licença compatível (CC0, domínio público ou composição própria), registradas em `THIRD_PARTY_LICENSES.txt` quando for o caso.
- Atenção ao tamanho do pacote: um arquivo comprimido (Opus/OGG) curto e que repete bem.

### Em aberto

- Qual música (ou quais, se houver mais de uma opção) e a licença.

