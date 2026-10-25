# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
import os, shutil
PROFILES = os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e")
SHOTS = os.environ.get("POIESIS_SHOTS", "/tmp/poiesis-e2e/capturas")
os.makedirs(SHOTS, exist_ok=True)
import time
from playwright.sync_api import sync_playwright
EXT = os.path.abspath(os.environ.get("POIESIS_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "dist")))
results={}
def check(name, cond, extra=""):
    results[name]=bool(cond); print(("OK  " if cond else "FALHOU ")+name, extra)
def lints(page): return page.locator(".cm-lintRange-error, .cm-lintRange-warning").count()
def lint_texts(page): return [e.inner_text() for e in page.locator(".cm-lintRange-error, .cm-lintRange-warning").all()]
with sync_playwright() as p:
    shutil.rmtree(os.path.join(PROFILES, "pv5"), ignore_errors=True)
    ctx = p.chromium.launch_persistent_context(os.path.join(PROFILES, "pv5"), channel="chromium", headless=True, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width":1440,"height":900})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext = sw.url.split("/")[2]; time.sleep(1.5)
    pages=[pg for pg in ctx.pages if ext in pg.url]
    page = pages[0] if pages else ctx.new_page()
    if not pages: page.goto(f"chrome-extension://{ext}/index.html")
    errs=[]; page.on("pageerror", lambda e: errs.append(str(e)))
    page.on("console", lambda m: errs.append(m.text) if m.type=="error" and "TUNNEL" not in m.text else None)
    page.wait_for_timeout(2500)
    ed = page.locator(".cm-content").first
    # sem falso positivo nos modelos
    for name in ["index.html","style.css","script.js"]:
        page.locator(f"div[title='{name}']").click(); page.wait_for_timeout(1800)
        check(f"Gênese limpo: {name}", lints(page)==0, lint_texts(page))
    # HTML
    page.locator("div[title='index.html']").click(); page.wait_for_timeout(400)
    ed.click(); page.keyboard.press("Control+End")
    for _ in range(3): page.keyboard.press("ArrowUp")
    page.keyboard.press("End")
    for chunk in ['\n<dvi class="x">', 'oi', 'END', '\n<a hreff="#">', 'x', 'END', '\n<link rel="stylesheet" href="estilo.css">', '\n<div>', 'a</span>', 'END']:
        if chunk == 'END': page.keyboard.press("End")
        else: page.keyboard.type(chunk)
    print("   doc:", ed.inner_text()[-260:].replace("\n"," ⏎ "))
    page.wait_for_timeout(1800)
    lt = lint_texts(page); print("   html lints:", lt)
    check("tag errada sublinhada", "dvi" in lt)
    check("atributo errado sublinhado", "hreff" in lt)
    check("arquivo inexistente sublinhado", "estilo.css" in lt)
    check("fechamento trocado sublinhado", any("</span>" in x for x in lt))
    page.locator(".cm-lintRange-error", has_text="dvi").first.click(); page.wait_for_timeout(500)
    card = page.locator(".pz-fix")
    check("clique abre sugestões", card.count()==1, card.inner_text()[:120].replace("\n"," | ") if card.count() else "")
    page.screenshot(path=os.path.join(SHOTS, "v5-1-fix.png"))
    page.locator(".pz-fix-btn.primary").first.dispatch_event("mousedown"); page.wait_for_timeout(1200)
    t = ed.inner_text()
    check("correção troca abertura e fechamento", '<div class="x">oi</div>' in t)
    # menu de contexto com correção
    page.locator(".cm-lintRange-warning, .cm-lintRange-error", has_text="estilo.css").first.click(button="right"); page.wait_for_timeout(400)
    it = page.locator("[role=menuitem]", has_text="style.css")
    check("menu de contexto mostra correção", it.count()>0)
    if it.count(): it.first.click(); page.wait_for_timeout(800)
    check("caminho corrigido", 'href="style.css"' in ed.inner_text())
    # CSS
    page.locator("div[title='style.css']").click(); page.wait_for_timeout(300)
    ed.click(); page.keyboard.press("Control+End")
    page.keyboard.type("\n.t {\ncolr: red;\ndisplay: flx;\ncolor: var(--ouroo);")
    page.wait_for_timeout(1800)
    lt = lint_texts(page); print("   css lints:", lt)
    check("propriedade errada", "colr" in lt); check("valor errado", "flx" in lt); check("variável inexistente", "--ouroo" in lt)
    # Ctrl+. no "flx"
    page.locator(".cm-lintRange-error", has_text="flx").first.click(); page.wait_for_timeout(300)
    page.keyboard.press("Escape"); page.keyboard.press("Control+."); page.wait_for_timeout(400)
    check("Ctrl+. abre o cartão", page.locator(".pz-fix").count()==1, page.locator(".pz-fix").inner_text()[:80].replace("\n"," | ") if page.locator(".pz-fix").count() else "")
    page.screenshot(path=os.path.join(SHOTS, "v5-2-css.png"))
    page.keyboard.press("Escape")
    # JS
    page.locator("div[title='script.js']").click(); page.wait_for_timeout(300)
    ed.click(); page.keyboard.press("Control+End")
    page.keyboard.type("\ndocument.querySelecter('.cena');\nconsle.log(1);\nbotao.addEventListner('click', semear);\ndocument.getElementById('semer');\n")
    page.wait_for_timeout(1800)
    lt = lint_texts(page); print("   js lints:", lt)
    check("método do document errado", "querySelecter" in lt)
    check("global digitado errado", "consle" in lt)
    check("addEventListner suspeito", "addEventListner" in lt)
    check("id inexistente no getElementById", "semer" in lt)
    page.screenshot(path=os.path.join(SHOTS, "v5-3-js.png"))
    # JSON
    page.locator("button[aria-label='Novo arquivo']").click(); page.keyboard.type("dados.json"); page.keyboard.press("Enter"); page.wait_for_timeout(600)
    page.keyboard.press("Control+a"); page.keyboard.type('{"a": 1,\n"b": [1, 2],\n}')
    page.wait_for_timeout(1500)
    check("JSON inválido sublinhado", page.locator(".cm-lintRange-error").count()>0)
    page.locator(".cm-lintRange-error").first.click(); page.wait_for_timeout(400)
    fixbtn = page.locator(".pz-fix-btn", has_text="vírgula")
    check("sugere remover vírgula", fixbtn.count()>0, page.locator(".pz-fix").inner_text()[:140].replace("\n"," | ") if page.locator(".pz-fix").count() else "")
    if fixbtn.count(): fixbtn.first.dispatch_event("mousedown"); page.wait_for_timeout(1400)
    check("JSON corrigido fica válido", page.locator(".cm-lintRange-error").count()==0)
    # Markdown
    page.locator("button[aria-label='Novo arquivo']").click(); page.keyboard.type("notas.md"); page.keyboard.press("Enter"); page.wait_for_timeout(800)
    check("markdown renderizado", page.locator("article.pz-md h1").count()==1, page.locator("article.pz-md").inner_text()[:60] if page.locator("article.pz-md").count() else "")
    page.keyboard.press("Control+End"); page.keyboard.type("\n## Lista\n\n- [x] feito\n- `código`\n\n![foto](img/x.png)\n"); page.wait_for_timeout(500)
    check("markdown atualiza ao digitar", page.locator("article.pz-md h2").count()==1)
    page.screenshot(path=os.path.join(SHOTS, "v5-4-md.png"))
    # TXT
    page.locator("button[aria-label='Novo arquivo']").click(); page.keyboard.type("leia.txt"); page.keyboard.press("Enter"); page.wait_for_timeout(500)
    page.keyboard.type("texto simples"); page.wait_for_timeout(300)
    check("txt editável com spellcheck", ed.get_attribute("spellcheck")=="true" and "texto simples" in ed.inner_text())
    # Módulos sem falso positivo
    page.locator("header button", has_text="Gênese").first.click(); page.get_by_text("Novo projeto").hover(); page.wait_for_timeout(300)
    page.get_by_text("Módulos ES").click(); page.wait_for_timeout(1500)
    for name in ["index.html","main.js js","versos.js js","render.js js/ui"]:
        page.locator(f"div[title$='{name.split()[0]}']").first.click(); page.wait_for_timeout(1600)
        check(f"Módulos limpo: {name.split()[0]}", lints(page)==0, lint_texts(page))
    print("ERROS:", errs[:6])
    print("RESUMO:", sum(results.values()), "/", len(results))
    ctx.close()
