# SPDX-License-Identifier: GPL-3.0-only
# Copyright (C) 2026 Cauã F. O.
"""Roda todas as suítes E2E contra dist/ (rode `pnpm build` antes) e resume o resultado.

Uso: python3 tests/e2e/run_all.py [suíte ...]
Requer Python com Playwright e um Chromium instalado (`pip install playwright && playwright install chromium`).
"""
import os, re, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
SUITES = ["basico", "interface", "autocompletar", "verificacao", "emmet", "seguranca", "historico", "pasta", "rede"]

def main():
    chosen = sys.argv[1:] or SUITES
    total_ok = total_fail = 0
    failed = []
    for name in chosen:
        t = time.time()
        p = subprocess.run([sys.executable, os.path.join(HERE, f"{name}.py")], capture_output=True, text=True, cwd=HERE, timeout=900)
        out = p.stdout + p.stderr
        ok = len(re.findall(r"^OK ", out, re.M))
        fail = re.findall(r"^FALHOU .*", out, re.M)
        crashed = "Traceback" in out
        total_ok += ok
        total_fail += len(fail) + (1 if crashed else 0)
        status = "ok" if not fail and not crashed else "FALHOU"
        print(f"{name:<15} {status:<7} {ok} verificações ({time.time() - t:.0f}s)")
        for f in fail:
            print("   ", f)
        if crashed:
            print("   ", "\n    ".join(out[out.index("Traceback"):].splitlines()[-4:]))
        if fail or crashed:
            failed.append(name)
    print(f"\n{total_ok} verificações ok, {total_fail} falhas" + (f" em: {', '.join(failed)}" if failed else ""))
    sys.exit(1 if failed else 0)

if __name__ == "__main__":
    main()
