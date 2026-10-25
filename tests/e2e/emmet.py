# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
import os, shutil
PROFILES = os.environ.get("POIESIS_PROFILES", "/tmp/poiesis-e2e")
SHOTS = os.environ.get("POIESIS_SHOTS", "/tmp/poiesis-e2e/capturas")
os.makedirs(SHOTS, exist_ok=True)
import time, sys
from playwright.sync_api import sync_playwright
EXT = os.path.abspath(os.environ.get("POIESIS_DIST", os.path.join(os.path.dirname(__file__), "..", "..", "dist")))
res={}
WAIT=int(sys.argv[2]) if len(sys.argv)>2 else 250
def check(n,c,x=""):
    res[n]=bool(c); print(("OK  " if c else "FALHOU ")+n, x)
V="document.querySelector('.cm-content').cmTile.root.view"
def setdoc(page, text):
    # "|" marca o cursor; "[...]" marca seleção
    page.evaluate(f"""(t) => {{ const v={V}; let a=t.indexOf('['), b, s=t;
      if (a>=0) {{ s=t.replace('[',''); b=s.indexOf(']'); s=s.replace(']',''); }}
      else {{ a=t.indexOf('|'); s=t.replace('|',''); b=a; }}
      v.dispatch({{selection:{{anchor:0}}}}); v.dispatch({{changes:{{from:0,to:v.state.doc.length,insert:s}}, selection:{{anchor:a, head:b}}}}); v.focus(); }}""", text)
    page.wait_for_timeout(WAIT)
def doc(page): return page.evaluate(f"() => {V}.state.doc.toString()")
def sel(page): return page.evaluate(f"() => {{ const v={V}, r=v.state.selection.main; return v.state.sliceDoc(r.from,r.to) }}")
def menu(page, label):
    page.evaluate(f"""() => {{ const v={V}; const c=v.coordsAtPos(v.state.selection.main.head);
      v.contentDOM.dispatchEvent(new MouseEvent('contextmenu',{{bubbles:true,clientX:c.left+2,clientY:c.top+4}})) }}""")
    page.wait_for_timeout(300)
    page.locator("[role=menuitem]", has_text="Emmet").first.hover(); page.wait_for_timeout(350)
    page.locator("[role=menuitem]", has_text=label).first.click(); page.wait_for_timeout(300)
