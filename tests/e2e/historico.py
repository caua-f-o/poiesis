# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Histórico local, migração para IndexedDB e canal validado do preview."""
import json, os, sys, time, tempfile, shutil
from common import launch, check, report, V, setdoc, doc, open_file

ctx, page, ext, errs = launch("phist")
H = "document.querySelector('.cm-content')"

def dump(store):
    return page.evaluate("""async (store) => {
      const db = await new Promise((r, j) => { const q = indexedDB.open('poiesis'); q.onsuccess = () => r(q.result); q.onerror = () => j(q.error); });
      const out = await new Promise((r) => { const q = db.transaction(store).objectStore(store).getAll(); q.onsuccess = () => r(q.result); });
      db.close(); return out; }""", store)

def panel(name):
    b = page.locator("button[aria-pressed]", has_text=name).first
    if b.get_attribute("aria-pressed") != "true":
        b.click(); page.wait_for_timeout(400)

def menu_item(label):
    for _ in range(3):
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        page.locator("aside button[aria-label='Mais opções']").first.click(); page.wait_for_timeout(400)
        it = page.locator("[role=menuitem]", has_text=label)
        if it.count(): return it.first
    raise RuntimeError("menu não abriu: " + label)

def items():
    return page.locator("[role=listitem]").all_inner_texts()

# 1 projetos no IndexedDB
n = len(dump("projects"))
check("projetos gravados no IndexedDB", n >= 1, n)

# 2 migração do armazenamento antigo
page.evaluate("""async () => {
  const p = { id: 'legado1', name: 'Legado', files: [{ id: 'f1', name: 'index.html', kind: 'html', content: '<h1>velho</h1>' }],
    entry: 'f1', folders: [], openTabs: ['f1'], activeFile: 'f1', createdAt: 1, updatedAt: 1 };
  await chrome.storage.local.set({ 'poiesis:workspace:v1': { version: 1, projects: { legado1: p }, order: ['legado1'], currentId: 'legado1', settings: {} } });
  await new Promise((r) => { const q = indexedDB.deleteDatabase('poiesis'); q.onsuccess = q.onerror = q.onblocked = r; });
}""")
page.reload(); page.wait_for_timeout(3000)
check("migração traz o projeto antigo", page.locator("text=Legado").count() > 0)
check("aviso de migração aparece", page.locator("text=Projetos migrados").count() > 0)
legacy_kept = page.evaluate("chrome.storage.local.get('poiesis:workspace:v1').then(r => !!r['poiesis:workspace:v1'])")
check("cópia antiga fica como reserva", legacy_kept)
page.reload(); page.wait_for_timeout(2500)
check("segunda abertura não migra de novo", page.locator("text=Projetos migrados").count() == 0 and page.locator("text=Legado").count() > 0)

# 3 ponto manual
panel("Histórico")
check("painel de histórico abre", page.locator("text=Nenhuma versão ainda").count() + page.locator("[role=listitem]").count() > 0)
page.locator("button[aria-label='Criar ponto de restauração']").click(); page.wait_for_timeout(300)
page.keyboard.type("Versão inicial"); page.keyboard.press("Enter"); page.wait_for_timeout(900)
check("ponto manual aparece na lista", any("Versão inicial" in t for t in items()), items()[:3])

# 4 editar + excluir arquivo → versão "antes de excluir"
open_file(page, "index.html"); setdoc(page, "<h1>novo título</h1>\n<p>texto</p>")
page.wait_for_timeout(700)
# cria e exclui um arquivo: usa a paleta? mais simples: exclui style inexistente → cria arquivo via evaluate no estado do App não é possível; usa o menu do explorador
panel("Arquivos")
page.locator("button[aria-label='Novo arquivo']").first.click(); page.wait_for_timeout(300)
page.keyboard.type("extra.css"); page.keyboard.press("Enter"); page.wait_for_timeout(600)
f = page.locator("aside button.md-item", has_text="extra.css")
check("arquivo extra criado", f.count() == 1)
f.click(button="right"); page.wait_for_timeout(400)
page.locator("[role=menuitem]", has_text="Excluir").first.click(); page.wait_for_timeout(1200)
panel("Histórico"); page.wait_for_timeout(500)
t = items()
check("versão 'Antes de excluir' gravada", any("Antes de excluir" in x for x in t), t[:4])

# 5 comparar com o atual
page.locator("[role=listitem]", has_text="Versão inicial").first.locator("button").first.click(); page.wait_for_timeout(1200)
dlg = page.locator("[role=dialog]")
check("comparador abre", dlg.count() >= 1)
opts = page.locator("[role=option]").all_inner_texts()
check("lista mostra index.html alterado", any("index.html" in o and "M" in o for o in opts), opts)
check("visão lado a lado", page.locator(".cm-mergeView").count() == 1)
check("trechos removidos/adicionados destacados", page.locator(".cm-changedLine, .cm-changedText").count() > 0)
page.screenshot(path=os.path.join(os.environ.get("POIESIS_SHOTS", "/tmp/poiesis-e2e/capturas"), "historico-comparar.png"))
page.locator("[role=dialog] button[aria-label='Em linha']").click(); page.wait_for_timeout(600)
check("visão em linha", page.locator(".cm-deletedChunk").count() > 0 and page.locator(".cm-chunkButtons").count() > 0)
page.locator("[role=dialog] button[aria-label='Lado a lado']").click(); page.wait_for_timeout(600)

# 6 trazer um trecho e aplicar
page.locator(".pz-revert").first.click(); page.wait_for_timeout(400)
apply = page.locator("button", has_text="Aplicar trechos no arquivo")
check("trazer trecho habilita 'Aplicar'", apply.count() == 1)
apply.click(); page.wait_for_timeout(1000)
page.keyboard.press("Escape"); page.wait_for_timeout(400)
open_file(page, "index.html")
d = doc(page)
check("trecho restaurado no arquivo", "velho" in d and "novo título" not in d, d[:80])

