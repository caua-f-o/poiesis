# Poiesis — Especificação de evolução

**Recursos selecionados:** 01 · Inspetor visual bidirecional; 04 · Painel Network & APIs; 05 · Extension Studio; 06 · Histórico e snapshots locais.  
**Visão:** IDE para desenvolvimento web com funcionamento **local-first**, recursos online opcionais e integração nativa ao fluxo de trabalho de extensões.  
**Status:** proposta técnica; funcionalidades abaixo **não devem ser consideradas implementadas**.  
**Diretriz central:** ampliar a solução existente sem quebrar editor, autocomplete, preview, console, sandbox, armazenamento e exportação atuais.

---

## 0. Regras de implementação comuns

1. **Offline por padrão.** Edição, inspeção, histórico, modelos e mocks devem funcionar sem rede. Acesso a APIs reais é opcional e depende de conectividade, permissões e políticas CORS.
2. **Segurança.** Código de projeto permanece isolado em sandbox. Nenhuma mensagem `postMessage` é confiável por padrão: validar `origin` (quando aplicável), `source`, estrutura, versão e tipo; usar tokens/canais de sessão quando necessário. Não expor APIs privilegiadas da extensão ao preview.
3. **Fidelidade.** Alterações visuais devem modificar o código-fonte de maneira previsível; quando a origem de um estilo não for identificável, oferecer fallback explícito — nunca simular edição permanente.
4. **Modularidade.** Carregar recursos sob demanda; evitar dependências obrigatórias pesadas e preservar a inicialização do editor.
5. **Privacidade.** Projetos, snapshots, logs e respostas de APIs armazenados localmente; nunca enviar conteúdos automaticamente a serviços externos.
6. **Compatibilidade.** Considerar Manifest V3 e as restrições de CSP, service worker, permissões e execução de código remoto nas plataformas Chromium.
7. **UX.** Todos os painéis devem ser redimensionáveis/recolhíveis, acessíveis por teclado e integrados ao tema vigente.
8. **Resiliência.** Operações de gravação atômicas quando possível; migração de esquema; indicação de quota de armazenamento; opção de exportar e restaurar dados.

---

## 1. Inspetor visual bidirecional

### Objetivo
Permitir selecionar elementos no preview, examinar DOM e CSS computado e, quando tecnicamente viável, editar suas propriedades **refletindo as mudanças nos arquivos do projeto**. O caminho inverso também deve existir: selecionar um trecho reconhecível no editor e destacar o elemento correspondente no preview.

### Funcionalidades

- **Seleção visual:** ferramenta de apontar elemento, contorno de hover, breadcrumb de ancestrais, indicação de tag, ID, classes e dimensões.
- **Árvore DOM:** expandir/recolher nós, filtrar, navegar com teclado, ver atributos e texto. Distinguir DOM gerado dinamicamente do HTML original.
- **Painel de estilos:** regras aplicadas, estilos computados, valores herdados, variáveis CSS, pseudoestados simuláveis (`:hover`, `:focus`, etc.), box model e propriedades editáveis.
- **Edição com duas modalidades:** (a) experimento temporário no preview; (b) aplicação explícita ao arquivo de origem, com diff antes de salvar e `undo/redo`.
- **Vínculo código ↔ preview:** mapear elementos para posições de origem por meio de IDs de instrumentação e mapas de fonte, quando disponíveis; abrir arquivo/linha correlatos.
- **CSS inteligente:** respeitar especificidade, media queries, `@layer`, classes compartilhadas e `!important`; avisar quando a alteração afetar múltiplos elementos.
- **Controles visuais:** espaçamento, dimensões, flex/grid, tipografia, cores, bordas, sombras, transformações e posicionamento.
- **Modo de inspeção não invasivo:** não interceptar cliques do aplicativo quando desligado.

### Abordagem técnica

