# Ficha da Chrome Web Store

Este arquivo reúne o texto e as respostas para colar no painel do desenvolvedor da Chrome Web Store. As imagens estão nesta mesma pasta.

## Pacote

- **Arquivo para enviar:** `Poiesis-webstore-<versão>.zip`. Ele tem o `manifest.json` na raiz e é gerado a partir do `dist/`.
- **Versão:** a do `manifest.json`. Cada atualização na loja precisa de um número maior que o anterior.

## Detalhes do produto

**Nome:** Poiesis

**Resumo** (vem do `manifest.json`, até 132 caracteres):

> Do código à forma: editor web (HTML, CSS, JS, JSON, Markdown) com preview ao vivo, correções, console e projetos.

**Categoria:** Ferramentas do desenvolvedor (Developer Tools)

**Idioma:** Português (Brasil)

**Descrição:**

```
Poiesis — do grego ποίησις, "trazer à existência o que antes não era".

Um editor de código web completo numa aba do Chrome: escreva HTML, CSS e JavaScript e veja o resultado ao lado, a cada tecla. Sem instalar nada, sem conta, sem servidor — tudo fica no seu navegador.

EDITOR
• Realce de sintaxe no estilo do VS Code, com as tags <html>, <head> e <body> destacadas
• Autocompletar que conhece o seu projeto: classes e ids do CSS no HTML (e vice-versa), arquivos do projeto em src/href/url(), variáveis CSS, animações, eventos, seletores e chaves do localStorage
• Definições em português: passe o mouse sobre uma tag, atributo, propriedade ou API para ver o que é e para que serve
• Verificação ao vivo com correção em um clique: tags e propriedades escritas errado, valores inválidos, arquivos que não existem, ids e classes inexistentes no JavaScript, JSON inválido
• Emmet: ul>li*3 + Tab vira lista; ! + Tab vira o esqueleto HTML; envolver seleção, contas, incrementar números
• Ir para definição, renomear classes e variáveis em todo o projeto, busca e substituição em todos os arquivos
• Seletor com 3.932 ícones Material Symbols, com busca em português
• Formatação automática (Prettier), multicursor, dobra de código

PREVIEW E CONSOLE
• Preview ao vivo sem piscar, com modos celular e tablet e janela destacada
• Console de verdade com objetos expansíveis e um campo para rodar JavaScript na página
• localStorage, sessionStorage, módulos ES e fetch de arquivos do projeto funcionam no preview

HISTÓRICO LOCAL
• Versões automáticas enquanto você trabalha e antes de excluir, importar ou substituir
• Pontos de restauração com nome e nota
• Compare versões lado a lado e restaure um trecho, um arquivo ou o projeto inteiro — sem Git, sem nuvem

PASTA NO COMPUTADOR (opcional)
• Abra uma pasta real e edite direto nos arquivos — sem importar nem exportar
• Mudanças feitas em outro editor entram sozinhas; conflitos vão para o histórico e abrem a comparação

PROJETOS
• Vários projetos com pastas, arrastar e soltar, e modelos para começar
• Importar arquivos e pastas (adicionando, mesclando ou como projeto novo)
• Exportar em .zip ou como um único arquivo HTML
• JSON, Markdown (com visualização) e texto

9 TEMAS
Tinta & Ouro, Drácula, One Dark, Monokai, Nord, Tokyo Night, Catppuccin Mocha, Solarizado Claro e Papel & Ouro — a interface em Material Design 3 muda junto.

PRIVACIDADE
O Poiesis não coleta nenhum dado. Seus projetos ficam só no seu navegador. O código que você escreve roda numa página isolada, sem acesso à extensão.

Código aberto (GPL-3.0): https://github.com/caua-f-o/poiesis
```

**Descrição em inglês** (opcional; só use se quiser a ficha também em inglês, e deixe claro que a interface é em português):

```
Poiesis — from the Greek ποίησις, "bringing into being what was not there before".

A complete web code editor in a Chrome tab: write HTML, CSS and JavaScript and see the result live, side by side. No install, no account, no server — everything stays in your browser. Note: the interface is in Brazilian Portuguese.

• VS Code-style syntax highlighting, project-aware autocomplete (classes, ids, files, CSS variables)
• Live checking with one-click fixes for misspelled tags, properties, values, missing files and invalid JSON
• Emmet, go to definition, project-wide rename, search and replace, Prettier formatting
• 3,932 Material Symbols icons picker
• Flicker-free live preview with phone/tablet modes, pop-out window and a real console with a REPL
• Local version history: automatic snapshots, named restore points, side-by-side diff and restore (no Git, no cloud)
• Optional: edit a real folder on your computer directly, with external changes and conflict handling
• Multiple projects with folders, import/export (.zip or single HTML), JSON, Markdown and text files
• 9 themes, Material Design 3 interface

Privacy: Poiesis collects no data. Your code runs in an isolated sandbox page. Open source (GPL-3.0): https://github.com/caua-f-o/poiesis
```

