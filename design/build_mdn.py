"""Compacta os dados do MDN (via @vscode/web-custom-data) para o fallback em inglês das definições."""
import json, re, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
D = ROOT / "node_modules/@vscode/web-custom-data/data"
c = json.load(open(D / "browsers.css-data.json"))
h = json.load(open(D / "browsers.html-data.json"))

def clean(d):
    if isinstance(d, dict): d = d.get("value", "")
    d = d or ""
    d = re.sub(r"\[([^\]]+)\]\([^)]*\)", r"\1", d)
    d = re.sub(r"\s+", " ", d).strip()
    return d[:420] + ("…" if len(d) > 420 else "")

out = {"css": {}, "at": {}, "pseudo": {}, "tags": {}, "attrs": {}}
for p in c["properties"]:
    if p.get("atRule"): continue
    vals = [v["name"] for v in p.get("values", [])][:14]
    out["css"][p["name"]] = [clean(p.get("description")), p.get("syntax", ""), vals]
for a in c["atDirectives"]:
    out["at"][a["name"]] = clean(a.get("description"))
for a in c["pseudoClasses"] + c["pseudoElements"]:
    out["pseudo"][a["name"]] = clean(a.get("description"))
for t in h["tags"]:
    out["tags"][t["name"]] = [clean(t.get("description")), {a["name"]: clean(a.get("description")) for a in t.get("attributes", []) if a.get("description")}]
for a in h["globalAttributes"]:
    out["attrs"][a["name"]] = clean(a.get("description"))
dst = ROOT / "src/lib/mdn-data.json"
dst.write_text(json.dumps(out, ensure_ascii=False, separators=(",", ":")))
print(dst, dst.stat().st_size // 1024, "KB", {k: len(v) for k, v in out.items()})