1. Instrumentar o HTML/JSX/DOM do **preview**, e não o editor principal; associar seletores/nós a metadados de origem quando o pipeline permitir.
2. Criar canal tipado `preview ↔ host` com ações como `inspect:hover`, `inspect:select`, `inspect:computed-style`, `inspect:apply-temporary` e `inspect:resolve-source`.
3. Usar parser AST de HTML/CSS para alterações persistentes; **não** editar fontes por substituição cega de strings ou regex.
4. Criar transação no editor para cada alteração persistente e registrar snapshot/undo conforme o módulo 6.
5. Para frameworks, shadow DOM, nós gerados por JS ou CSS sem origem rastreável, oferecer inspeção e **cópia de CSS** ou criação de override explícito, avisando sobre a limitação.
6. Evitar aplicar o inspetor a páginas arbitrárias sem isolamento, consentimento e escopo apropriado.

### Critérios de aceite

- [ ] Selecionar um elemento no preview mostra DOM, box model e estilos.
- [ ] Selecionar nó correspondente no DOM destaca-o no preview.
- [ ] Edição temporária pode ser descartada sem alterar arquivos.
- [ ] Edição persistente simples em HTML/CSS atualiza a origem correta, com undo/redo.
- [ ] Alterações ambíguas indicam claramente que não há mapeamento seguro.
- [ ] Inspeção não quebra eventos do aplicativo nem aumenta significativamente o custo quando desligada.

---

## 4. Painel Network & APIs

### Objetivo
Adicionar ferramentas para acompanhar requisições originadas no ambiente de preview e desenvolver interfaces dependentes de dados **sem precisar de um backend em funcionamento**.

### Funcionalidades

- **Registro de requisições:** método, URL, status, início, duração, tamanho estimado, erro, origem da chamada e filtros por tipo/status/texto.
- **Detalhes:** headers, query params, payload, response, JSON formatado e visualização textual; omitir/mascarar credenciais por padrão.
- **Fetch/XHR monitorados:** captura por instrumentação precoce no ambiente isolado do preview. Indicar expressamente requisições que não puderem ser observadas.
- **Console de APIs:** construir requisições REST, selecionar método, editar corpo/headers e visualizar resposta.
- **Mocks locais:** configurar endpoints simulados por URL/método e retornar JSON, códigos HTTP, latência artificial e respostas de erro, mesmo offline.
- **Fixtures:** salvar conjuntos de respostas em arquivos do projeto para reutilização e testes determinísticos.
- **Diagnóstico:** diferenciar bloqueio CORS, indisponibilidade de rede, timeout, falha de DNS (quando detectável) e código HTTP de erro.
- **Exportação:** HAR **sanitizado** ou JSON próprio; avisar que capturas podem conter dados sensíveis.

### Limites técnicos importantes

- `fetch`/XHR instrumentados **não** equivalem ao painel Network completo do Chrome DevTools: podem não cobrir requisições de tags, WebSocket, service workers, cache ou contextos alheios.
- CORS e CSP não devem ser burlados com acesso privilegiado silencioso. Eventual proxy online deve ser explícito, opcional e nunca receber tokens sem consentimento.
- Captura de tráfego externo às páginas de preview exigiria **integração específica e permissões adicionais**; não incluí-la silenciosamente na primeira versão.
- Nunca persistir automaticamente `Authorization`, `Cookie`, credenciais em URL ou dados pessoais em logs/snapshots.

### Critérios de aceite

- [ ] `fetch` do preview aparece no painel com status e duração.
- [ ] Requisição mockada funciona sem internet e reproduz erro/latência configurados.
- [ ] Usuário consegue limpar, pesquisar e exportar log sanitizado.
- [ ] Logs não vazam entre projetos e são limitados por tamanho/quantidade.
- [ ] Interface distingue 'sem resposta HTTP' de 'HTTP 404/500'.
- [ ] Nenhum dado é encaminhado a servidor próprio por padrão.

---

## 5. Extension Studio — Manifest V3

### Objetivo
Criar um espaço especializado para construir, revisar, empacotar e testar extensões Chromium a partir dos recursos web do Poiesis.

### Funcionalidades

