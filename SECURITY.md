# Segurança

## Como relatar uma vulnerabilidade

Use **"Report a vulnerability"** na aba *Security* do repositório no GitHub, que abre um relato privado. Não abra uma issue pública para vulnerabilidades. Relatos são respondidos assim que possível. Se confirmado, a correção sai numa nova versão e o relato recebe crédito, se você quiser.

## Modelo de ameaças (resumo)

O Poiesis executa código escrito pelo usuário e, às vezes, código de terceiros que esse código carrega (CDNs, iframes, APIs). O princípio é: **nada que vem da página do preview é confiável.**

- **Isolamento:** o preview roda numa página `sandbox` declarada no manifesto, com origem opaca (`null`) e sem acesso às APIs `chrome.*` nem aos dados da extensão. As páginas da extensão mantêm a CSP padrão do Manifest V3 (sem `eval`, sem scripts remotos).
- **Canal preview → editor:**
  - o editor só aceita mensagens da janela do iframe do preview;
  - cada mensagem traz versão e token da sessão;
  - tipo, formato e tamanho de cada campo são conferidos (`src/lib/bridge.ts`, `src/lib/net.ts`, `src/lib/inspect.ts`).
- **Canal editor → preview:**
  - comandos (console, destaque, console de APIs, inspetor) só são aceitos pelo runtime quando vêm da página sandbox;
  - iframes de terceiros dentro da página do usuário não conseguem enviá-los.
- **Exibição:** conteúdo vindo da página (logs, respostas de rede, Markdown) é exibido como texto ou passa pelo DOMPurify. Não há `innerHTML` com dados não confiáveis.
- **Inspetor:** a seleção só escuta eventos da página enquanto está ativa; o contorno fica num shadow root fechado com HTML fixo; nomes de propriedade editados passam por filtro e os valores vão por `style.setProperty`. As edições são temporárias e nunca tocam nos arquivos.
- **Extension Studio:** as APIs `chrome.*` do preview são uma simulação em JavaScript comum, dentro da página isolada, sem nenhum privilégio. As mensagens dela (armazenamento simulado e tamanho do popup) passam pela mesma validação. O ZIP exportado nunca leva o runtime do Poiesis nem nomes de arquivo que escapariam da pasta ao descompactar. O modelo de extensão principal confere o remetente (`externally_connectable` + checagem no service worker).
- **Montagem do preview:** nomes de arquivo e conteúdo do usuário entram de forma literal (sem padrões `$&`), com aspas, `-->` e `</style` escapados.
- **Dados sensíveis:**
  - o registro de rede fica só na memória;
  - credenciais aparecem mascaradas por padrão e sempre na exportação;
  - nada é enviado a servidores do Poiesis (não existem).
- **Pasta no computador:** acesso concedido pelo usuário, pasta por pasta. O Poiesis nunca apaga recursivamente o que não mostra, e não sobrescreve arquivo alterado por outro programa (vira conflito, com as duas versões no histórico).
- **Permissões:** só `storage` e `unlimitedStorage`.

## Testes

`pnpm build && pnpm test:e2e` inclui testes de segurança: mensagens forjadas, iframe de terceiro tentando executar código ou disparar requisições, resposta HTML maliciosa, URLs perigosas no console de APIs, mascaramento no HAR, inundação de mensagens, padrões `$&` no conteúdo, atributos maliciosos no inspetor, iframe de terceiro tentando ligar a seleção e mensagens forjadas do Extension Studio. A suíte `extensao` também carrega o ZIP exportado num Chromium real e confere que uma extensão não autorizada não consegue falar com a principal.
