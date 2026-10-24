"""Gera um subconjunto do Material Symbols Rounded só com os ícones usados no código."""
import re, sys, pathlib
from fontTools.ttLib import TTFont
from fontTools import subset
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
FULL = ROOT / "node_modules/material-symbols/material-symbols-rounded.woff2"
OUT = ROOT / "src/assets/fonts/msr.woff2"

font = TTFont(FULL)
cmap = font.getBestCmap()
glyph2char = {}
for cp, g in sorted(cmap.items()):
    glyph2char[g] = chr(cp)  # prefere minúsculas (codepoints maiores)

ligs = {}
for lookup in font["GSUB"].table.LookupList.Lookup:
    for st in lookup.SubTable:
        if type(st).__name__ == "ExtensionSubst":
            st = st.ExtSubTable
        if type(st).__name__ != "LigatureSubst":
            continue
        for first, entries in st.ligatures.items():
            for lig in entries:
                comps = [first] + list(lig.Component)
                try:
                    name = "".join(glyph2char[c] for c in comps)
                except KeyError:
                    continue
                ligs[name] = lig.LigGlyph

tokens = set()
for f in list((ROOT / "src").rglob("*.ts")) + list((ROOT / "src").rglob("*.tsx")):
    tokens |= set(re.findall(r"[\"'`]([a-z0-9_]{2,40})[\"'`]", f.read_text(encoding="utf-8")))
    # nomes dentro de JSX: >nome<
    tokens |= set(re.findall(r">\s*([a-z0-9_]{3,40})\s*<", f.read_text(encoding="utf-8")))

used = sorted(t for t in tokens if t in ligs)
missing_hint = sorted(t for t in tokens if t not in ligs and "_" in t)
print(f"{len(used)} ícones:", " ".join(used))

glyphs = {ligs[n] for n in used}
chars = "abcdefghijklmnopqrstuvwxyz0123456789_"
glyphs |= {cmap[ord(c)] for c in chars if ord(c) in cmap}

opts = subset.Options()
opts.layout_features = ["liga", "rlig", "rclt", "calt", "ccmp"]
opts.layout_closure = False
opts.notdef_outline = True
opts.name_IDs = ["*"]
opts.drop_tables += ["DSIG"]
sub = subset.Subsetter(opts)
sub.populate(glyphs=sorted(glyphs), unicodes=[ord(c) for c in chars])
sub.subset(font)

font = instancer.instantiateVariableFont(font, {"wght": 400, "GRAD": 0, "opsz": 24})
font.flavor = "woff2"
font.save(OUT)
print("salvo", OUT, OUT.stat().st_size // 1024, "KB")
