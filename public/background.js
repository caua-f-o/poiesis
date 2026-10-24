/* Poiesis · service worker
 * Clique no ícone (ou atalho) abre o editor; se já houver uma aba aberta, foca nela. */
const EDITOR = chrome.runtime.getURL("index.html");

async function openEditor() {
  try {
    const ctx = await chrome.runtime.getContexts({ contextTypes: ["TAB"], documentUrls: [EDITOR] });
    const t = ctx.find((c) => c.tabId >= 0);
    if (t) {
      await chrome.tabs.update(t.tabId, { active: true });
      if (t.windowId >= 0) await chrome.windows.update(t.windowId, { focused: true });
      return;
    }
  } catch (e) {
    /* getContexts indisponível: abre uma aba nova */
  }
  await chrome.tabs.create({ url: EDITOR });
}

chrome.action.onClicked.addListener(openEditor);

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "open-editor") openEditor();
});

chrome.runtime.onInstalled.addListener((d) => {
  if (d.reason === "install") openEditor();
});
