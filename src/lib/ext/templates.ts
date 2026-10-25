// SPDX-License-Identifier: GPL-3.0-only
// Copyright (C) 2026 Cauã F. O.
/* Modelos de extensão Manifest V3. O código gerado é pequeno, comentado em português
 * e diz claramente o que só funciona com a extensão instalada no navegador. */
import type { PFile, Project } from "../types";
import { makeFile, uid } from "../files";
import { ICON_SIZES, defaultIconSvg, renderIcons, svgDataUrl } from "./icons";

export type Companion = "nenhum" | "principal" | "complementar";

export interface ExtOptions {
  name: string;
  description: string;
  popup: boolean;
  options: boolean;
  sidepanel: boolean;
  content: boolean;
  background: boolean;
  /** páginas onde o content script roda */
  matches: string;
  companion: Companion;
}

export const DEFAULT_EXT: ExtOptions = {
  name: "Minha extensão",
  description: "Uma extensão feita no Poiesis.",
  popup: true,
  options: false,
  sidepanel: false,
  content: false,
  background: true,
  matches: "https://example.com/*",
  companion: "nenhum",
};

const jsonStr = (s: string) => JSON.stringify(s);
const htmlEsc = (s: string) => s.replace(/[<&>"]/g, (c) => ({ "<": "&lt;", "&": "&amp;", ">": "&gt;", '"': "&quot;" })[c]!);

const SIM_NOTE = `// No preview do Poiesis as APIs chrome.* são SIMULADAS (aparecem no console como
// "[chrome simulado]"). Para testar de verdade: Extensão → Exportar, descompacte e
// carregue a pasta em chrome://extensions com o "Modo do desenvolvedor" ligado.`;

const REAL_ONLY = (what: string) => `// ${what} roda só com a extensão instalada no navegador; o preview do Poiesis
// não executa este arquivo. Para testar: Extensão → Exportar, descompacte e carregue a
// pasta em chrome://extensions ("Carregar sem compactação"). Os console.log daqui
// aparecem em chrome://extensions → "service worker" (ou no DevTools da página, no
// caso de content scripts).`;

const CSS = `/* Estilo compartilhado pelas páginas da extensão */
:root {
  color-scheme: light dark;
  --ouro: #c9a25e;
  --fundo: Canvas;
  --texto: CanvasText;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  font: 14px/1.5 system-ui, sans-serif;
  background: var(--fundo);
  color: var(--texto);
}

.popup { width: 300px; padding: 16px; }
.pagina { max-width: 640px; margin: 0 auto; padding: 32px 24px; }
.painel { padding: 16px; }

h1 { margin: 0 0 8px; font-size: 18px; }
p { margin: 0 0 12px; opacity: .8; }

button {
  display: block;
  width: 100%;
  margin: 8px 0 0;
  padding: 8px 12px;
  border: 0;
  border-radius: 999px;
  background: var(--ouro);
  color: #1a1712;
  font: inherit;
  font-weight: 600;
  cursor: pointer;
}
button:hover { filter: brightness(1.08); }

input, textarea {
  width: 100%;
  padding: 8px 10px;
  border: 1px solid color-mix(in srgb, CanvasText 25%, transparent);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
}
textarea { min-height: 160px; resize: vertical; }

.saida { margin-top: 12px; font-size: 13px; min-height: 1.5em; }
code { font-size: 12px; }
`;

function page(title: string, cls: string, body: string, script: string, module = false) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>${htmlEsc(title)}</title>
  <link rel="stylesheet" href="estilo.css">
</head>
<body class="${cls}">
${body}
  <!-- No MV3 scripts inline são bloqueados: o código fica num arquivo .js -->
  <script${module ? ' type="module"' : ""} src="${script}"></script>
</body>
</html>
`;
}

export function manifestFor(o: ExtOptions): Record<string, unknown> {
  const perms = new Set<string>();
  if (o.popup || o.options || o.sidepanel || o.content || o.companion === "principal") perms.add("storage");
  if (o.sidepanel) perms.add("sidePanel");
  const m: Record<string, unknown> = {
    manifest_version: 3,
    name: o.name.trim() || "Minha extensão",
    version: "1.0.0",
    description: o.description.trim(),
    icons: Object.fromEntries(ICON_SIZES.map((s) => [String(s), `icons/icon-${s}.png`])),
    action: {
      default_title: o.name.trim() || "Minha extensão",
      default_icon: Object.fromEntries([16, 32].map((s) => [String(s), `icons/icon-${s}.png`])),
      ...(o.popup ? { default_popup: "popup.html" } : {}),
    },
  };
  if (o.background || o.companion === "principal" || (o.sidepanel && !o.popup)) m.background = { service_worker: "background.js" };
  if (o.options) m.options_ui = { page: "options.html", open_in_tab: true };
  if (o.sidepanel) m.side_panel = { default_path: "sidepanel.html" };
  if (o.content) m.content_scripts = [{ matches: [o.matches.trim() || "https://example.com/*"], js: ["content.js"], run_at: "document_idle" }];
  if (perms.size) m.permissions = [...perms];
  if (o.companion === "principal") m.externally_connectable = { ids: [] };
  return m;
}

export function extensionFiles(o: ExtOptions): PFile[] {
  const name = o.name.trim() || "Minha extensão";
  const files: PFile[] = [];
  const add = (n: string, c: string) => files.push(makeFile(n, c));
  const m = manifestFor(o);
  add("manifest.json", JSON.stringify(m, null, 2) + "\n");
  add("estilo.css", CSS);

  if (o.popup) {
    const buttons = [
      `  <button id="contar">Contar um clique</button>`,
      `  <p class="saida">Cliques guardados: <b id="total">0</b></p>`,
      o.options ? `  <button id="opcoes">Abrir as opções</button>` : "",
      o.sidepanel ? `  <button id="painel">Abrir o painel lateral</button>` : "",
      o.content ? `  <button id="destacar">Destacar a página atual</button>` : "",
      o.companion === "complementar" ? `  <button id="falar">Falar com a extensão principal</button>` : "",
      o.companion === "principal" ? `  <p class="saida">Última mensagem recebida: <span id="ultima">nenhuma</span></p>` : "",
      `  <p class="saida" id="status"></p>`,
    ].filter(Boolean);
    add("popup.html", page(name, "popup", `  <h1>${htmlEsc(name)}</h1>\n  <p>${htmlEsc(o.description || "Popup da extensão.")}</p>\n${buttons.join("\n")}`, "popup.js", o.companion === "complementar"));
    const js: string[] = [SIM_NOTE, ""];
    if (o.companion === "complementar") js.push(`import { EXTENSAO_PRINCIPAL } from "./config.js";`, "");
    js.push(
      `const $ = (id) => document.getElementById(id);`,
      `const status = (t) => ($("status").textContent = t);`,
      ``,
      `// chrome.storage guarda dados da extensão (precisa da permissão "storage")`,
      `async function mostrar() {`,
      `  const { cliques = 0 } = await chrome.storage.local.get("cliques");`,
      `  $("total").textContent = cliques;`,
      `}`,
      `$("contar").addEventListener("click", async () => {`,
      `  const { cliques = 0 } = await chrome.storage.local.get("cliques");`,
      `  await chrome.storage.local.set({ cliques: cliques + 1 });`,
      `  mostrar();`,
      `});`,
      `mostrar();`
    );
    if (o.options) js.push(``, `$("opcoes").addEventListener("click", () => chrome.runtime.openOptionsPage());`);
    if (o.sidepanel)
      js.push(
        ``,
        `// O painel lateral só abre a partir de um gesto do usuário (este clique)`,
        `$("painel").addEventListener("click", async () => {`,
        `  const janela = await chrome.windows.getCurrent();`,
        `  await chrome.sidePanel.open({ windowId: janela.id });`,
        `  window.close();`,
        `});`
      );
    if (o.content)
      js.push(
        ``,
        `// Pede ao content script da aba atual que destaque a página.`,
        `// Só funciona em páginas onde o content script roda (veja "matches" no manifesto).`,
        `$("destacar").addEventListener("click", async () => {`,
        `  const [aba] = await chrome.tabs.query({ active: true, currentWindow: true });`,
        `  try {`,
        `    const r = await chrome.tabs.sendMessage(aba.id, { tipo: "destacar" });`,
        `    status(r?.ok ? "Página destacada." : "Sem resposta.");`,
        `  } catch {`,
        `    status("O content script não roda nesta página.");`,
        `  }`,
        `});`
      );
    if (o.companion === "complementar")
      js.push(
        ``,
        `// Manda uma mensagem para a extensão principal. Ela só responde se o ID desta`,
        `// extensão estiver em "externally_connectable.ids" no manifesto DELA.`,
        `$("falar").addEventListener("click", async () => {`,
        `  if (!EXTENSAO_PRINCIPAL) return status("Preencha o ID da extensão principal em config.js.");`,
        `  try {`,
        `    const r = await chrome.runtime.sendMessage(EXTENSAO_PRINCIPAL, { tipo: "ola", texto: "Olá da complementar!" });`,
        `    status(r?.ok ? "Resposta: " + r.resposta : "Recusado: " + (r?.erro ?? "sem resposta"));`,
        `  } catch (e) {`,
        `    status("Não foi possível falar com a principal: " + e.message);`,
        `  }`,
        `});`
      );
    if (o.companion === "principal")
      js.push(
        ``,
        `chrome.storage.local.get("ultimaMensagem").then(({ ultimaMensagem: u }) => {`,
        `  if (u) $("ultima").textContent = \`"\${u.texto}" de \${u.de}\`;`,
        `});`
      );
    add("popup.js", js.join("\n") + "\n");
  }

  if (o.options) {
    add(
      "options.html",
      page(
        `${name} — opções`,
        "pagina",
        `  <h1>Opções</h1>\n  <p>Configurações guardadas em chrome.storage.sync (acompanham a conta Google).</p>\n  <label for="cor">Cor do destaque</label>\n  <input id="cor" type="color" value="#c9a25e">\n  <button id="salvar">Salvar</button>\n  <p class="saida" id="status"></p>`,
        "options.js"
      )
    );
    add(
      "options.js",
      `${SIM_NOTE}

const cor = document.getElementById("cor");
const status = document.getElementById("status");

chrome.storage.sync.get({ cor: "#c9a25e" }).then((v) => (cor.value = v.cor));

document.getElementById("salvar").addEventListener("click", async () => {
  await chrome.storage.sync.set({ cor: cor.value });
  status.textContent = "Salvo.";
  setTimeout(() => (status.textContent = ""), 1500);
});
`
    );
  }

  if (o.sidepanel) {
    add(
      "sidepanel.html",
      page(
        `${name} — painel`,
        "painel",
        `  <h1>Anotações</h1>\n  <p>O painel lateral fica aberto enquanto você navega.</p>\n  <textarea id="notas" placeholder="Escreva aqui…"></textarea>\n  <p class="saida" id="status"></p>`,
        "sidepanel.js"
      )
    );
    add(
      "sidepanel.js",
      `${SIM_NOTE}

const notas = document.getElementById("notas");
const status = document.getElementById("status");

chrome.storage.local.get({ notas: "" }).then((v) => (notas.value = v.notas));

let espera;
notas.addEventListener("input", () => {
  clearTimeout(espera);
  espera = setTimeout(async () => {
    await chrome.storage.local.set({ notas: notas.value });
    status.textContent = "Salvo.";
  }, 400);
});
`
    );
  }

  if (m.background) {
    const bg: string[] = [REAL_ONLY("Este service worker"), ""];
    bg.push(`chrome.runtime.onInstalled.addListener(({ reason }) => {`, `  console.log(${jsonStr(name)}, "instalada:", reason);`, `});`);
    if (o.sidepanel && !o.popup)
      bg.push(``, `// Sem popup: clicar no ícone da extensão abre o painel lateral`, `chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });`);
    if (o.companion === "principal")
      bg.push(
        ``,
        `// Mensagens de outras extensões. Duas camadas de proteção:`,
        `// 1. o Chrome só entrega mensagens dos IDs em "externally_connectable.ids" (manifesto);`,
        `// 2. aqui conferimos de novo o remetente e o formato antes de fazer qualquer coisa.`,
        `const confiaveis = chrome.runtime.getManifest().externally_connectable?.ids ?? [];`,
        ``,
        `chrome.runtime.onMessageExternal.addListener((msg, sender, responder) => {`,
        `  if (!confiaveis.includes(sender.id)) {`,
        `    responder({ ok: false, erro: "remetente não autorizado" });`,
        `    return;`,
        `  }`,
        `  if (!msg || msg.tipo !== "ola" || typeof msg.texto !== "string") {`,
        `    responder({ ok: false, erro: "mensagem inválida" });`,
        `    return;`,
        `  }`,
        `  const texto = msg.texto.slice(0, 500);`,
        `  chrome.storage.local.set({ ultimaMensagem: { de: sender.id, texto, em: Date.now() } });`,
        `  responder({ ok: true, resposta: "recebido: " + texto.slice(0, 100) });`,
        `});`
      );
    add("background.js", bg.join("\n") + "\n");
  }

  if (o.content)
    add(
      "content.js",
      `${REAL_ONLY("Este content script")}
//
// Ele roda nas páginas de "matches" (manifesto), num "mundo isolado": vê o DOM da
// página, mas não as variáveis do JavaScript dela.

document.documentElement.setAttribute("data-poiesis-extensao", "ativa");

chrome.runtime.onMessage.addListener((msg, _sender, responder) => {
  if (msg?.tipo !== "destacar") return;
  chrome.storage.sync.get({ cor: "#c9a25e" }).then(({ cor }) => {
    document.body.style.outline = \`4px solid \${cor}\`;
    document.body.style.outlineOffset = "-4px";
    responder({ ok: true });
  });
  return true; // resposta assíncrona
});
`
    );

  if (o.companion === "complementar")
    add(
      "config.js",
      `// ID da extensão principal (32 letras de a a p), copiado de chrome://extensions.
// A principal também precisa listar o ID DESTA extensão em "externally_connectable.ids".
export const EXTENSAO_PRINCIPAL = "";
`
    );

  add("LEIA-ME.md", readme(o, name));
  return files;
}

