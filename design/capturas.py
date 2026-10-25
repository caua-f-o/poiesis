# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Capturas de tela da Chrome Web Store (1280×800) em store/, a partir do dist/.

    pnpm build && python3 design/capturas.py          # todas
    python3 design/capturas.py 3                      # só a terceira

Cada cena roda num perfil limpo, com a extensão carregada como nos testes E2E."""
import json, os, subprocess, sys, time

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.path.join(ROOT, "tests", "e2e"))

CENAS = {
    1: "Editor e preview ao vivo com o modelo Gênese e o Pólen (Tinta & Ouro)",
    2: "Inspetor de elementos: seleção no preview, regras e especificidade (One Dark)",
    3: "Rede e APIs: requisição respondida por um mock, com o JSON formatado (Tokyo Night)",
    4: "Extension Studio: manifesto em formulário e popup simulado, com a Lúmen (Catppuccin Mocha)",
    5: "Correção rápida no CSS e preview no modo celular (Papel & Ouro, tema claro)",
}


def cena(n: int):
    from common import launch, setdoc

    ctx, page, ext, errs = launch(f"captura-{n}", viewport=(1280, 800))

    def pal(cmd):
        page.keyboard.press("Escape")
        page.keyboard.press("Control+k"); page.wait_for_timeout(250)
        page.keyboard.type(cmd); page.wait_for_timeout(250)
        page.keyboard.press("Enter"); page.wait_for_timeout(600)

    def abrir(nome):
        page.keyboard.press("Escape")
        page.keyboard.press("Control+p"); page.wait_for_timeout(200)
        page.keyboard.type(nome); page.wait_for_timeout(200)
        page.keyboard.press("Enter"); page.wait_for_timeout(500)

    def preview():
        return page.frame_locator("iframe[title=Preview]").frame_locator("iframe")

    def painel_alto(y=300):
        # arrasta o divisor preview/painel para cima, dando altura ao DevTools
        h = page.locator("[role=separator][aria-orientation=horizontal]").filter(visible=True).first.bounding_box()
        cx, cy = h["x"] + h["width"] / 2, h["y"] + h["height"] / 2
        page.mouse.move(cx, cy); page.mouse.down()
        for i in range(1, 11):
            page.mouse.move(cx, cy + (y - cy) * i / 10); page.wait_for_timeout(20)
        page.mouse.up(); page.wait_for_timeout(400)

    def sem_avisos():
        page.wait_for_timeout(300)
        page.evaluate("() => document.querySelectorAll('[data-sonner-toast]').forEach(t => t.remove())")

    if n == 1:
        page.wait_for_timeout(1500)
        for _ in range(4):
            preview().locator("#semear").click(); page.wait_for_timeout(250)
        page.mouse.move(640, 400)

    elif n == 2:
        pal("Tema: One Dark")
        page.locator("[role=tab]", has_text="Elementos").click(); page.wait_for_timeout(500)
        painel_alto(330)
        page.locator("button[aria-label='Selecionar elemento no preview']").click(); page.wait_for_timeout(300)
        fr = page.frame_locator("iframe[title=Preview]").frame_locator("iframe")
        box = fr.locator("h1").bounding_box()
        page.mouse.move(box["x"] + box["width"] / 3, box["y"] + box["height"] / 2); page.wait_for_timeout(200)
        page.mouse.click(box["x"] + box["width"] / 3, box["y"] + box["height"] / 2); page.wait_for_timeout(900)
        page.mouse.move(box["x"] + box["width"] / 3, box["y"] + box["height"] / 2); page.wait_for_timeout(400)

    elif n == 3:
        pal("Tema: Tokyo Night")
        pal("Editar mocks")
        page.locator("button", has_text="Editar o JSON").click(); page.wait_for_timeout(600)
        poemas = {"poemas": [{"titulo": "Semente", "versos": 4}, {"titulo": "Raiz", "versos": 7}, {"titulo": "Folha", "versos": 3}], "total": 3}
        setdoc(page, json.dumps({"version": 1, "enabled": True, "mocks": [
            {"id": "poemas", "method": "GET", "url": "https://api.exemplo.com/poemas", "status": 200, "headers": {"Content-Type": "application/json"}, "body": json.dumps(poemas), "delay": 180}]}, indent=2, ensure_ascii=False))
        abrir("script.js")
        setdoc(page, """// lista vinda da API (respondida pelo mock do projeto)