# 7 restaurar arquivo inteiro (depois de mudar de novo)
setdoc(page, "<h1>terceira forma</h1>"); page.wait_for_timeout(700)
panel("Histórico")
page.locator("[role=listitem]", has_text="Versão inicial").first.locator("button").first.click(); page.wait_for_timeout(1000)
page.locator("button", has_text="Restaurar este arquivo").click(); page.wait_for_timeout(300)
page.locator("[role=dialog] button", has_text="Restaurar").last.click(); page.wait_for_timeout(1200)
open_file(page, "index.html")
_r = [r for r in dump("revisions") if r.get("label") == "Versão inicial"][0]
first = [b for b in dump("blobs") if b["h"] == _r["entries"]["index.html"]["h"]][0]["c"]
check("arquivo volta ao conteúdo da versão", doc(page) == first, (doc(page)[:60], first[:60]))
panel("Histórico")
check("antes de restaurar, o estado atual vira versão", any("Antes de restaurar" in x for x in items()))

# 8 restaurar projeto inteiro traz arquivo excluído de volta? (extra.css foi criado depois do ponto inicial → deve sumir; aqui conferimos o oposto com a versão 'Antes de excluir')
page.locator("[role=listitem]", has_text="Antes de excluir").first.locator("button").first.click(); page.wait_for_timeout(1000)
page.locator("button", has_text="Restaurar projeto inteiro").click(); page.wait_for_timeout(300)
page.locator("[role=dialog] button", has_text="Restaurar").last.click(); page.wait_for_timeout(1200)
panel("Arquivos")
check("restaurar projeto traz de volta o arquivo excluído", page.locator("aside button.md-item", has_text="extra.css").count() == 1)

# 9 sem duplicatas automáticas
rs = sorted(dump("revisions"), key=lambda r: r["time"])
sig = lambda r: sorted(k + v["h"] for k, v in r["entries"].items())
dups = sum(1 for i in range(1, len(rs)) if rs[i]["reason"] == "auto" and rs[i]["projectId"] == rs[i-1]["projectId"] and sig(rs[i]) == sig(rs[i-1]))
check("nenhuma versão automática duplicada", dups == 0, dups)
bs = dump("blobs"); blobs_ok = len(bs) == len({b["h"] for b in bs})
check("blobs deduplicados por hash", blobs_ok)

# 10 persistência ao reabrir
nrev = len(dump("revisions"))
page.reload(); page.wait_for_timeout(2500)
check("histórico persiste ao reabrir", len(dump("revisions")) >= nrev, nrev)

# 11 exportar e importar (com verificação de integridade)
panel("Histórico")
it = menu_item("Exportar histórico")
with page.expect_download() as dl:
    it.click()
path = dl.value.path(); data = json.load(open(path))
check("exporta histórico versionado", data["format"] == "poiesis-history" and data["version"] == 1 and len(data["revisions"]) > 0)
tmp = tempfile.mkdtemp()
good = f"{tmp}/hist.json"; shutil.copy(path, good)
bad = f"{tmp}/hist-ruim.json"; d2 = dict(data); h = next(iter(d2["blobs"])); d2["blobs"] = {**data["blobs"], h: data["blobs"][h] + "x"}; json.dump(d2, open(bad, "w"))
it = menu_item("Importar histórico")
with page.expect_file_chooser() as fc:
    it.click()
fc.value.set_files(bad); page.wait_for_timeout(800)
check("importação adulterada é recusada", page.locator("text=Integridade").count() > 0)
it = menu_item("Importar histórico")
with page.expect_file_chooser() as fc:
    it.click()
fc.value.set_files(good); page.wait_for_timeout(800)
check("importação íntegra não duplica versões", page.locator("text=0 versões importadas").count() > 0)

# 12 canal do preview: sessão errada é ignorada
user = [f for f in page.frames if f.parent_frame and f.parent_frame.parent_frame][0]
page.keyboard.press("Control+j") if page.locator("text=Avaliar JavaScript").count() == 0 else None
user.evaluate("""() => parent.postMessage({__poiesis:1, v:1, s:'sessao-falsa', type:'log', level:'log', args:[{t:'str', v:'SESSAO_FALSA'}], src:null}, '*')""")
user.evaluate("""() => console.log('SESSAO_OK')""")
page.wait_for_timeout(600)
check("mensagem com sessão errada é ignorada", page.locator("text=SESSAO_FALSA").count() == 0)
check("mensagem legítima chega", page.locator("text=SESSAO_OK").count() > 0)

# 13 versão automática depois do intervalo (30 s) e sem duplicar quando nada muda
page.keyboard.press("Escape")
page.locator("button[aria-label='Preferências']").click(); page.wait_for_timeout(500)
page.locator("[role=dialog] button", has_text="30s").click(); page.wait_for_timeout(300)
page.keyboard.press("Escape"); page.wait_for_timeout(300)
open_file(page, "index.html")
before_auto = len([r for r in dump("revisions") if r["reason"] == "auto"])
setdoc(page, "<h1>escrita automática</h1>"); page.wait_for_timeout(33000)
autos = [r for r in dump("revisions") if r["reason"] == "auto"]
check("versão automática após 30 s sem editar", len(autos) == before_auto + 1, (before_auto, len(autos)))
page.wait_for_timeout(33000)
check("sem mudança, não grava outra automática", len([r for r in dump("revisions") if r["reason"] == "auto"]) == len(autos))

report(errs, ignore=["addEventListener", "dataset"])
ctx.close()
