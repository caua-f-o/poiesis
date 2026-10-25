// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Permissões de extensões Chromium (Manifest V3), explicadas em português.
 * "aviso" é o texto aproximado que o Chrome mostra ao instalar (vazio quando não há aviso). */

export type Risk = "baixo" | "médio" | "alto";

export interface PermInfo {
  name: string;
  desc: string;
  risk: Risk;
  aviso: string;
  /** namespace chrome.* que exige esta permissão (quando houver) */
  api?: string;
}

const P = (name: string, risk: Risk, desc: string, aviso = "", api?: string): PermInfo => ({ name, risk, desc, aviso, api });

export const PERMISSIONS: PermInfo[] = [
  P("activeTab", "baixo", "Acesso temporário à aba atual quando o usuário clica na extensão (ícone, menu ou atalho). Costuma substituir host_permissions amplas.", ""),
  P("alarms", "baixo", "Agendar tarefas no service worker (chrome.alarms), que sobrevivem ao service worker dormir.", "", "alarms"),
  P("background", "médio", "Mantém o Chrome rodando em segundo plano mesmo com as janelas fechadas. Raramente necessária.", "", undefined),
  P("bookmarks", "médio", "Ler e alterar os favoritos (chrome.bookmarks).", "Ler e alterar seus favoritos", "bookmarks"),
  P("browsingData", "médio", "Apagar dados de navegação (cache, cookies, histórico).", "", "browsingData"),
  P("clipboardRead", "alto", "Ler a área de transferência com document.execCommand('paste').", "Ler dados que você copia e cola", undefined),
  P("clipboardWrite", "baixo", "Escrever na área de transferência com execCommand('copy'). navigator.clipboard.writeText não precisa dela numa ação do usuário.", "Modificar dados que você copia e cola", undefined),
  P("contentSettings", "alto", "Mudar configurações por site (cookies, JavaScript, câmera…).", "Alterar configurações que controlam o acesso de sites a recursos como cookies, JavaScript e plug-ins", "contentSettings"),
  P("contextMenus", "baixo", "Adicionar itens ao menu de contexto (botão direito).", "", "contextMenus"),
  P("cookies", "médio", "Ler e alterar cookies (chrome.cookies). Também precisa de host_permissions dos sites.", "", "cookies"),
  P("debugger", "alto", "Usar o protocolo de depuração do Chrome nas abas. Acesso total às páginas.", "Acessar o depurador de páginas", "debugger"),
  P("declarativeContent", "baixo", "Mostrar a ação conforme o conteúdo da página, sem ler a página.", "", "declarativeContent"),
  P("declarativeNetRequest", "médio", "Bloquear ou modificar requisições com regras declarativas (bloqueadores de anúncio).", "Bloquear conteúdo em qualquer página", "declarativeNetRequest"),
  P("declarativeNetRequestWithHostAccess", "médio", "Como declarativeNetRequest, mas só nos sites de host_permissions.", "", "declarativeNetRequest"),
  P("declarativeNetRequestFeedback", "médio", "Ver quais regras declarativas foram aplicadas (útil para depurar).", "Ler seu histórico de navegação", undefined),
  P("desktopCapture", "alto", "Capturar a tela, janelas ou abas.", "Capturar o conteúdo da tela", "desktopCapture"),
  P("downloads", "médio", "Iniciar, acompanhar e gerenciar downloads.", "Gerenciar seus downloads", "downloads"),
  P("favicon", "médio", "Ler os ícones dos sites pela URL _favicon.", "Ler os ícones dos sites que você visita"),
  P("fontSettings", "baixo", "Ler e mudar as configurações de fonte do Chrome.", "", "fontSettings"),
  P("geolocation", "alto", "Usar a localização sem pedir a cada vez.", "Detectar sua localização física"),
  P("history", "alto", "Ler e alterar o histórico de navegação.", "Ler e alterar seu histórico de navegação em todos os dispositivos conectados", "history"),
  P("identity", "baixo", "Login OAuth (chrome.identity).", "", "identity"),
  P("identity.email", "médio", "Saber o e-mail da conta Google do perfil.", "Saber seu endereço de e-mail"),
  P("idle", "baixo", "Saber quando o computador está ocioso ou bloqueado.", "", "idle"),
  P("management", "alto", "Listar, ativar e desativar outras extensões.", "Gerenciar seus apps, extensões e temas", "management"),
  P("nativeMessaging", "alto", "Conversar com um programa instalado no computador.", "Comunicar-se com aplicativos nativos cooperantes", undefined),
  P("notifications", "baixo", "Mostrar notificações do sistema.", "Exibir notificações", "notifications"),
  P("offscreen", "baixo", "Criar um documento escondido para usar APIs do DOM a partir do service worker.", "", "offscreen"),
  P("pageCapture", "alto", "Salvar abas como MHTML.", "Ler e alterar todos os seus dados em todos os sites", "pageCapture"),
  P("power", "baixo", "Impedir que o computador entre em suspensão.", "", "power"),
  P("printerProvider", "médio", "Fornecer impressoras ao Chrome.", "", "printerProvider"),
  P("privacy", "alto", "Mudar configurações de privacidade do Chrome.", "Alterar suas configurações relacionadas a privacidade", "privacy"),
  P("proxy", "alto", "Controlar o proxy do Chrome (todo o tráfego passa por ele).", "Ler e alterar todos os seus dados em todos os sites", "proxy"),
  P("readingList", "médio", "Ler e alterar a lista de leitura.", "Ler e alterar as entradas da lista de leitura", "readingList"),
  P("runtime", "baixo", "Só para chrome.runtime.connectNative/sendNativeMessage em casos específicos.", ""),
  P("scripting", "médio", "Injetar scripts e CSS em páginas (chrome.scripting). Precisa de activeTab ou host_permissions.", "", "scripting"),
  P("search", "baixo", "Fazer uma busca com o buscador padrão.", "", "search"),
  P("sessions", "médio", "Ver e restaurar abas e janelas fechadas recentemente.", "", "sessions"),
  P("sidePanel", "baixo", "Usar o painel lateral (chrome.sidePanel e a chave side_panel).", "", "sidePanel"),
  P("storage", "baixo", "Guardar dados da extensão (chrome.storage.local, sync e session).", "", "storage"),
  P("system.cpu", "baixo", "Informações do processador.", "", undefined),
  P("system.display", "baixo", "Informações dos monitores.", "", undefined),
  P("system.memory", "baixo", "Informações da memória.", "", undefined),
  P("system.storage", "médio", "Informações e ejeção de dispositivos de armazenamento.", "Identificar e ejetar dispositivos de armazenamento", undefined),
  P("tabCapture", "alto", "Capturar áudio e vídeo de uma aba.", "Ler e alterar todos os seus dados em todos os sites", "tabCapture"),
  P("tabGroups", "baixo", "Criar e alterar grupos de abas.", "", "tabGroups"),
  P("tabs", "médio", "Ver URL, título e favicon de todas as abas. chrome.tabs funciona sem ela; só esses campos ficam vazios.", "Ler seu histórico de navegação"),
  P("topSites", "médio", "Ler a lista de sites mais visitados.", "Ler uma lista dos seus sites mais visitados", "topSites"),
  P("tts", "baixo", "Síntese de voz (chrome.tts).", "", "tts"),
  P("ttsEngine", "baixo", "Fornecer um mecanismo de voz.", "Ler todo o texto falado usando a fala sintetizada", "ttsEngine"),
  P("unlimitedStorage", "baixo", "Tirar o limite de 10 MB do chrome.storage.local e do IndexedDB da extensão.", ""),
  P("userScripts", "alto", "Rodar scripts de usuário (gerenciadores como Tampermonkey). Exige ativar o modo desenvolvedor.", "", "userScripts"),
  P("webNavigation", "médio", "Acompanhar a navegação das abas.", "Ler seu histórico de navegação", "webNavigation"),
  P("webRequest", "médio", "Observar requisições (no MV3 não dá para bloquear; use declarativeNetRequest). Precisa de host_permissions.", "", "webRequest"),
  P("webRequestAuthProvider", "médio", "Responder a pedidos de autenticação HTTP.", "", undefined),
];

