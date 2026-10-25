# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Utilitários dos testes E2E (Playwright + Chromium com a extensão carregada de dist/)."""
import os, sys, shutil, time
from playwright.sync_api import sync_playwright

EXT = os.environ.get("POIESIS_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "dist"))
V = "document.querySelector('.cm-content').cmTile.root.view"
results = {}

def check(name, cond, extra=""):
    results[name] = bool(cond)
    print(("OK  " if cond else "FALHOU ") + name, extra if not cond else "")

def launch(profile, viewport=(1440, 900)):
    prof = os.path.join(os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e"), profile)
    shutil.rmtree(prof, ignore_errors=True)
    p = sync_playwright().start()
    ext_path = os.path.abspath(EXT)
    ctx = p.chromium.launch_persistent_context(prof, channel="chromium", headless=True, args=[f"--disable-extensions-except={ext_path}", f"--load-extension={ext_path}"], viewport={"width": viewport[0], "height": viewport[1]}, accept_downloads=True)
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext = sw.url.split("/")[2]
    page = ctx.new_page(); page.goto(f"chrome-extension://{ext}/index.html"); page.wait_for_timeout(2500)
    for pg in ctx.pages:
        if pg is not page: pg.close()
    errs = []
    page.on("pageerror", lambda e: errs.append(str(e)))
    return ctx, page, ext, errs

def setdoc(page, text):
    page.evaluate(f"(t) => {{ const v={V}; v.dispatch({{selection:{{anchor:0}}}}); v.dispatch({{changes:{{from:0,to:v.state.doc.length,insert:t}}}}); v.focus(); }}", text)
    page.wait_for_timeout(250)

def doc(page):
    return page.evaluate(f"() => {V}.state.doc.toString()")

def open_file(page, name):
    page.locator(f"div[title='{name}']").click(); page.wait_for_timeout(450)

def report(errs, ignore=()):
    errs = [e for e in errs if not any(i in e for i in ignore)]
    check("sem erros na página do editor", not errs, errs)
    ok = sum(results.values()); print(f"\n{ok}/{len(results)}")
    sys.exit(0 if ok == len(results) else 1)
