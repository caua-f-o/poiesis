# Política de privacidade do Poiesis

*Última atualização: 24 de outubro de 2026*

O Poiesis é um editor de código que roda inteiramente no seu navegador. **Ele não coleta, não envia e não vende nenhum dado seu.**

## O que fica guardado e onde

- **Seus projetos, arquivos e configurações** (tema, tamanho da fonte, layout) ficam no armazenamento local da extensão (`chrome.storage.local`), dentro do seu próprio navegador.
- **O `localStorage` das páginas que você cria** e abre no preview também fica guardado ali, separado por projeto.
- Nada disso sai do seu computador. O Poiesis não tem servidor, conta, login, análise de uso, telemetria nem anúncios.
- Se você desinstalar a extensão, o Chrome apaga esses dados. Antes de desinstalar, use **Exportar** (`.zip`) ou **Backup** para guardar seus projetos.

## Conexões com a internet

A extensão em si não faz nenhuma requisição de rede. As conexões que podem acontecer são sempre iniciadas por você:

- **O código que você escreve** roda numa página isolada (sandbox), sem acesso aos dados da extensão. Se o seu projeto carregar uma biblioteca de uma CDN, uma fonte do Google Fonts ou chamar uma API com `fetch`, essa requisição sai da sua página, como aconteceria se você abrisse o arquivo no navegador.
- **Os links "Abrir no MDN"** nos cartões de definição abrem a documentação do MDN numa nova aba, só quando você clica.

## Permissões

| Permissão | Para quê |
| --- | --- |
| `storage` | Guardar seus projetos e configurações no próprio navegador. |
| `unlimitedStorage` | Projetos com imagens e fontes podem passar do limite padrão de 10 MB do armazenamento local. |

## Contato

Dúvidas ou problemas: abra uma issue em <https://github.com/caua-f-o/poiesis/issues>.

---

## Privacy policy (English)

Poiesis is a code editor that runs entirely in your browser. **It does not collect, transmit or sell any of your data.** Your projects, files and settings are stored only in the extension's local storage (`chrome.storage.local`) on your device. There is no server, account, analytics, telemetry or advertising. The extension itself makes no network requests. Code you write runs in an isolated sandbox page, and any network request it makes (for example, loading a library from a CDN) is one you wrote. Permissions: `storage` saves your projects locally, and `unlimitedStorage` lets projects with images and fonts exceed the default 10 MB limit. Contact: <https://github.com/caua-f-o/poiesis/issues>.