- **Assistente de criação:** templates para popup, options page, side panel, content script, background service worker, action e combinações.
- **Editor de `manifest.json`:** formulário visual sincronizado com JSON (sem apagar campos desconhecidos), validação de tipos, permissões e caminhos.
- **Mapa arquitetural:** árvore de arquivos e vínculos entre manifesto, entradas JS/HTML/CSS, assets e ícones.
- **Permissões explicadas:** diferenciar `permissions`, `host_permissions`, `optional_permissions` e permissões em tempo de execução, destacando impacto e minimização.
- **Previews seguros:** popup, options e side panel com dimensões aproximadas e mocks de APIs `chrome.*`; marcar como simulações.
- **Testes:** checagem de recursos ausentes, caminhos inválidos, CSP, sintaxe JSON e referências a arquivos.
- **Gerador de ícones:** importar imagem-base, validar tamanhos e gerar assets adequados.
- **Exportação:** ZIP de extensão com estrutura pronta para **carregar sem compactação** (após extrair) e, quando desejado, publicar posteriormente nas lojas.
- **Modo extensão complementar:** modelos para comunicação `runtime.sendMessage`/`onMessageExternal`, configuração explícita de `externally_connectable` quando pertinente e validação de identificadores/origens.

### Limites reais de preview e execução

- A simulação não reproduz integralmente `chrome.runtime`, service workers MV3, injeção real de content scripts, ciclo de vida do navegador e restrições de permissões.
- **Teste real** deve ocorrer com a extensão empacotada/descompactada instalada no navegador em modo de desenvolvedor. Não afirmar que um preview simulado equivale à execução nativa.
- Não permitir baixar JS remoto e executá-lo como código privilegiado da extensão hospedante; usar bibliotecas locais permitidas e pipelines de build compatíveis com políticas MV3.
- Validar comunicação entre extensões por lista de remetentes confiáveis, quando aplicável; evitar confiar só no conteúdo da mensagem.

### Critérios de aceite

- [ ] Criar projeto MV3 mínimo com manifesto válido e popup funcional.
- [ ] Formulário de manifesto e JSON permanecem sincronizados.
- [ ] Erros de referências/arquivos faltantes são apontados antes da exportação.
- [ ] Templates de service worker, content script e side panel não anunciam comportamentos indisponíveis em preview.
- [ ] ZIP exportado pode ser extraído e carregado pelo Chrome/Edge em modo desenvolvedor.
- [ ] Projeto exemplo de extensão complementar comunica-se com extensão principal após configuração explícita.

---

## 6. Histórico e snapshots locais

### Objetivo
Permitir voltar a estados anteriores de um arquivo ou projeto sem depender de Git, nuvem ou conexão com a internet.

### Funcionalidades

- **Snapshots automáticos:** após período de inatividade, antes de ações destrutivas, antes de refatorações e antes de importar/substituir conteúdo.
- **Snapshots manuais:** nome, anotação, data, origem e marcadores/favoritos.
- **Timeline:** visualizar evolução do projeto e filtrar por arquivo, momento e tipo de evento.
- **Comparador de versões:** diff lado a lado ou inline, destaque de mudanças e opção de restaurar trecho, arquivo ou projeto completo.
- **Restauração segura:** sempre criar snapshot pré-restauração; mostrar confirmação e escopo.
- **Deduplicação:** armazenar blobs por hash e referências a manifests de versões; compactação e política de retenção configuráveis.
- **Persistência:** IndexedDB/OPFS conforme compatibilidade; migrações, controle de quota e mensagens claras de falha por falta de espaço.
- **Portabilidade:** exportar/importar histórico em formato versionado, incluindo integridade por hash.
- **Privacidade:** excluir segredos conhecidos, pastas de build e arquivos grandes quando configurado; nenhum upload automático.

### Modelo de dados sugerido

```text
Project
  ├─ currentRevisionId
  ├─ Files / blobs (hash → conteúdo)
  └─ Revisions
       ├─ revisionId
       ├─ parentRevisionId
       ├─ timestamp
       ├─ reason: auto | manual | import | pre-restore
       ├─ label / note
       └─ entries: caminho → hash do arquivo
```

### Política inicial sugerida

- Autosnapshot após **30–60 segundos sem edição**, com debounce e sem gerar versão se nada mudou.
- Snapshot obrigatório antes de operação destrutiva.
- Manter checkpoints manuais até exclusão explícita ou confirmação; limitar automaticamente apenas snapshots automáticos mais antigos.
- Mostrar consumo de espaço e oferecer exportação antes de apagar versões antigas.
- Gravação consistente: uma revisão só passa a ser visível após todos os seus blobs e metadados terem sido persistidos.

### Critérios de aceite

