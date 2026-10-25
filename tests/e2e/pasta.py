# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Pasta no computador. O seletor nativo não é automatizável, então os testes usam uma
pasta do OPFS (mesma interface FileSystemDirectoryHandle, sem prompt de permissão)."""
import os
from common import launch, check, report, setdoc, doc

ctx, page, ext, errs = launch("ppasta")

# ---------- utilitários de disco (OPFS) ----------
DISK = """
window.__disk = {
  async dir(path, create) { let d = await navigator.storage.getDirectory(); for (const p of path.split('/').filter(Boolean)) d = await d.getDirectoryHandle(p, { create }); return d; },
  async write(path, text) { const i = path.lastIndexOf('/'); const d = await this.dir('proj/' + path.slice(0, Math.max(i, 0)), true);
    const w = await (await d.getFileHandle(path.slice(i + 1), { create: true })).createWritable(); await w.write(text); await w.close(); },
  async read(path) { try { const i = path.lastIndexOf('/'); const d = await this.dir('proj/' + path.slice(0, Math.max(i, 0)), false);
    return await (await (await d.getFileHandle(path.slice(i + 1))).getFile()).text(); } catch (e) { return null; } },
  async rm(path) { const i = path.lastIndexOf('/'); const d = await this.dir('proj/' + path.slice(0, Math.max(i, 0)), false); await d.removeEntry(path.slice(i + 1), { recursive: true }); },
  async pick(name) { window.__poiesisTestPickDirectory = async () => (await navigator.storage.getDirectory()).getDirectoryHandle(name, { create: true }); },
};
"""
def disk(fn, *a):
    page.evaluate(DISK)
    return page.evaluate(f"(a) => window.__disk.{fn}(...a)", list(a))

def setup_folder():
    page.evaluate(DISK)
    page.evaluate("""async () => { const r = await navigator.storage.getDirectory(); for (const n of ['proj','outro']) { try { await r.removeEntry(n, { recursive: true }); } catch {} } }""")
    files = {
        "index.html": '<!DOCTYPE html>\n<html><head><link rel="stylesheet" href="css/style.css"></head><body><h1>Da pasta</h1></body></html>',
        "css/style.css": "h1 { color: teal; }",
        "img/logo.svg": '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>',
        "node_modules/lib/index.js": "ignorado",
        ".gitignore": "segredo.txt\n*.log",
        "segredo.txt": "não deve entrar",
        "debug.log": "ignorado",
    }
    for k, v in files.items():
        disk("write", k, v)
    page.evaluate("async () => { const d = await window.__disk.dir('proj/vazia', true); }")
    disk("pick", "proj")

def explorer_names():
    return [t.strip() for t in page.locator("aside button.md-item .font-code").all_inner_texts()]

def panel(name):
    b = page.locator("button[aria-pressed]", has_text=name).first
    if b.get_attribute("aria-pressed") != "true":
        b.click(); page.wait_for_timeout(400)

def settings_switch(on):
    page.locator("button[aria-label='Preferências']").click(); page.wait_for_timeout(500)
    sw = page.locator("xpath=//div[contains(@class,'items-center')][.//div[normalize-space()='Editar pastas do computador']]//button[@role='switch']")
    if (sw.get_attribute("aria-checked") == "true") != on:
        sw.click(); page.wait_for_timeout(300)
    page.keyboard.press("Escape"); page.wait_for_timeout(300)

def open_tab(name):
    page.locator("aside button.md-item", has_text=name).first.click(); page.wait_for_timeout(500)

# 1 desligado por padrão
panel("Projetos")
check("opção desligada: sem 'Abrir pasta'", page.locator("text=Abrir pasta do computador").count() == 0)

# 2 liga e abre a pasta
settings_switch(True)
check("opção ligada: 'Abrir pasta' aparece", page.locator("text=Abrir pasta do computador").count() == 1)
setup_folder()
page.locator("button", has_text="Abrir pasta do computador").click(); page.wait_for_timeout(2500)
panel("Arquivos")
names = explorer_names()
check("lê arquivos da pasta", {"index.html", "style.css", "logo.svg"} <= set(names), names)
check("ignora node_modules, .gitignore e *.log", not any(n in names for n in ["index.js", "segredo.txt", "debug.log"]), names)
check("pasta vazia aparece", "vazia" in " ".join(page.locator("aside").all_inner_texts()))
check("indicador da pasta na barra de status", page.locator("footer button[aria-label^='Pasta vinculada']").count() == 1)
inner = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
check("preview mostra a página da pasta", inner.locator("h1").inner_text(timeout=5000) == "Da pasta")

# 3 editar grava no disco
open_tab("index.html")
setdoc(page, '<!DOCTYPE html>\n<html><body><h1>Editado no Poiesis</h1></body></html>')
page.wait_for_timeout(1500)
check("edição gravada no arquivo", "Editado no Poiesis" in (disk("read", "index.html") or ""))
svg_before = disk("read", "img/logo.svg")

# 4 criar, renomear e excluir pelo explorador
page.locator("button[aria-label='Novo arquivo']").first.click(); page.wait_for_timeout(300)
page.keyboard.type("novo.js"); page.keyboard.press("Enter"); page.wait_for_timeout(1500)
check("arquivo novo criado no disco", disk("read", "novo.js") == "")
row = page.locator("aside button.md-item", has_text="novo.js")
row.dblclick(); page.wait_for_timeout(300)
page.keyboard.press("Control+a"); page.keyboard.type("app.js"); page.keyboard.press("Enter"); page.wait_for_timeout(1500)
check("renomear move no disco", disk("read", "app.js") == "" and disk("read", "novo.js") is None)
page.locator("aside button.md-item", has_text="app.js").click(button="right"); page.wait_for_timeout(300)
page.locator("[role=menuitem]", has_text="Excluir").first.click(); page.wait_for_timeout(1500)
check("excluir apaga do disco", disk("read", "app.js") is None)
check("arquivo não editado não é regravado", disk("read", "img/logo.svg") == svg_before)

# 5 mudança externa sem edição local → recarrega
disk("write", "css/style.css", "h1 { color: crimson; }")
seen = False
for _ in range(14):
    page.wait_for_timeout(500)
    if page.locator("text=mudou na pasta").count() + page.locator("text=mudaram na pasta").count() > 0:
        seen = True; break
check("aviso de arquivo alterado na pasta", seen)
open_tab("style.css")
check("mudança externa entra no editor", "crimson" in doc(page), doc(page))
disk("write", "extra.txt", "criado fora")
page.wait_for_timeout(5500)
check("arquivo criado fora aparece", "extra.txt" in explorer_names())
disk("rm", "extra.txt")
page.wait_for_timeout(5500)
check("arquivo apagado fora some", "extra.txt" not in explorer_names())

# 6 conflito: edição local e mudança externa ao mesmo tempo
open_tab("style.css")
page.evaluate("() => { const v = document.querySelector('.cm-content').cmTile.root.view; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: 'h1 { color: VERSAO_LOCAL; }' } }); }")
disk("write", "css/style.css", "h1 { color: VERSAO_DISCO; }")
page.wait_for_timeout(3500)
check("conflito abre o comparador", page.locator("[role=dialog]").count() >= 1 and page.locator(".cm-mergeView, [role=option]").count() > 0)
check("aviso de conflito", page.locator("text=Conflito com a pasta").count() > 0)
page.keyboard.press("Escape"); page.wait_for_timeout(400)
open_tab("style.css")
check("disco não foi sobrescrito pela versão local", "VERSAO_DISCO" in (disk("read", "css/style.css") or ""))
check("editor fica com a versão do disco", "VERSAO_DISCO" in doc(page))
revs = page.evaluate("""async () => { const db = await new Promise(r => { const q = indexedDB.open('poiesis'); q.onsuccess = () => r(q.result); });
  const all = await new Promise(r => { const q = db.transaction('revisions').objectStore('revisions').getAll(); q.onsuccess = () => r(q.result); });
  const blobs = await new Promise(r => { const q = db.transaction('blobs').objectStore('blobs').getAll(); q.onsuccess = () => r(q.result); });
  db.close(); const c = all.filter(x => x.reason === 'conflict').pop(); if (!c) return null;
  const h = c.entries['css/style.css'].h; return blobs.find(b => b.h === h).c; }""")
check("versão local guardada no histórico (conflito)", revs is not None and "VERSAO_LOCAL" in revs, revs)

# 7 reabrir mantém o vínculo e pega mudanças feitas com o Poiesis fechado
disk("write", "css/style.css", "h1 { color: FECHADO; }")
page.reload(); page.wait_for_timeout(4000)
open_tab("style.css")
check("reabrir mantém o vínculo", page.locator("footer button[aria-label^='Pasta vinculada']").count() == 1)
check("mudança com o Poiesis fechado entra", "FECHADO" in doc(page), doc(page))

# 8 pasta some → somente leitura → desvincular
page.evaluate("async () => { const r = await navigator.storage.getDirectory(); await r.removeEntry('proj', { recursive: true }); }")
page.wait_for_timeout(5500)
check("pasta removida vira aviso", page.locator("[role=alert]", has_text="somente leitura").count() == 1)
before = doc(page)
page.locator(".cm-content").first.click(); page.keyboard.type("XYZ"); page.wait_for_timeout(300)
check("editor bloqueado (somente leitura)", doc(page) == before)
page.locator("[role=alert] button", has_text="Desvincular").click(); page.wait_for_timeout(600)
check("desvincular tira o aviso e o indicador", page.locator("[role=alert]").count() == 0 and page.locator("footer button[aria-label*='Pasta']").count() == 0)
page.locator(".cm-content").first.click(); page.keyboard.press("Control+End"); page.keyboard.type("/* ok */"); page.wait_for_timeout(300)
check("edição volta a funcionar", "/* ok */" in doc(page))

# 9 vincular projeto existente a uma pasta com arquivos (gravar o projeto)
page.evaluate("""async () => { const r = await navigator.storage.getDirectory(); const d = await r.getDirectoryHandle('outro', { create: true });
  const w = await (await d.getFileHandle('leia.txt', { create: true })).createWritable(); await w.write('só na pasta'); await w.close(); }""")
disk("pick", "outro")
panel("Projetos")
page.locator("button", has_text="Vincular este projeto a uma pasta").click(); page.wait_for_timeout(800)
check("pergunta qual lado vale", page.locator("text=já tem arquivos").count() == 1)
page.locator("[role=dialog] button", has_text="Gravar este projeto na pasta").click(); page.wait_for_timeout(2000)
gravado = page.evaluate("""async () => { const d = await (await navigator.storage.getDirectory()).getDirectoryHandle('outro');
  const css = await (await d.getDirectoryHandle('css')).getFileHandle('style.css'); return (await css.getFile()).text(); }""")
check("projeto gravado na pasta nova", "/* ok */" in gravado, gravado)
panel("Arquivos")
check("arquivo que só existia na pasta entra no projeto", "leia.txt" in explorer_names())

# 10 desligar a opção esconde as entradas
settings_switch(False)
panel("Projetos")
check("opção desligada esconde 'Abrir pasta'", page.locator("text=Abrir pasta do computador").count() == 0)

report(errs, ignore=["addEventListener", "dataset"])
