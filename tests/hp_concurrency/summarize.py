"""
Imprime una traza de run_hp_race.py como línea de tiempo legible.

Uso: python3 tests/hp_concurrency/summarize.py trace.json [--all]
Sin --all oculta las muestras de UI "en reposo" (ui == store, sin escrituras pendientes ni toast).
"""
import json
import sys

NOISE = ("handoutService", "mapService", "combatService")

ev = json.load(open(sys.argv[1]))
show_all = "--all" in sys.argv
t0 = ev[0]["t"]
for e in ev:
    s = e["src"]
    t = (e["t"] - t0) / 1000
    if s == "harness":
        extra = ""
        print(f"{t:7.2f} == {e.get('step', e.get('note'))} {e.get('phase', '')} {e.get('click', '')} {e.get('delta', '')} {extra} {e.get('after', '')}")
    elif s == "server":
        print(f"{t:7.2f}    SERVIDOR      hp={e['hp']}")
    elif s.endswith("-write"):
        print(f"{t:7.2f}    {s:13} hp={e['hp']} campos={e['mask']}")
    elif s.endswith("-ui"):
        quiet = e["ui"] == e["store"] and not e["pending"] and not e["inFlight"] and not e["toast"]
        if quiet and not show_all:
            continue
        print(f"{t:7.2f}    {s:13} ui={e['ui']} store={e['store']} pendiente={e['pending']} enVuelo={e['inFlight']} toast={e['toast'][:60]!r}")
    elif "console" in s and not any(n in e.get("text", "") for n in NOISE):
        print(f"{t:7.2f}    {s} {e.get('level')} {e.get('text', '')[:160]}")
