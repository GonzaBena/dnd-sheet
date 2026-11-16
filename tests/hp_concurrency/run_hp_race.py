"""
tests/hp_concurrency/run_hp_race.py

Reproduce la carrera de PG con dos navegadores reales (DM + jugadora) contra los emuladores.

Requisitos (ver README.md de esta carpeta):
  1. pnpm emulators
  2. App en modo emulador en http://127.0.0.1:4400 (PUBLIC_USE_EMULATORS=true ...)
  3. node tests/hp_concurrency/harness.mjs seed

Uso: python3 tests/hp_concurrency/run_hp_race.py [--out trace.json]

Instrumentación (sin tocar código de la app):
  - muestreo cada 100 ms del PG visible en ambas pantallas
  - estado interno de cloudSync (pendientes / en vuelo) importando el mismo módulo que usa la página (Vite dev)
  - cada escritura que cada cliente envía al canal Write de Firestore (con el hp del payload)
  - cada valor que el servidor confirma (observador independiente en Node)
  - consola y toasts de error
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time
import urllib.parse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("APP_URL", "http://127.0.0.1:4400")
CID = "camp-hp-race"
CHAR = "pj-lyra"
PASSWORD = "secreto123"
BRAVE_BIN = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

T0 = time.time()
events = []  # timeline unificado


def now_ms():
    return int(time.time() * 1000)


def log(src, **kw):
    ev = {"t": now_ms(), "src": src, **kw}
    events.append(ev)
    return ev


SAMPLER_JS = r"""
async ({ who, charId }) => {
  const cs = await import('/src/scripts/data/cloudSync.ts');
  const st = await import('/src/scripts/state/campaignStore.ts');
  const session = cs.cloudSession;
  const read = () => {
    let ui = null;
    if (who === 'player') {
      const el = document.getElementById('current-hp-num');
      ui = el ? Number(el.textContent.trim()) : null;
    } else {
      const btn = document.querySelector(`.hp-btn[data-id="${charId}"]`);
      const card = btn && btn.closest('[data-presence-uid]');
      const m = card && card.innerText.match(/PG\s*(\d+)\s*\/\s*(\d+)/);
      ui = m ? Number(m[1]) : null;
    }
    const storeChar = st.campaignStore.getCharacter(charId);
    const pending = session.pendingCharacters?.has(charId) || false;
    const inFlight = session.inFlightCharacters?.get(charId) || 0;
    const toastEl = document.getElementById('cloud-toast');
    const toast = toastEl && !toastEl.classList.contains('hidden') ? toastEl.textContent.trim() : '';
    return { ui, store: storeChar?.hp?.current ?? null, pending, inFlight, toast };
  };
  window.__hpTrace = [];
  let last = '';
  setInterval(() => {
    const s = read();
    const key = JSON.stringify(s);
    if (key !== last) { last = key; window.__hpTrace.push({ t: Date.now(), ...s }); }
  }, 100);
  return read();
}
"""


def attach_instrumentation(page, who):
    def on_console(msg):
        txt = msg.text
        if msg.type in ("error", "warning") or "[CloudSync]" in txt:
            log(f"{who}-console", level=msg.type, text=txt[:300])

    def on_request(req):
        if "Firestore/Write" not in req.url:
            return
        body = req.post_data or ""
        try:
            body = urllib.parse.unquote_plus(body)
        except Exception:
            pass
        if f"characters/{CHAR}" not in body:
            return
        hp = re.findall(r'"hp":\{"mapValue":\{"fields":\{(.*?)\}\}\}', body)
        cur = None
        if hp:
            m = re.search(r'"current":\{"integerValue":"(-?\d+)"\}', hp[0])
            cur = int(m.group(1)) if m else None
        mask = re.findall(r'"updateMask":\{"fieldPaths":\[(.*?)\]\}', body)
        log(f"{who}-write", hp=cur, mask=mask[0] if mask else None)

    page.on("console", on_console)
    page.on("request", on_request)


def login(page, email, url):
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_selector("#auth-email", state="visible", timeout=30000)
    page.fill("#auth-email", email)
    page.fill("#auth-password", PASSWORD)
    page.click("#auth-submit")
    page.wait_for_selector("#auth-gate", state="hidden", timeout=30000)


def drain(page, who):
    tr = page.evaluate("() => { const t = window.__hpTrace || []; window.__hpTrace = []; return t; }")
    for s in tr:
        events.append({"src": f"{who}-ui", **s})


def wait_ui(page, who, value, timeout=20):
    end = time.time() + timeout
    while time.time() < end:
        v = page.evaluate(
            """(a) => { if (a.who === 'player') { const e = document.getElementById('current-hp-num'); return e ? Number(e.textContent.trim()) : null; }
                 const b = document.querySelector(`.hp-btn[data-id="${a.charId}"]`); const c = b && b.closest('[data-presence-uid]');
                 const m = c && c.innerText.match(/PG\\s*(\\d+)\\s*\\/\\s*(\\d+)/); return m ? Number(m[1]) : null; }""",
            {"who": who, "charId": CHAR},
        )
        if v == value:
            return True
        time.sleep(0.1)
    return False


def main():
    out = sys.argv[sys.argv.index("--out") + 1] if "--out" in sys.argv else os.path.join(tempfile.gettempdir(), "hp_race_trace.json")
    observer = subprocess.Popen(
        ["node", "tests/hp_concurrency/harness.mjs", "observe"],
        cwd=ROOT, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True, bufsize=1,
    )

    import threading

    def pump_observer():
        assert observer.stdout is not None
        for line in observer.stdout:
            try:
                events.append(json.loads(line))
            except Exception:
                pass

    threading.Thread(target=pump_observer, daemon=True).start()

    with sync_playwright() as p:
        launch = {"headless": True, "args": ["--no-sandbox", "--disable-gpu"]}
        if os.path.exists(BRAVE_BIN) and not os.environ.get("USE_BUNDLED_CHROMIUM"):
            launch["executable_path"] = BRAVE_BIN
        browser = p.chromium.launch(**launch)
        # Contextos separados = dos dispositivos (IndexedDB, auth y BroadcastChannel aislados).
        dm_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        pl_ctx = browser.new_context(viewport={"width": 1440, "height": 900})
        dm = dm_ctx.new_page()
        pl = pl_ctx.new_page()
        attach_instrumentation(dm, "dm")
        attach_instrumentation(pl, "player")

        dm_url = f"{BASE}/campaigns/?campaign={CID}&mode=dm"
        pl_url = f"{BASE}/campaigns/?campaign={CID}&character={CHAR}"
        login(dm, "dm@hp-race.test", dm_url)
        login(pl, "jugadora@hp-race.test", pl_url)
        # Tras el login la página puede no haber cargado la vista con los parámetros: recargamos.
        dm.goto(dm_url, wait_until="domcontentloaded")
        pl.goto(pl_url, wait_until="domcontentloaded")
        assert wait_ui(pl, "player", 20, 40), "La jugadora no ve 20 PG al inicio"
        assert wait_ui(dm, "dm", 20, 40), "El DM no ve 20 PG al inicio"
        for page, who in ((dm, "dm"), (pl, "player")):
            log("harness", note=f"sampler {who}", state=page.evaluate(SAMPLER_JS, {"who": who, "charId": CHAR}))

        def pump(seconds):
            # wait_for_timeout procesa los eventos de Playwright (requests, consola) mientras espera.
            pl.wait_for_timeout(int(seconds * 1000))

        latency = int(os.environ.get("LATENCY_MS", "0"))
        cdp_sessions = {}
        if latency:
            for page, who in ((dm, "dm"), (pl, "player")):
                cdp = page.context.new_cdp_session(page)
                cdp.send("Network.enable")
                cdp.send("Network.emulateNetworkConditions", {
                    "offline": False, "latency": latency, "downloadThroughput": -1, "uploadThroughput": -1,
                })
                cdp_sessions[who] = cdp
            log("harness", note=f"latencia simulada {latency} ms")

        def set_dm_offline(offline):
            # Con latencia simulada, las condiciones de red las fija la sesión CDP y pisan a set_offline.
            if "dm" in cdp_sessions:
                cdp_sessions["dm"].send("Network.emulateNetworkConditions", {
                    "offline": offline, "latency": latency, "downloadThroughput": -1, "uploadThroughput": -1,
                })
            else:
                dm_ctx.set_offline(offline)

        steps = []

        def step(name, actions, settle=5.0, expect_change=True):
            steps.append({"name": name, "actions": actions, "expect_change": expect_change})
            log("harness", step=name, phase="start")
            for who, delta, pause in actions:
                page = pl if who == "player" else dm
                if who == "player":
                    sel = {-5: "#hp-sub-5", -1: "#hp-sub-1", 1: "#hp-add-1", 5: "#hp-add-5"}[delta]
                else:
                    sel = f'.hp-btn[data-id="{CHAR}"][data-delta="{delta}"]'
                page.click(sel)
                log("harness", step=name, click=who, delta=delta)
                if pause:
                    pump(pause)
            pump(settle)
            drain(dm, "dm")
            drain(pl, "player")
            log("harness", step=name, phase="end")

        step("S1 jugadora -5", [("player", -5, 0)])
        step("S2 jugadora -1", [("player", -1, 0)])
        step("S3a jugadora -1,-1 (0.25s)", [("player", -1, 0.25), ("player", -1, 0)])
        step("S3b jugadora -1,-1 (1.5s)", [("player", -1, 1.5), ("player", -1, 0)])
        step("S4 DM -1", [("dm", -1, 0)])
        step("S5 DM +1", [("dm", 1, 0)])
        step("S6 concurrente: jugadora -1x3 + DM +1",
             [("player", -1, 0.05), ("dm", 1, 0.05), ("player", -1, 0.05), ("player", -1, 0)], settle=6.0)

        # S7: el DM pierde la conexión y aplica −1. La escritura no puede confirmarse:
        # la UI del DM tiene que volver al valor anterior y mostrar un aviso.
        set_dm_offline(True)
        log("harness", note="DM sin conexión")
        step("S7 DM -1 sin conexión (rechazo)", [("dm", -1, 0)], settle=20.0, expect_change=False)
        set_dm_offline(False)
        log("harness", note="DM con conexión")
        pump(4)
        drain(dm, "dm")
        drain(pl, "player")

        # Recarga de ambas pantallas.
        log("harness", step="reload", phase="start")
        dm.reload(wait_until="domcontentloaded")
        pl.reload(wait_until="domcontentloaded")
        pump(8)
        after = {}
        for page, who in ((dm, "dm"), (pl, "player")):
            after[who] = page.evaluate(
                """(a) => { if (a.who === 'player') { const e = document.getElementById('current-hp-num'); return e ? Number(e.textContent.trim()) : null; }
                     const b = document.querySelector(`.hp-btn[data-id="${a.charId}"]`); const c = b && b.closest('[data-presence-uid]');
                     const m = c && c.innerText.match(/PG\\s*(\\d+)\\s*\\/\\s*(\\d+)/); return m ? Number(m[1]) : null; }""",
                {"who": who, "charId": CHAR},
            )
        log("harness", step="reload", phase="end", after=after)
        browser.close()

    time.sleep(1)
    observer.terminate()
    events.sort(key=lambda e: e.get("t", 0))
    with open(out, "w") as f:
        json.dump(events, f, indent=1, ensure_ascii=False)
    print(f"Traza: {out} ({len(events)} eventos)")

    journal = json.loads(subprocess.run(
        ["node", "tests/hp_concurrency/harness.mjs", "journal"], cwd=ROOT, capture_output=True, text=True, check=True,
    ).stdout.strip().splitlines()[-1])
    ok = verify(events, steps, after, journal)
    sys.exit(0 if ok else 1)


def clamp(v, lo, hi):
    return max(lo, min(hi, v))


def verify(evs, steps, after, journal, start=20, max_hp=30):
    """Comprueba los criterios de aceptación sobre la traza. Devuelve True si todos pasan."""
    checks = []

    def check(name, cond, detail=""):
        checks.append((name, bool(cond), detail))

    def between(src, t0, t1):
        return [e for e in evs if e["src"] == src and t0 <= e["t"] <= t1]

    def step_bounds(name):
        t0 = next(e["t"] for e in evs if e["src"] == "harness" and e.get("step") == name and e.get("phase") == "start")
        t1 = next(e["t"] for e in evs if e["src"] == "harness" and e.get("step") == name and e.get("phase") == "end")
        return t0, t1

    expected = start
    for st in steps:
        name = st["name"]
        t0, t1 = step_bounds(name)
        deltas = [d for _, d, _ in st["actions"]]
        if st["expect_change"]:
            # Suma de los cambios con el clamp aplicado en cada paso (en estos escenarios no se llega a los límites).
            for d in deltas:
                expected = clamp(expected + d, 0, max_hp)
        server_vals = [e["hp"] for e in evs if e["src"] == "server" and e["t"] <= t1]
        check(f"{name}: servidor = {expected}", server_vals and server_vals[-1] == expected, f"servidor={server_vals[-1] if server_vals else None}")
        # Valor visible al final del paso (el muestreo registra cada cambio del DOM).
        last_ui = {}
        for who in ("dm", "player"):
            vals = [e["ui"] for e in evs if e["src"] == f"{who}-ui" and e["t"] <= t1 and e.get("ui") is not None]
            last_ui[who] = vals[-1] if vals else None
        check(f"{name}: ambas pantallas = {expected}", last_ui["dm"] == expected and last_ui["player"] == expected,
              f"dm={last_ui['dm']} jugadora={last_ui['player']}")

        for who in ("dm", "player"):
            series = [e["ui"] for e in between(f"{who}-ui", t0, t1) if e.get("ui") is not None]
            if len(set(d > 0 for d in deltas)) == 1 and st["expect_change"]:
                # Todos los cambios en la misma dirección: el valor visible nunca puede volver atrás.
                sign = 1 if deltas[0] > 0 else -1
                regress = [(a, b) for a, b in zip(series, series[1:]) if (b - a) * sign < 0]
                check(f"{name}: sin retrocesos en {who}", not regress, f"serie={series}")

        if len(st["actions"]) == 1 and st["expect_change"]:
            who, _, _ = st["actions"][0]
            other = "player" if who == "dm" else "dm"
            t_click = next(e["t"] for e in evs if e["src"] == "harness" and e.get("step") == name and "click" in e)
            seen = [e["t"] for e in between(f"{other}-ui", t_click, t1) if e.get("ui") == expected]
            lat = (seen[0] - t_click) / 1000 if seen else None
            check(f"{name}: llega a {other} en < 2 s", lat is not None and lat < 2, f"latencia={lat}s")

        if not st["expect_change"]:
            dm_ui = [e for e in between("dm-ui", t0, t1 + 5000)]
            dipped = any(e.get("ui") == expected - 1 for e in dm_ui)
            final_ui = [e["ui"] for e in dm_ui if e.get("ui") is not None]
            toasts = [e["toast"] for e in dm_ui if e.get("toast")]
            check(f"{name}: la UI del DM vuelve a {expected}", final_ui and final_ui[-1] == expected,
                  f"bajó a {expected - 1}: {dipped}; serie={final_ui}")
            check(f"{name}: se muestra un aviso", any("PG" in t for t in toasts), f"toasts={toasts[:2]}")
            pl_ui = [e["ui"] for e in between("player-ui", t0, t1) if e.get("ui") is not None]
            check(f"{name}: la jugadora no ve el cambio rechazado", all(v == expected for v in pl_ui), f"serie={pl_ui}")

    check(f"tras recargar ambas = {expected}", after.get("dm") == expected and after.get("player") == expected, str(after))

    hp_entries = [j for j in journal if re.search(r"Daño recibido|Curación recibida|Puntos de Golpe ajustados", j.get("title") or "")]
    n_changes = sum(len(st["actions"]) for st in steps if st["expect_change"])
    check(f"bitácora: {n_changes} entradas de PG (una por cambio)", len(hp_entries) == n_changes,
          f"{len(hp_entries)} entradas: " + "; ".join(f"{j['title']} [{j['content']}]" for j in sorted(hp_entries, key=lambda j: j.get("timestamp") or 0)))

    width = max(len(n) for n, _, _ in checks)
    for name, ok, detail in checks:
        print(f"{'OK  ' if ok else 'FAIL'} {name.ljust(width)}  {detail if not ok else ''}")
    failed = [c for c in checks if not c[1]]
    print(f"\n{len(checks) - len(failed)}/{len(checks)} verificaciones OK")
    return not failed


if __name__ == "__main__":
    main()