## Recursos gráficos

| Campo | Arquivo |
| --- | --- |
| Ícone da loja (128×128) | já vai dentro do pacote: `icons/icon-128.png` |
| Capturas de tela (1280×800) | `captura-1.png` a `captura-5.png`, nesta ordem |
| Bloco promocional pequeno (440×280) | `promo-pequena-440x280.png` |
| Bloco promocional marquee (1400×560, opcional) | `promo-marquee-1400x560.png` |

O que cada captura mostra:

1. Editor e preview ao vivo com o modelo Gênese (tema Tinta & Ouro)
2. Erro de digitação no CSS com o cartão de correção aberto (Drácula)
3. Seletor de ícones Material Symbols buscando "casa"
4. Prévia do Emmet antes de expandir (Tokyo Night)
5. Preview no modo celular e console com objetos (Papel & Ouro)

**Site:** https://github.com/caua-f-o/poiesis

**URL de suporte:** https://github.com/caua-f-o/poiesis/issues

## Aba "Práticas de privacidade"

**Finalidade única:**

```
Editor de código web (HTML, CSS, JavaScript, JSON e Markdown) que abre numa aba e mostra o resultado ao vivo, com todos os projetos guardados localmente no navegador.
```

**Justificativa da permissão `storage`:**

```
Guarda localmente os projetos do usuário (arquivos, pastas, abas abertas), as configurações do editor e o tema escolhido, para que o trabalho continue ao reabrir a extensão. Nada é enviado para fora do navegador.
```

**Justificativa da permissão `unlimitedStorage`:**

```
Os projetos podem conter imagens, fontes e outros arquivos importados pelo usuário, e o Poiesis guarda localmente um histórico de versões desses projetos (IndexedDB). Isso facilmente passa das cotas padrão do armazenamento da extensão. Sem essa permissão, salvar um projeto maior ou uma versão do histórico falharia e o usuário perderia trabalho.
```

**Você usa código remoto?** Resposta recomendada: **Sim**, com a justificativa abaixo. O próprio pacote da extensão não carrega nem executa código remoto. Mas o código que o usuário escreve pode incluir `<script src="https://...">` de CDNs, e isso roda na página sandbox. A política da loja isenta páginas sandbox e iframes isolados da regra de código remoto, mas pede que essa comunicação seja declarada. Declarar evita qualquer leitura de omissão.

```
A extensão em si não carrega nem executa código remoto: todo o código do editor está no pacote. O único código executado fora do pacote é o que o próprio usuário escreve no editor (HTML/CSS/JS do projeto dele), incluindo bibliotecas que ele decida referenciar de uma CDN. Esse código roda exclusivamente na página sandbox declarada no manifesto ("sandbox": ["sandbox.html"]), com origem isolada e sem acesso a nenhuma API da extensão (chrome.*) nem aos dados dela — o mesmo que abrir o arquivo HTML do usuário no navegador. A comunicação com o editor é feita apenas por postMessage, com a origem da mensagem verificada.
```

**Uso de dados:** não marque nenhuma categoria de dados coletados (nenhum dado pessoal, de saúde, financeiro, de autenticação, comunicação pessoal, localização, histórico da web, atividade do usuário ou conteúdo do site é coletado).

Marque as três declarações:

- [x] Não vendo nem transfiro dados de usuários a terceiros fora dos casos de uso aprovados
- [x] Não uso nem transfiro dados de usuários para fins não relacionados à finalidade única do item
- [x] Não uso nem transfiro dados de usuários para determinar capacidade de crédito ou para empréstimos

**URL da política de privacidade:**

```
https://github.com/caua-f-o/poiesis/blob/main/PRIVACIDADE.md
```

## Antes de enviar

- [ ] Criar o repositório público `caua-f-o/poiesis` e dar push (os links acima apontam para ele)
- [ ] Conferir se a versão do `manifest.json` é maior que a última publicada
- [ ] Gerar o zip da loja a partir de um build limpo (`pnpm install && pnpm build`)
- [ ] A conta de desenvolvedor da Chrome Web Store tem uma taxa única de registro
