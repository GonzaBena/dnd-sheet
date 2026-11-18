"""
tests/e2e/run_all.py
Ejecuta todas las suites E2E (Playwright + Brave) y muestra un resumen.

  python3 tests/e2e/run_all.py              # suites en modo local (requiere dist/ compilado)
  python3 tests/e2e/run_all.py --cloud      # además la suite de nube (emuladores + dist-e2e-cloud/)
  python3 tests/e2e/run_all.py --json       # imprime al final una línea JSON con todos los resultados

Estados: PASS, FAIL, XFAIL (bug conocido aún presente), XPASS (bug conocido que ya no se reproduce:
quitá el known_bug del caso). El proceso termina con código 1 si hay algún FAIL.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))

LOCAL_SUITES = [
    "test_companions.py",
    "test_tactical_map.py",
    "test_player_sheet.py",
    "test_dm_tools.py",
]
CLOUD_SUITE = "test_cloud_sync.py"


def run_suite(name: str, env: dict) -> list[dict]:
    t0 = time.time()
    proc = subprocess.run(
        [sys.executable, os.path.join(HERE, name)],
        cwd=ROOT, env=env, capture_output=True, text=True, timeout=1200,
    )
    lines = [ln for ln in proc.stdout.strip().splitlines() if ln.startswith("[")]
    try:
        results = json.loads(lines[-1]) if lines else []
    except json.JSONDecodeError:
        results = []
    if not results:
        results = [{"name": f"[{name}] la suite no produjo resultados", "passed": False,
                    "error": (proc.stderr or proc.stdout)[-2000:]}]
    print(f"  {name}: {len(results)} casos en {time.time() - t0:.0f}s", flush=True)
    return results


def status(r: dict) -> str:
    if r.get("skipped"):
        return "SKIP"
    if r.get("xfail"):
        return "XFAIL"
    if r.get("xpass"):
        return "XPASS"
    return "PASS" if r.get("passed") else "FAIL"


def main() -> int:
    cloud = "--cloud" in sys.argv
    as_json = "--json" in sys.argv
    results: list[dict] = []

    print("Suites locales:", flush=True)
    for suite in LOCAL_SUITES:
        results += run_suite(suite, dict(os.environ))

    if cloud:
        env = dict(os.environ)
        env.setdefault("E2E_DIST", os.path.join(ROOT, "dist-e2e-cloud"))
        env.setdefault("E2E_TIMEOUT", "8000")
        if not os.path.isfile(os.path.join(env["E2E_DIST"], "index.html")):
            print(f"Falta el build de nube en {env['E2E_DIST']} (pnpm build:e2e-cloud).", file=sys.stderr)
            return 1
        print("Suite de nube (emuladores):", flush=True)
        results += run_suite(CLOUD_SUITE, env)

    counts: dict[str, int] = {}
    for r in results:
        counts[status(r)] = counts.get(status(r), 0) + 1

    print("\nResultados:")
    for r in results:
        st = status(r)
        if st != "PASS":
            detail = (r.get("info") or r.get("error") or "").splitlines()[0][:180]
            print(f"  {st:<5} {r['name']}\n        {detail}")
    print("\nResumen: " + ", ".join(f"{k} {v}" for k, v in sorted(counts.items())))
    if as_json:
        print(json.dumps(results))
    return 1 if counts.get("FAIL") else 0


if __name__ == "__main__":
    sys.exit(main())
