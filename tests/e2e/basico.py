# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
import os, shutil
PROFILES = os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e")
SHOTS = os.environ.get("POIESIS_SHOTS", "/tmp/poiesis-e2e/capturas")
os.makedirs(SHOTS, exist_ok=True)
import time, pathlib
from playwright.sync_api import sync_playwright
EXT = os.path.abspath(os.environ.get("POIESIS_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "dist")))
with sync_playwright() as p:
    shutil.rmtree(os.path.join(PROFILES, "profile2"), ignore_errors=True)
    ctx = p.chromium.launch_persistent_context(os.path.join(PROFILES, "profile2"), channel="chromium", headless=True, accept_downloads=True,
        args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width":1440,"height":900})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext_id = sw.url.split("/")[2]
    time.sleep(1.5)
    pages=[pg for pg in ctx.pages if ext_id in pg.url]
    page = pages[0] if pages else ctx.new_page()
    if not pages: page.goto(f"chrome-extension://{ext_id}/index.html")
    errs=[]; page.on("console", lambda m: errs.append(m.text) if m.type=="error" else None)
    page.wait_for_timeout(2000)
    inner = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
    # emmet: new file in html at end of body
    page.locator(".cm-content").first.click()
    page.keyboard.press("Control+Home")
    for _ in range(19): page.keyboard.press("ArrowDown")
    page.keyboard.press("End")
    page.keyboard.type("\nul.lista>li.item*3")
    page.keyboard.press("Tab")
    page.wait_for_timeout(1200)
    n = inner.locator("ul.lista > li.item").count(); print(("OK  " if n == 3 else "FALHOU ") + "Emmet ul>li*3 no preview", n)
    # runtime error -> underline in editor
    page.locator("div[title='script.js']").click(); page.wait_for_timeout(300)
    page.locator(".cm-content").first.click(); page.keyboard.press("Control+End")
    page.keyboard.type("\nnaoExiste();")
    page.wait_for_timeout(1500)
    print(("OK  " if page.locator(".cm-lintRange-error").count() >= 1 else "FALHOU ") + "erro de sintaxe sublinhado")
    page.screenshot(path=os.path.join(SHOTS, "t1.png"))
    # format
    page.keyboard.press("Shift+Alt+F"); page.wait_for_timeout(1500)
    # export zip
    with page.expect_download() as d:
        page.locator("header button:has(span:text-is('ios_share'))").click(); page.get_by_text("Projeto (.zip)").click()
    print(("OK  " if d.value.suggested_filename.endswith(".zip") else "FALHOU ") + "exporta .zip")
    with page.expect_download() as d2:
        page.locator("button[aria-label='Baixar HTML único']").click()
    path = d2.value.path(); html = open(path).read()
    print(("OK  " if d2.value.suggested_filename.endswith(".html") and "data-poiesis-runtime" not in html else "FALHOU ") + "exporta HTML único sem o runtime")
    # popout
    with ctx.expect_page() as np:
        page.locator("button[aria-label^='Abrir em nova aba']").click()
    pop = np.value; pop.wait_for_timeout(2000)
    print(("OK  " if pop.frame_locator("iframe#palco").frame_locator("iframe").locator("h1").inner_text(timeout=5000) else "FALHOU ") + "janela destacada mostra o preview")
    # persistence: reload
    page.bring_to_front(); page.reload(); page.wait_for_timeout(2500)
    print(("OK  " if "naoExiste" in page.locator(".cm-content").first.inner_text() else "FALHOU ") + "edição persiste ao recarregar")
    page.locator("div[title='index.html']").click(); page.wait_for_timeout(500)
    page.screenshot(path=os.path.join(SHOTS, "t2.png"))
    print(("OK  " if not errs else "FALHOU ") + "sem erros na página", errs[:5])
    ctx.close()