fetch("https://api.exemplo.com/poemas")
  .then((r) => r.json())
  .then(({ poemas }) => {
    const ul = document.createElement("ul");
    for (const { titulo, versos } of poemas) {
      const li = document.createElement("li");
      li.textContent = `${titulo} · ${versos} versos`;
      ul.append(li);
    }
    document.querySelector(".cena").append(ul);
    console.log("poemas carregados:", poemas.length);
  });
""")
        page.wait_for_timeout(2500)
        page.locator("[role=tab]", has_text="Rede").click(); page.wait_for_timeout(400)
        painel_alto(420)
        page.locator("[role=listbox][aria-label=Requisições] [role=option]", has_text="poemas").first.click(); page.wait_for_timeout(300)
        page.locator("button.md-chip", has_text="Resposta").last.click(); page.wait_for_timeout(400)

    elif n == 4:
        pal("Tema: Catppuccin Mocha")
        page.locator("button[aria-label='Preferências']").click(); page.wait_for_timeout(400)
        page.locator("[role=dialog] [role=radio]", has_text="Lúmen").click(); page.wait_for_timeout(200)
        page.keyboard.press("Escape"); page.wait_for_timeout(300)
        page.locator("nav button", has_text="Extensão").click(); page.wait_for_timeout(300)
        page.locator("button", has_text="Nova extensão…").first.click(); page.wait_for_timeout(300)
        dlg = page.locator("[data-pz=new-extension]")
        dlg.locator("input[aria-label='Nome da extensão']").fill("Lúmen Notas")
        dlg.locator("input[aria-label='Descrição da extensão']").fill("Anotações rápidas ao lado de qualquer página.")
        for t in ["Página de opções", "Painel lateral"]:
            dlg.locator("label", has_text=t).locator("input").check()
        dlg.locator("button", has_text="Criar extensão").click(); page.wait_for_timeout(2500)
        for _ in range(3):
            preview().locator("#contar").click(); page.wait_for_timeout(250)
        page.mouse.move(640, 400)

    elif n == 5:
        pal("Tema: Papel & Ouro")
        page.locator("button[aria-label='Celular · 390×844']").click(); page.wait_for_timeout(400)
        abrir("style.css")
        txt = page.evaluate("() => document.querySelector('.cm-content').cmTile.root.view.state.doc.toString()")
        setdoc(page, txt.replace("color: var(--papel);", "colr: var(--papel);", 1))
        page.wait_for_timeout(1500)
        pos = page.evaluate("""() => { const v = document.querySelector('.cm-content').cmTile.root.view; const i = v.state.doc.toString().indexOf('colr'); v.dispatch({ selection: { anchor: i + 2 }, scrollIntoView: true }); v.focus(); return i; }""")
        page.wait_for_timeout(300)
        page.keyboard.press("Control+."); page.wait_for_timeout(700)

    sem_avisos()
    page.wait_for_timeout(500)
    out = os.path.join(ROOT, "store", f"captura-{n}.png")
    page.screenshot(path=out)
    print(f"captura-{n}.png — {CENAS[n]}", "| erros:", errs or "nenhum")
    ctx.close()


if __name__ == "__main__":
    if len(sys.argv) > 1:
        cena(int(sys.argv[1]))
    else:
        # um processo por cena (o Playwright síncrono não abre duas vezes no mesmo processo)
        for n in CENAS:
            subprocess.run([sys.executable, __file__, str(n)], check=True)
