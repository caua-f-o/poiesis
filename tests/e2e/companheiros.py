# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Companheiros (Pólen e Lúmen) e música de foco: reações aos eventos do editor com limites,
níveis (foco, discreto, vivo), posição, marcos cosméticos, movimento reduzido, pausa com a
aba escondida e a música tocando do arquivo empacotado, sem rede."""
from common import launch, check, report, setdoc

ctx, page, ext, errs = launch("pcomp")
external = []
page.on("request", lambda r: (not r.url.startswith(("chrome-extension://", "data:", "blob:", "about:"))) and external.append(r.url))

def comp():
    return page.locator("[data-pz=companion]")

def pose():
    return comp().get_attribute("data-pose")

def reactions():
    return int(comp().get_attribute("data-reactions") or 0)

def wait_pose(p, ms=2500):
    for _ in range(ms // 100):
        if comp().count() and pose() == p:
            return True
        page.wait_for_timeout(100)
    return False

def prefs():
    page.locator("button[aria-label='Preferências']").click(); page.wait_for_timeout(400)

def close():
    page.keyboard.press("Escape"); page.wait_for_timeout(300)

def open_file(name):
    page.keyboard.press("Control+p"); page.wait_for_timeout(200)
    page.keyboard.type(name); page.wait_for_timeout(200); page.keyboard.press("Enter"); page.wait_for_timeout(400)

# ---------------------------------------------------------------- 1 padrão
check("Pólen aparece por padrão", comp().count() == 1 and comp().get_attribute("data-id") == "polen")
check("nível padrão: discreto, em repouso", comp().get_attribute("data-level") == "discreto" and pose() == "idle")
box = comp().bounding_box()
ed = page.locator(".cm-editor").bounding_box()
check("fica na barra lateral, longe do código", box["x"] + box["width"] <= 80 and box["x"] + box["width"] < ed["x"], (box, ed))
check("arte decorativa, botão com nome", comp().locator("svg").get_attribute("aria-hidden") == "true" and "Pólen" in comp().get_attribute("aria-label"))

# ---------------------------------------------------------------- 2 eventos
page.locator("button[aria-label='Novo arquivo']").first.click(); page.keyboard.type("ideia.js"); page.keyboard.press("Enter")
check("arquivo criado: curiosidade", wait_pose("curious", 1500))
check("e volta ao repouso sozinho (reação curta)", wait_pose("idle", 3000))

open_file("script.js")
setdoc(page, "throw new Error('ops do teste')\n")
check("erro no preview: dúvida, sem drama", wait_pose("doubt", 3500))
wait_pose("idle", 3000)
n0 = reactions()
page.keyboard.press("Control+r"); page.wait_for_timeout(2500)
check("o mesmo erro não reage de novo", reactions() == n0, (n0, reactions()))
setdoc(page, "console.log('ok')\n"); page.wait_for_timeout(1200)
page.locator("button", has_text="Executar").click()
check("execução sem erros: comemora", wait_pose("happy", 2500))
wait_pose("idle", 3000)

page.locator("[role=tab]", has_text="Elementos").click(); page.wait_for_timeout(500)
check("inspecionando: postura de observação", wait_pose("observe", 2000))
page.locator("[role=tab]", has_text="Console").click(); page.wait_for_timeout(300)
check("fora do inspetor: repouso", wait_pose("idle", 2000))

comp().click()
check("clique: carinho", wait_pose("pet", 800))
wait_pose("idle", 2500)

# muitos eventos seguidos não viram festa contínua
n1 = reactions()
for i in range(5):
    page.locator("button[aria-label='Novo arquivo']").first.click(); page.keyboard.type(f"x{i}.js"); page.keyboard.press("Enter"); page.wait_for_timeout(150)
page.wait_for_timeout(300)
check("reações têm intervalo mínimo", reactions() - n1 <= 2, reactions() - n1)

# ---------------------------------------------------------------- 3 dormir e acordar
page.evaluate("() => { const real = Date.now.bind(Date); window.__realNow = real; Date.now = () => real() + 6 * 60 * 1000; }")
check("muito tempo parado: dorme", wait_pose("sleep", 3500))
page.evaluate("() => { Date.now = window.__realNow; }")
open_file("index.html")
page.locator(".cm-content").click(); page.keyboard.type(" "); page.keyboard.press("Backspace"); page.wait_for_timeout(400)
check("digitar acorda", wait_pose("idle", 2500))

# ---------------------------------------------------------------- 4 marco cosmético
page.locator("button[aria-label='Exportar']").click() if page.locator("button[aria-label='Exportar']").count() else page.locator("header button:has(.msr:text('ios_share'))").click()
page.wait_for_timeout(300)
with page.expect_download():
    page.locator("[role=menuitem]", has_text="Projeto (.zip)").click()
check("exportar: comemora", wait_pose("happy", 2500))
check("primeira exportação: Pólen ganha uma flor", comp().locator(".pzc-mark").count() == 1)

# ---------------------------------------------------------------- 5 preferências
prefs()
dlg = page.locator("[role=dialog]")
dlg.locator("[role=radio]", has_text="Lúmen").click(); page.wait_for_timeout(300)
dlg.get_by_role("radio", name="Foco", exact=True).click(); page.wait_for_timeout(300)
check("marco aparece nas preferências", "Lúmen ganhou uma estrela" in dlg.inner_text())
close()
check("troca para Lúmen, com o marco", comp().get_attribute("data-id") == "lumen" and comp().locator(".pzc-mark").count() == 1)
n2 = reactions()
page.locator("button[aria-label='Novo arquivo']").first.click(); page.keyboard.type("foco.js"); page.keyboard.press("Enter"); page.wait_for_timeout(800)
check("nível foco: repouso, sem reações", reactions() == n2 and pose() == "rest")
check("nível foco: sem animação", comp().locator(".pzc-float").evaluate("e => getComputedStyle(e).animationName") == "none")

prefs()
dlg.get_by_role("radio", name="Vivo", exact=True).click()
dlg.get_by_role("radio", name="Barra superior", exact=True).click(); page.wait_for_timeout(300)
close()
b = comp().bounding_box()
check("posição na barra superior", b["y"] < 56 and page.locator(".pzc-rail").count() == 0, b)
check("nível vivo: animado", comp().locator(".pzc-float").evaluate("e => getComputedStyle(e).animationName") != "none")
page.emulate_media(reduced_motion="reduce"); page.wait_for_timeout(300)
check("movimento reduzido: sem animação", comp().locator(".pzc-float").evaluate("e => getComputedStyle(e).animationName") == "none")
page.emulate_media(reduced_motion="no-preference")

prefs()
dlg.locator("button", has_text="Redefinir").click(); page.wait_for_timeout(200)
dlg.locator("[role=radio]", has_text="Nenhum").click(); page.wait_for_timeout(300)
close()
check("redefinir marcos e escolher nenhum: sem companheiro", comp().count() == 0)
prefs(); page.locator("[role=dialog] [role=radio]", has_text="Pólen").click(); page.get_by_role("radio", name="Barra lateral", exact=True).click(); close()
check("Pólen de volta, sem a flor", comp().count() == 1 and comp().locator(".pzc-mark").count() == 0)

# ---------------------------------------------------------------- 6 música de foco
before = len(external)
page.locator("[data-pz=music]").click(); page.wait_for_timeout(300)
panel = page.locator("[data-pz=music-panel]")
check("painel da música com a faixa", "Jardim de Luz" in panel.inner_text())
panel.locator("button[aria-label='Tocar a música']").click(); page.wait_for_timeout(2500)
check("música toca do arquivo da extensão", page.locator("[data-pz=music]").get_attribute("data-state") == "playing")
check("nenhuma requisição externa para tocar", len(external) == before, external[before:])
panel.locator("input[aria-label='Volume da música']").evaluate("(e) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(e, '20'); e.dispatchEvent(new Event('input', { bubbles: true })); }")
page.wait_for_timeout(300)
check("volume muda e fica salvo", "20" in panel.inner_text())
check("tocando música: companheiro repousa, curtindo", wait_pose("rest", 2500))
page.evaluate("() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); }")
page.wait_for_timeout(1600)
check("aba escondida: música pausa", page.locator("[data-pz=music]").get_attribute("data-state") == "paused")
check("aba escondida: animações congeladas", "pzc-paused" in (comp().get_attribute("class") or ""))
page.evaluate("() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => false }); document.dispatchEvent(new Event('visibilitychange')); }")
page.wait_for_timeout(800)
check("aba de volta: música continua", page.locator("[data-pz=music]").get_attribute("data-state") == "playing")
panel.locator("button[aria-label='Pausar a música']").click(); page.wait_for_timeout(1600)
check("pausar", page.locator("[data-pz=music]").get_attribute("data-state") == "paused")
close()

# nada disso mexe no projeto
open_file("index.html")
check("companheiro não captura o teclado", page.evaluate("document.activeElement && document.activeElement.closest('[data-pz=companion]') === null"))

# janela baixa (notebook): o companheiro não some, vai para a barra superior
page.set_viewport_size({"width": 1366, "height": 640}); page.wait_for_timeout(500)
b = comp().bounding_box() if comp().count() else None
check("janela baixa: companheiro continua visível, na barra superior", b is not None and b["y"] < 56 and b["height"] > 30, b)
page.set_viewport_size({"width": 1440, "height": 900}); page.wait_for_timeout(500)
b = comp().bounding_box()
check("janela alta: volta para a barra lateral", b["x"] < 80 and b["y"] > 300, b)

report(errs, ignore=["addEventListener", "dataset", "ops do teste"])
