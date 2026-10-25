# Roadmap do Poiesis

Este é o plano vivo de evolução do Poiesis. A especificação detalhada dos módulos 1, 4, 5 e 6 (objetivos, limites técnicos e critérios de aceite) está em [`docs/especificacao-modulos-1-4-5-6.md`](docs/especificacao-modulos-1-4-5-6.md). Ela continua valendo, inclusive as regras comuns e a definição de pronto. Aqui ficam a ordem, o status e o módulo 7 (pasta local), que entrou depois.

**Visão:** uma IDE web local-first, com recursos online opcionais e integrada ao fluxo de criação de extensões, sem virar cópia do DevTools ou do VS Code.

## Fases

| Fase | Entrega | Status |
| --- | --- | --- |
| **0 — Fundação** | Armazenamento em IndexedDB (um registro por projeto, gravação incremental e atômica), migração do formato antigo, indicador de espaço, canal do preview versionado e validado, testes E2E no repositório | ✅ 2.4.0 |
| **1 — Histórico local** (módulo 6) | Snapshots por hash, automáticos e manuais, pontos antes de operações destrutivas, linha do tempo, comparador lado a lado e em linha, restauração de trecho, arquivo ou projeto, retenção, exportar e importar | ✅ 2.4.0 |
| **2 — Pasta local** (módulo 7) | Editar diretamente uma pasta do computador, como opção nas preferências | Planejado |
| **3 — Network MVP** (módulo 4) | Captura de `fetch`/XHR do preview, mocks locais, latência e erros simulados | Planejado |
| **4 — Inspetor MVP** (módulo 1) | Seleção no preview, árvore DOM, estilos computados, box model, edição temporária | Planejado |
| **5 — Extension Studio MVP** (módulo 5) | Templates MV3, editor de manifesto sincronizado, validação e exportação em ZIP | Planejado |
| **6 — Integração avançada** | Edição persistente pelo inspetor (com mapeamento seguro), fixtures, mocks de `chrome.*`, snapshots coordenados entre módulos | Planejado |

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

**Pendências desta fase:**
- Filtro de "segredos conhecidos" (por exemplo `.env`) nos snapshots: hoje o limite por tamanho de arquivo cobre o caso dos binários grandes.
- Recuperar um projeto excluído direto pelo histórico: hoje o histórico dele fica guardado até ser limpo, mas não há botão para recriar o projeto.

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