- [ ] Editar arquivo e aguardar o intervalo definido gera snapshot automático único.
- [ ] Repetir salvamento sem mudanças não duplica conteúdo.
- [ ] Comparar duas versões exibe diferença correta.
- [ ] Restaurar arquivo preserva recuperação do estado anterior.
- [ ] Fechar/reabrir o Poiesis mantém o histórico local, salvo exclusão de dados do navegador.
- [ ] Falta de espaço gera erro recuperável sem corromper a versão atual.

---

## Integração entre os quatro módulos

| Origem | Integração recomendada |
|---|---|
| Inspetor visual → Snapshots | Registrar checkpoint antes de mudanças persistentes em HTML/CSS. |
| Network → Snapshots | Salvar mocks/fixtures **do projeto**, mas nunca capturas com tokens por padrão. |
| Extension Studio → Network | Mocks para requisições do popup/options; indicar que background real requer teste no navegador. |
| Extension Studio → Inspetor | Inspeção visual de popup/options simulados. |
| Extension Studio → Snapshots | Checkpoint antes de alterar manifesto, permissões, templates e build. |

### APIs internas propostas (contratos ilustrativos)

```ts
interface PoiesisFeatureModule {
  id: string;
  activate(context: ProjectContext): Promise<void>;
  deactivate(): Promise<void>;
}

interface ProjectRevisionService {
  createSnapshot(reason: string, label?: string): Promise<string>;
  listSnapshots(projectId: string): Promise<RevisionSummary[]>;
  diff(fromId: string, toId: string): Promise<FileDiff[]>;
  restore(revisionId: string, paths?: string[]): Promise<void>;
}

interface PreviewBridgeMessage {
  version: 1;
  sessionId: string;
  requestId: string;
  kind: string;
  payload: unknown;
}
```

Essas interfaces são pontos de partida, **não descrições da API atual do Poiesis**.

---

## Fases e prioridades

| Fase | Entrega | Dependências principais |
|---|---|---|
| **0 — Fundação** | Canal tipado, isolamento, testes, camada de projetos e controle de quota | Base existente |
| **1 — Histórico local** | Snapshots, diff, restauração e exportação | Armazenamento confiável |
| **2 — Inspetor MVP** | Seleção DOM, estilos computados, CSS temporário | Ponte com preview |
| **3 — Network MVP** | Instrumentação `fetch`/XHR e mocks locais | Ponte com preview |
| **4 — Extension Studio MVP** | Templates MV3, manifesto, validação, exportação ZIP | Projetos e build |
| **5 — Integração avançada** | Alteração AST bidirecional, fixtures, mocks `chrome.*`, snapshots coordenados | MVPs validados |

### Estratégia de testes

- **Unitários:** parser de manifestos, normalização de caminhos, armazenamento por hash, sanitizer de headers e resolução de estilos.
- **Integração:** projeto → preview → inspect/network → alteração → snapshot → restauração.
- **E2E em Chromium:** instalar extensão de teste exportada; validar popup, service worker, content scripts e permissões.
- **Offline:** iniciar sem rede e criar, editar, pré-visualizar, mockar, salvar, restaurar e exportar projeto.
- **Regressão:** editor, Emmet, CodeMirror, console, REPL, importação ZIP e temas permanecem funcionais.
- **Segurança:** mensagens malformadas, payloads excessivos, requisições com segredos, CSP, DOM não confiável e tentativas de acesso ao host pelo preview.

---

## Definição de pronto (DoD)

Uma funcionalidade só deve ser tratada como concluída quando:

- [ ] Realmente funciona, sem botões decorativos ou operações simuladas apresentadas como reais.
- [ ] Opera offline no escopo declarado.
- [ ] Tem testes de regressão e casos de erro relevantes.
- [ ] Não enfraquece o isolamento do preview nem amplia permissões sem justificativa.
- [ ] Preserva a experiência e os dados dos projetos existentes.
- [ ] Possui mensagens de limitação claras e documentação de uso.
- [ ] Mantém desempenho adequado mesmo em projetos maiores.

> **Princípio final:** fazer do Poiesis uma IDE web de criação e experimentação, não uma cópia monolítica do DevTools ou do VS Code. Primeiro implementar um núcleo confiável; depois integrar as quatro ferramentas em uma experiência coesa.
