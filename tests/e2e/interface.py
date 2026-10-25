# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
import os, shutil
PROFILES = os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e")
SHOTS = os.environ.get("POIESIS_SHOTS", "/tmp/poiesis-e2e/capturas")
os.makedirs(SHOTS, exist_ok=True)
import time, pathlib, sys
from playwright.sync_api import sync_playwright
EXT = os.path.abspath(os.environ.get("POIESIS_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "dist")))
errs=[]
def shot(page, n): page.screenshot(path=os.path.join(SHOTS, f"v2-{n}.png"))
with sync_playwright() as p:
    shutil.rmtree(os.path.join(PROFILES, "pv2"), ignore_errors=True)
    ctx = p.chromium.launch_persistent_context(os.path.join(PROFILES, "pv2"), channel="chromium", headless=True, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width":1440,"height":900})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext = sw.url.split("/")[2]; time.sleep(1.5)
    pages=[pg for pg in ctx.pages if ext in pg.url]
    page = pages[0] if pages else ctx.new_page()
    if not pages: page.goto(f"chrome-extension://{ext}/index.html")
    page.on("console", lambda m: errs.append(f"[{m.type}] {m.text}") if m.type=="error" else None)
    page.on("pageerror", lambda e: errs.append(f"[pageerror] {e}"))
    page.wait_for_timeout(2500)
    inner = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
    print("h1:", inner.locator("h1").inner_text(timeout=8000))
    shot(page,"1-home")
    # seleção
    page.locator(".cm-content").first.click()
    page.keyboard.press("Control+Home"); page.keyboard.press("ArrowDown"); page.keyboard.press("Shift+ArrowDown"); page.keyboard.press("Shift+ArrowDown")
    page.wait_for_timeout(200)
    print("selection layers:", page.locator(".cm-selectionBackground").count())
    page.screenshot(path=os.path.join(SHOTS, "v2-2-sel.png"), clip={"x":340,"y":90,"width":520,"height":160})
    # autocompletar class no HTML
    page.keyboard.press("Control+End")
    page.keyboard.type('\n<div class="')
    page.wait_for_timeout(700)
    opts = page.locator(".cm-tooltip-autocomplete li").all_inner_texts()
    print("class completions:", [o.replace("\n"," ") for o in opts[:8]])
    page.screenshot(path=os.path.join(SHOTS, "v2-3-ac.png"), clip={"x":340,"y":400,"width":700,"height":400})
    page.keyboard.press("Escape")
    # CSS: .
    page.locator("div[title='style.css']").click(); page.wait_for_timeout(300)
    page.locator(".cm-content").first.click(); page.keyboard.press("Control+End")
    page.keyboard.type("\n.co")
    page.wait_for_timeout(700)
    print("css selector completions:", [o.replace("\n"," ") for o in page.locator(".cm-tooltip-autocomplete li").all_inner_texts()[:6]])
    page.keyboard.press("Escape")
    page.keyboard.type("x { col")
    page.wait_for_timeout(900)
    print("css prop completions:", [o.replace("\n"," ") for o in page.locator(".cm-tooltip-autocomplete li").all_inner_texts()[:4]])
    info = page.locator(".cm-completionInfo")
    print("info shown:", info.count(), info.first.inner_text()[:120].replace("\n"," | ") if info.count() else "")
    page.screenshot(path=os.path.join(SHOTS, "v2-4-acinfo.png"), clip={"x":300,"y":300,"width":900,"height":500})
    page.keyboard.press("Escape")
    # context menu → definição no HTML
    page.locator("div[title='index.html']").click(); page.wait_for_timeout(400)
    tag = page.locator(".cm-line").filter(has_text="<body>").first.locator("span", has_text="body").first
    tag.click(button="right"); page.wait_for_timeout(400)
    shot(page,"5-ctx")
    page.get_by_text("Definição: o que é").click(); page.wait_for_timeout(600)
    print("pinned def:", page.locator(".pz-def-pinned").inner_text()[:160].replace("\n"," | "))
    shot(page,"6-def")
    page.keyboard.press("Escape")
    # definição de classe (estrela) via context menu no CSS? usa classe "cena" no HTML
    cena = page.locator(".cm-line").filter(has_text='class="cena"').first.locator("span", has_text="cena").first
    cena.click(button="right"); page.wait_for_timeout(300)
    page.get_by_text("Definição: o que é").click(); page.wait_for_timeout(500)
    print("class def:", page.locator(".pz-def-pinned").inner_text()[:220].replace("\n"," | "))
    shot(page,"7-classdef")
    page.keyboard.press("Escape")
    # renomear classe cena -> palco (F2)
    cena.click(); page.keyboard.press("F2"); page.wait_for_timeout(400)
    page.locator("input.md-field.font-code").fill("palco"); page.keyboard.press("Enter"); page.wait_for_timeout(1500)
    print("renamed in preview:", inner.locator("main.palco").count())
    # pasta nova + mover arquivo via drag
    page.locator("button[aria-label='Nova pasta']").click(); page.keyboard.type("css"); page.keyboard.press("Enter"); page.wait_for_timeout(300)
    src = page.locator("[data-explorer] button.md-item", has_text="style.css")
    dst = page.locator("[data-explorer] button.md-item", has_text="css").filter(has_not_text="style").first
    src.drag_to(dst); page.wait_for_timeout(800)
    print("tree:", page.locator("[data-explorer]").inner_text()[:200].replace("\n"," | "))
    print("css still applied after move:", inner.locator("h1").evaluate("e=>getComputedStyle(e).fontWeight"))
    shot(page,"8-folder")
    # temas
    page.get_by_role("button", name="Temas").click(); page.wait_for_timeout(300)
    page.locator("button", has_text="Drácula").first.click(); page.wait_for_timeout(600)
    shot(page,"9-dracula")
    page.locator("button", has_text="Papel & Ouro").first.click(); page.wait_for_timeout(600)
    shot(page,"10-papel")
    page.locator("button", has_text="Tinta & Ouro").first.click(); page.wait_for_timeout(300)
    # importar como "adicionar"
    files=[str((pathlib.Path(__file__).parent / "fixtures" / x).resolve()) for x in ["site/index.html","site/css/main.css","site/js/app.js"]]
    page.locator("input[type=file][multiple]").set_input_files(files); page.wait_for_timeout(800)
    shot(page,"11-import")
    page.get_by_role("button", name="Adicionar", exact=True).click(); page.wait_for_timeout(1000)
    page.get_by_role("button", name="Arquivos", exact=True).click(); page.wait_for_timeout(300)
    print("after add:", page.locator("[data-explorer]").inner_text()[:260].replace("\n"," | "))
    print("ERRS:", errs[:10])
    ctx.close()