with sync_playwright() as p:
    shutil.rmtree(os.path.join(PROFILES, "pem"), ignore_errors=True)
    ctx = p.chromium.launch_persistent_context(os.path.join(PROFILES, "pem"), channel="chromium", headless=True, args=[f"--disable-extensions-except={EXT}", f"--load-extension={EXT}"], viewport={"width":1440,"height":900})
    sw = ctx.service_workers[0] if ctx.service_workers else ctx.wait_for_event("serviceworker", timeout=15000)
    ext = sw.url.split("/")[2]
    page = ctx.new_page(); page.goto(f"chrome-extension://{ext}/index.html")
    errs=[]; page.on("pageerror", lambda e: errs.append(str(e)))
    page.wait_for_timeout(2500)
    page.locator("div[title='index.html']").click(); page.wait_for_timeout(400)
    H = "<body>\n  {}\n</body>"
    # 1 expansão com operadores + prévia
    setdoc(page, H.format("|")); page.keyboard.type("ul>li.item$*3"); page.wait_for_timeout(400)
    pv = page.locator(".pz-emmet .emmet-preview")
    check("prévia aparece ao digitar", pv.count()==1 and 'item3' in pv.inner_text(), pv.inner_text()[:80].replace("\n","⏎") if pv.count() else "")
    check("abreviação sublinhada", page.locator(".emmet-abbreviation").count()==1)
    page.screenshot(path=os.path.join(SHOTS, "em-1-preview.png"), clip={"x":300,"y":60,"width":900,"height":360})
    page.keyboard.press("Tab"); page.wait_for_timeout(200)
    d=doc(page); check("Tab expande ul>li*3", '<li class="item3"></li>' in d and d.count("<li")==3, d.replace("\n","⏎")[:160])
    check("indentação respeitada", "\n    <li class=\"item1\">" in d)
    # 2 Esc ignora a prévia e Tab volta a indentar
    setdoc(page, H.format("|")); page.keyboard.type("div.a>p"); page.wait_for_timeout(300); page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Esc esconde a prévia", page.locator(".pz-emmet").count()==0)
    page.keyboard.press("Tab"); page.wait_for_timeout(150)
    check("Tab depois do Esc continua no editor", page.evaluate("document.activeElement.className")=="cm-content" and "div.a>p" in doc(page) and "<div" not in doc(page), doc(page).replace("\n","⏎"))
    # 3 palavra solta em texto não vira tag
    setdoc(page, H.format("texto p|")); page.keyboard.press("Tab"); page.wait_for_timeout(200)
    check("texto comum não expande", "<p>" not in doc(page))
    # 4 tag simples no começo da linha + campos
    setdoc(page, H.format("a|")); page.keyboard.press("Tab"); page.keyboard.type("x.html"); page.keyboard.press("Tab"); page.keyboard.type("Link")
    check("a + Tab com campos (href → texto)", '<a href="x.html">Link</a>' in doc(page), doc(page).replace("\n","⏎"))
    # 5 tag sendo digitada não expande
    setdoc(page, H.format("<di|")); page.keyboard.press("Tab")
    check("'<di' + Tab não expande", "<di>" not in doc(page) and "<div" not in doc(page))
    # 6 dentro de atributo não expande
    setdoc(page, H.format('<div class="a.b|"></div>')); page.keyboard.press("Tab")
    check("dentro de atributo não expande", '<a class' not in doc(page) and 'class="a.b' in doc(page))
    # 7 ! vira esqueleto
    setdoc(page, "!|"); page.keyboard.press("Tab"); page.wait_for_timeout(200)
    check("! vira esqueleto HTML", doc(page).startswith("<!DOCTYPE html>") and "<title>Document</title>" in doc(page))
    # 8 CSS
    page.locator("div[title='style.css']").click(); page.wait_for_timeout(400)
    for ab, exp in [("m10","margin: 10px;"),("df","display: flex;"),("w100p","width: 100%;")]:
        setdoc(page, ".x {\n  |\n}"); page.keyboard.type(ab); page.wait_for_timeout(150); page.keyboard.press("Tab"); page.wait_for_timeout(150)
        check(f"CSS {ab} → {exp}", exp in doc(page), doc(page).replace("\n","⏎"))
    setdoc(page, ".x {\n  colr|\n}"); page.keyboard.press("Tab")
    check("CSS 'colr' (erro de digitação) não vira chute", "column" not in doc(page))
    setdoc(page, ".x {\n  colo|\n}"); page.keyboard.press("Tab")
    check("CSS prefixo de propriedade fica com o autocompletar", "colo" in doc(page) and ":" not in doc(page).split("{")[1])
    setdoc(page, "m10|"); page.keyboard.press("Tab")
    check("CSS fora de bloco não expande", "margin" not in doc(page))
    # 9 <style> dentro do HTML usa CSS
    page.locator("div[title='index.html']").click(); page.wait_for_timeout(400)
    setdoc(page, "<style>\n  .a {\n    p20|\n  }\n</style>"); page.keyboard.press("Tab")
    check("<style> no HTML expande CSS", "padding: 20px;" in doc(page))
    # 10 envolver
    setdoc(page, H.format("[<p>oi</p>]")); page.keyboard.press("Control+Shift+KeyA"); page.wait_for_timeout(300)
    inp = page.locator(".pz-emmet-wrap input")
    check("Ctrl+Shift+A abre o campo de envolver", inp.count()==1)
    page.keyboard.type("div.card"); page.wait_for_timeout(200)
    check("prévia do envolver", "card" in page.locator(".pz-emmet-wrap .emmet-preview").inner_text())
    page.screenshot(path=os.path.join(SHOTS, "em-2-wrap.png"), clip={"x":300,"y":60,"width":900,"height":360})
    page.keyboard.press("Enter"); page.wait_for_timeout(250)
    d=doc(page); check("envolve a seleção", '<div class="card">' in d and "<p>oi</p>" in d and d.index('card')<d.index('<p>'), d.replace("\n","⏎"))
    setdoc(page, H.format("[um\n  dois]")); page.keyboard.press("Control+Shift+KeyA"); page.keyboard.type("ul>li*"); page.keyboard.press("Enter"); page.wait_for_timeout(200)
    check("ul>li* envolve cada linha", "<li>um</li>" in doc(page) and "<li>dois</li>" in doc(page), doc(page).replace("\n","⏎"))
    setdoc(page, H.format("<p>o|i</p>")); page.keyboard.press("Control+Shift+KeyA"); page.keyboard.type("section"); page.keyboard.press("Enter"); page.wait_for_timeout(200)
    check("sem seleção envolve o elemento", "<section>" in doc(page) and "<p>oi</p>" in doc(page))
    setdoc(page, H.format("[x]")); page.keyboard.press("Control+Shift+KeyA"); page.keyboard.type("b"); page.keyboard.press("Escape"); page.wait_for_timeout(200)
    check("Esc cancela o envolver", doc(page)==H.format("x") and page.locator(".pz-emmet-wrap").count()==0)
    # 11 menu: selecionar tag, par, remover, dividir/juntar
    setdoc(page, H.format('<div class="a">\n    <p>o|i</p>\n  </div>'))
    menu(page, "Selecionar a tag inteira"); s1=sel(page)
    menu(page, "Selecionar a tag inteira"); s2=sel(page)
    menu(page, "Selecionar a tag inteira"); s3=sel(page)
    check("selecionar expande: conteúdo → <p> → <div>", s1=="oi" and s2=="<p>oi</p>" and s3.startswith('<div class="a">') and s3.endswith("</div>"), [s1,s2,s3[:20]])
    setdoc(page, H.format("<p|>oi</p>")); menu(page, "Ir para o par"); 
    pos = page.evaluate(f"() => {V}.state.selection.main.head"); check("ir para o par da tag", doc(page)[pos:pos+4]=="</p>")
    setdoc(page, H.format('<div>\n    <p>o|i</p>\n  </div>')); menu(page, "Remover tag")
    check("remover tag mantém conteúdo", "<p>" not in doc(page) and "oi" in doc(page), doc(page).replace("\n","⏎"))
    setdoc(page, H.format('<div>\n    <p>oi</p>\n  |</div>')); menu(page, "Remover tag")
    check("remover tag tira um nível de indentação", doc(page)==H.format("<p>oi</p>"), doc(page).replace("\n","⏎"))
    setdoc(page, H.format('<div class="x">|</div>')); menu(page, "Dividir / juntar")
    check("juntar tag", '<div class="x" />' in doc(page), doc(page).replace("\n","⏎"))
    menu(page, "Dividir / juntar")
    check("dividir tag", '<div class="x"></div>' in doc(page), doc(page).replace("\n","⏎"))
    setdoc(page, H.format('<img src="a.png" |/>')); menu(page, "Dividir / juntar")
    check("img (vazio por natureza) não é dividido", '<img src="a.png" />' in doc(page))
    # 12 números
    setdoc(page, H.format("<p>12*4+2|</p>")); menu(page, "Calcular")
    check("calcular expressão", "<p>50</p>" in doc(page), doc(page).replace("\n","⏎"))
    setdoc(page, H.format('<p style="margin: 1|0px">x</p>')); menu(page, "Incrementar")
    check("incrementar número", "margin: 11px" in doc(page))
    setdoc(page, H.format('<p style="opacity: 0.|5">x</p>')); menu(page, "Decrementar")
    check("decrementar mantém casas decimais", "opacity: -0.5" in doc(page), doc(page))
    setdoc(page, H.format('<p class="col-1|0">x</p>')); menu(page, "Incrementar")
    check("hífen não vira sinal", "col-11" in doc(page), doc(page))
    # 13 desligar Emmet nas configurações
    errs=[e for e in errs if "addEventListener" not in e]  # erros do script do modelo no preview, já que o documento é trocado
    check("sem erros na página", not errs, errs)
    ok=sum(res.values()); print(f"\n{ok}/{len(res)}")
    ctx.close()