function readme(o: ExtOptions, name: string) {
  const parts = [
    `# ${name}`,
    ``,
    `Extensão Manifest V3 criada no Poiesis.`,
    ``,
    `## Testar no navegador`,
    ``,
    `1. No Poiesis: painel **Extensão** → **Exportar extensão (.zip)**.`,
    `2. Descompacte o ZIP numa pasta.`,
    `3. Abra \`chrome://extensions\`, ligue o **Modo do desenvolvedor** e clique em **Carregar sem compactação**. Escolha a pasta.`,
    `4. Depois de mudar o código, exporte de novo e clique em **Atualizar** (↻) no cartão da extensão.`,
    ``,
    `O preview do Poiesis mostra o popup, as opções e o painel lateral com as APIs \`chrome.*\` **simuladas**. O service worker e os content scripts só rodam com a extensão instalada.`,
  ];
  if (o.companion === "principal")
    parts.push(
      ``,
      `## Extensão principal`,
      ``,
      `Esta extensão recebe mensagens de extensões complementares. Para autorizar uma, copie o ID dela (em \`chrome://extensions\`) para \`externally_connectable.ids\` no manifesto (o painel Extensão tem um campo para isso). O service worker confere o remetente de novo antes de responder.`
    );
  if (o.companion === "complementar")
    parts.push(
      ``,
      `## Extensão complementar`,
      ``,
      `1. Carregue as duas extensões em \`chrome://extensions\`.`,
      `2. Copie o ID da principal para \`config.js\` (\`EXTENSAO_PRINCIPAL\`).`,
      `3. Copie o ID desta extensão para \`externally_connectable.ids\` no manifesto da principal.`,
      `4. Exporte e recarregue as duas. O botão "Falar com a extensão principal" do popup manda uma mensagem e mostra a resposta.`
    );
  parts.push(``, `Este LEIA-ME vai junto no ZIP; apague se não quiser.`);
  return parts.join("\n") + "\n";
}

/** Cria o projeto completo, com os ícones PNG gerados. */
export async function extensionProject(o: ExtOptions): Promise<Project> {
  const files = extensionFiles(o);
  const icons = await renderIcons(svgDataUrl(defaultIconSvg(o.name)), { padding: 0, background: null, radius: 0 });
  for (const s of ICON_SIZES) files.push({ id: uid(), name: `icons/icon-${s}.png`, kind: "asset", content: icons[s], mime: "image/png" });
  const entry = files.find((f) => f.name === "popup.html") ?? files.find((f) => f.name === "sidepanel.html") ?? files.find((f) => f.name === "options.html") ?? files.find((f) => f.kind === "html");
  const now = Date.now();
  const open = ["manifest.json", "popup.html", "popup.js", "background.js", "content.js", "sidepanel.html", "options.html", "config.js"];
  return {
    id: uid(),
    name: o.name.trim() || "Minha extensão",
    files,
    folders: [],
    entry: entry?.id ?? "",
    openTabs: files.filter((f) => open.includes(f.name)).map((f) => f.id),
    activeFile: files.find((f) => f.name === "manifest.json")!.id,
    createdAt: now,
    updatedAt: now,
  };
}
