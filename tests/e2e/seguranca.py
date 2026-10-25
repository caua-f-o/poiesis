# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
import os, shutil
PROFILES = os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e")
SHOTS = os.environ.get("POIESIS_SHOTS", "/tmp/poiesis-e2e/capturas")
os.makedirs(SHOTS, exist_ok=True)
import time
from playwright.sync_api import sync_playwright
EXT = os.path.abspath(os.environ.get("POIESIS_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "dist")))
with sync_playwright() as p:
    shutil.rmtree(os.path.join(PROFILES, "psec"), ignore_errors=True)
    ctx=p.chromium.launch_persistent_context(os.path.join(PROFILES, "psec"),channel="chromium",headless=True,args=[f"--disable-extensions-except={EXT}",f"--load-extension={EXT}"],viewport={"width":1440,"height":900})
    sw=ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker",timeout=15000)
    ext=sw.url.split("/")[2]; time.sleep(1.5)
    pages=[pg for pg in ctx.pages if ext in pg.url]; page=pages[0] if pages else ctx.new_page()
    if not pages: page.goto(f"chrome-extension://{ext}/index.html")
    page.wait_for_timeout(2500)
    user=[f for f in page.frames if f.parent_frame and f.parent_frame.parent_frame][0]
    # 1) iframe de terceiro dentro da página tenta rodar código nela
    user.evaluate("""() => { window.__alvo = 'intacto';
      const f=document.createElement('iframe');
      f.srcdoc="<script>parent.postMessage({__poiesisEval:\\"window.__alvo='INVADIDO'\\"},'*')<\\/script>";
      document.body.appendChild(f); }""")
    page.wait_for_timeout(800)
    print(("OK  " if (user.evaluate("window.__alvo")=="intacto") else "FALHOU ") + "REPL via iframe terceiro bloqueado")
    # 2) a própria página tenta mandar eval para si mesma
    user.evaluate("""() => window.postMessage({__poiesisEval:"window.__alvo='SELF'"},'*')""")
    page.wait_for_timeout(400)
    print(("OK  " if (user.evaluate("window.__alvo")=="intacto") else "FALHOU ") + "eval de si mesma bloqueado")
    # 3) REPL legítimo continua funcionando (pelo editor)
    page.keyboard.press("Control+j"); page.wait_for_timeout(300)
    inp=page.locator("textarea, input").filter(has=page.locator("xpath=.")).last
    # 4) editor ignora mensagens que não vêm do iframe do preview
    before=page.locator("text=FORJADO").count()
    page.evaluate("""() => window.postMessage({__poiesis:1,type:'log',level:'log',args:[{t:'str',v:'FORJADO'}]},'*')""")
    page.wait_for_timeout(400)
    print(("OK  " if (page.locator("text=FORJADO").count()==before) else "FALHOU ") + "log forjado ignorado pelo editor")
    user.evaluate("""() => console.log('LEGITIMO')""")
    page.wait_for_timeout(500)
    print(("OK  " if (page.locator("text=LEGITIMO").count()>0) else "FALHOU ") + "log legítimo do preview chega")
    ctx.close()