export const PERM = new Map(PERMISSIONS.map((p) => [p.name, p]));

/** namespace chrome.X → permissão exigida */
export const API_PERMISSION: Record<string, string> = Object.fromEntries(PERMISSIONS.filter((p) => p.api).map((p) => [p.api!, p.name]));
// declarativeNetRequest aceita qualquer uma das duas
API_PERMISSION.declarativeNetRequest = "declarativeNetRequest";

/** APIs que não exigem permissão (para não acusar nada) */
export const FREE_APIS = new Set(["runtime", "i18n", "action", "tabs", "windows", "permissions", "extension", "commands", "omnibox", "devtools"]);

export const BROAD_HOSTS = new Set(["<all_urls>", "*://*/*", "http://*/*", "https://*/*", "*://*/", "file:///*"]);

export const hostRisk = (pattern: string): Risk => (BROAD_HOSTS.has(pattern) || /^\*:\/\/\*\//.test(pattern) ? "alto" : pattern.includes("*") ? "médio" : "médio");

/** Valida um match pattern (https://developer.chrome.com/docs/extensions/develop/concepts/match-patterns). */
export function matchPatternError(p: string): string | null {
  if (p === "<all_urls>") return null;
  const m = /^(\*|https?|wss?|file|ftp|urn):\/\/([^/]*)(\/.*)$/.exec(p);
  if (!m) return `“${p}” não é um padrão válido. Formato: esquema://host/caminho, por exemplo https://*.exemplo.com/*`;
  const [, scheme, host] = m;
  if (scheme === "file") return host ? `Em “file://” o host fica vazio: file:///*` : null;
  if (!host) return `Falta o host em “${p}”.`;
  if (host !== "*" && !/^(\*\.)?[^*:]+(:\d+|:\*)?$/.test(host)) return `Host inválido em “${p}”: o * só pode vir sozinho ou no começo (*.exemplo.com).`;
  return null;
}

/** ID de extensão: 32 letras de a a p. */
export const isExtensionId = (s: string) => /^[a-p]{32}$/.test(s);
