"""
tests/e2e/test_cloud_sync.py
Modo nube contra la Firebase Emulator Suite: login real por AuthGate y sincronización en vivo entre
dos usuarios distintos (DM y jugadora) en navegadores aislados.

Requisitos:
  1. Emuladores:   pnpm emulators          (auth 9099, firestore 8080, database 9000; proyecto demo-dnd-sheet)
  2. Build nube:   ver tests/e2e/README.md  (build con PUBLIC_USE_EMULATORS=true en otro outDir)
  3. Ejecutar:     E2E_DIST=<dist-emu> python3 tests/e2e/test_cloud_sync.py
Si los emuladores no están levantados, la suite se omite (sin fallar).
"""
from __future__ import annotations

import json
import os
import sys

os.environ.setdefault("E2E_BASE", "http://127.0.0.1:4321")
os.environ.setdefault("E2E_REAL_SERVER", "1")

import emulator as emu  # noqa: E402
import fixtures as fx
from harness import (
    BASE, Suite, app_dialog, app_dialog_fill, app_dialog_primary,
    expect, expect_eq, text, wait_hidden, wait_text,
)

if not emu.available():
    print("Emuladores no disponibles: se omite la suite de nube.", file=sys.stderr)
    print(json.dumps([{"name": "[Nube] Emuladores no disponibles (omitida)", "passed": True, "skipped": True, "info": "pnpm emulators"}]))
    sys.exit(0)

from cloud_helpers import (  # noqa: E402
    CAMP, CHAR, MID, PASSWORD, char_doc, login, map_tokens, open_dm, open_player, seed_cloud, wait_konva_node,
)


with Suite("Nube (emuladores)") as s:
    dm_ctx = s.new_context(local=False)
    pl_ctx = s.new_context(local=False)
    dm, dm_dialogs = s.new_page(dm_ctx)
    pl, pl_dialogs = s.new_page(pl_ctx)
    pl_console: list[str] = []
    pl.on("console", lambda m: pl_console.append(m.text) if m.type in ("error", "warning") else None)
    seed_cloud()

    # ------------------------------------------------------------------ autenticación
    @s.case("Login: credenciales incorrectas muestran error y el modal sigue abierto")
    def _():
        login(pl, "jugadora@e2e.test", "contraseña-mala", expect_ok=False)
        pl.wait_for_function("document.getElementById('auth-error')?.textContent.trim().length > 0", timeout=8000)
        err = text(pl, "#auth-error")
        expect("conexión" not in err.lower(), f"El error no es de credenciales sino de red: {err!r}")
        expect(pl.is_visible("#auth-gate"), "El modal de login se cerró con credenciales incorrectas")
        pl.click("#auth-close-btn")

    @s.case("Login: email inexistente muestra error")
    def _():
        login(pl, "nadie@e2e.test", PASSWORD, expect_ok=False)
        pl.wait_for_function("document.getElementById('auth-error')?.textContent.trim().length > 0", timeout=8000)
        err = text(pl, "#auth-error")
        expect("conexión" not in err.lower(), f"El error no es de credenciales sino de red: {err!r}")
        pl.click("#auth-close-btn")

    @s.case("Login correcto de DM y jugadora en navegadores separados")
    def _():
        login(dm, "dm@e2e.test")
        login(pl, "jugadora@e2e.test")

    # ------------------------------------------------------------------ datos
    @s.case("La jugadora ve su ficha de la nube y el DM ve al PJ en su roster con los PG correctos")
    def _():
        open_player(pl)
        expect("Lyra Brasaviva" in text(pl, "#hero-name-title"), "Nombre en la ficha de la jugadora")
        expect_eq(text(pl, "#current-hp-num"), "18", "PG en la ficha")
        open_dm(dm)
        card = text(dm, "#grimoire-players-grid")
        expect("Lyra Brasaviva" in card and "18" in card, f"Roster del DM: {card!r}")

    @s.case("La vista de jugador no lanza consultas reservadas al DM ni rompe el cliente de Firestore")
    def _():
        pl.wait_for_timeout(2500)
        bad = [m for m in pl_console if "INTERNAL ASSERTION" in m or "handoutService] onSnapshot error" in m or "dmOnly" in m]
        expect(not bad, "Errores en la consola de la jugadora:\n  - " + "\n  - ".join(x[:160] for x in bad[:4]))

    # ------------------------------------------------------------------ PG en vivo
    @s.case("DM daña 5 al PJ → la ficha de la jugadora baja a 13 en vivo y Firestore lo guarda")
    def _():
        dm_dialogs.answer("5")
        dm.locator("#grimoire-players-grid .hp-sub-btn").first.click()
        wait_text(pl, "#current-hp-num", "13", timeout=10000)
        expect_eq(char_doc()["hp"]["current"], 13, "PG en Firestore")

    @s.case("La jugadora se cura 3 → el Grimorio del DM muestra 16 en vivo")
    def _():
        pl_dialogs.answer("3")
        pl.click("#hp-add-btn")
        wait_text(pl, "#current-hp-num", "16")
        dm.wait_for_function("document.getElementById('grimoire-players-grid').textContent.includes('16')", timeout=10000)
        expect_eq(char_doc()["hp"]["current"], 16, "PG en Firestore")

    @s.case("DM inspira al PJ → la ficha de la jugadora lo refleja en vivo")
    def _():
        before = text(pl, "#hero-inspiration-text")
        dm.locator("#grimoire-players-grid .inspire-btn").first.click()
        pl.wait_for_function("t => document.getElementById('hero-inspiration-text').textContent.trim() !== t", arg=before, timeout=10000)
        expect_eq(char_doc().get("inspiration"), True, "Inspiración en Firestore")

    # ------------------------------------------------------------------ compañeros y mapa
    @s.case("La jugadora añade un compañero → se guarda en Firestore")
    def _():
        pl.click("#btn-add-companion")
        pl.wait_for_selector("#companion-edit-modal:not(.hidden)")
        pl.fill("#comp-form-name", "Brisa")
        pl.select_option("#comp-form-type", "mount")
        pl.select_option("#comp-form-size", "2")
        pl.fill("#comp-form-hp-max", "13")
        pl.click("#companion-edit-modal button[type=submit]")
        wait_hidden(pl, "#companion-edit-modal")
        pl.wait_for_timeout(1500)
        comps = char_doc().get("companions") or []
        expect_eq([(c["name"], c["type"], c["size"]) for c in comps], [("Brisa", "mount", 2)], "Compañeros en Firestore")

    @s.case("El DM ve el compañero nuevo bajo el PJ en su panel de tokens sin recargar")
    def _():
        dm.wait_for_function("document.getElementById('token-adventurers-container').textContent.includes('Brisa')", timeout=8000)

    @s.case("Tras recargar, el DM ve el compañero y lo despliega en el mapa (token de montura 2x2 de la jugadora)")
    def _():
        open_dm(dm)
        dm.wait_for_function("document.getElementById('token-adventurers-container').textContent.includes('Brisa')", timeout=8000)
        dm.click("#token-adventurers-container [data-action='deploy-companion']")
        dm.wait_for_timeout(1500)
        tid, tok = next(((k, t) for k, t in map_tokens().items() if t.get("name", "").startswith("Brisa")), (None, None))
        expect(tok is not None, f"El token no llegó a Firestore: {map_tokens()}")
        expect_eq((tok["kind"], tok["size"], tok["characterId"]), ("mount", 2, CHAR), "Token de montura")
        wait_konva_node(dm, tid)

    @s.case("Cuando el DM despliega el compañero, el panel de la jugadora lo muestra 'En mapa táctico'")
    def _():
        pl.wait_for_function("document.getElementById('companions-list').textContent.includes('En mapa táctico')", timeout=8000)

    @s.case("La jugadora invoca un familiar con el ritual y su token aparece en el mapa del DM")
    def _():
        pl.click("#btn-quick-summon-familiar")
        app_dialog(pl)
        app_dialog_fill(pl, "animal", "Lechuza")
        app_dialog_fill(pl, "customName", "Archimedes")
        app_dialog_primary(pl)
        d = app_dialog(pl, timeout=10000)
        app_dialog_primary(pl)
        expect("desplegada en el mapa" in d["message"], f"La invocación no se desplegó en el mapa: {d}")
        expect(any(t.get("name", "").startswith("Archimedes") for t in map_tokens().values()),
               "El token del familiar no está en Firestore")

    @s.case("Ni la jugadora ni el DM entran en un bucle de 'maps-updated' (lecturas de Firestore sin fin)")
    def _():
        count = """() => new Promise(res => { let n = 0; const h = () => n++;
          window.addEventListener('maps-updated', h);
          setTimeout(() => { window.removeEventListener('maps-updated', h); res(n); }, 1000); })"""
        n_pl, n_dm = pl.evaluate(count), dm.evaluate(count)
        expect(n_pl < 10 and n_dm < 10,
               f"'maps-updated' se emitió en 1 s sin que nadie tocara los mapas: jugadora {n_pl}, DM {n_dm}")

    @s.case("La jugadora renombra su montura desplegada y el DM ve el nombre nuevo en el lienzo")
    def _():
        pl.locator("#companions-list > div", has_text="Brisa").first.locator(".comp-edit-btn").click()
        pl.wait_for_selector("#companion-edit-modal:not(.hidden)")
        pl.fill("#comp-form-name", "Brisa Veloz")
        pl.click("#companion-edit-modal button[type=submit]")
        pl.wait_for_timeout(2000)
        # Brisa es la montura; el familiar del ritual (Archimedes) también tiene companionId.
        tid, tok = next(((k, t) for k, t in map_tokens().items() if t.get("kind") == "mount"), (None, {}))
        expect(tid is not None, f"No está el token de la montura: {map_tokens()}")
        expect(tok.get("name", "").startswith("Brisa Veloz"), f"El token en Firestore conserva el nombre viejo: {tok.get('name')!r}")
        expect_eq(tok.get("size"), 2, "El tamaño del token cambió al renombrar")
        dm.wait_for_function(
            "tid => (window.Konva?.stages || []).some(st => st.find(n => n.id && n.id() === tid)"
            ".some(g => g.find('Text').some(t => t.text().includes('Brisa Veloz'))))",
            arg=tid, timeout=8000,
        )

    # ------------------------------------------------------------------ estado de sesión
    @s.case("DM pausa la partida → Firestore guarda 'paused' y la ficha de la jugadora muestra el aviso de pausa")
    def _():
        dm.locator(".status-btn-pause:visible").first.click()
        if dm.locator("#app-dialog:not(.hidden) .app-dialog-card").count():
            app_dialog_primary(dm)
        dm.wait_for_timeout(1200)
        expect_eq((emu.get_doc(f"campaigns/{CAMP}") or {}).get("status"), "paused", "Estado en Firestore")
        pl.wait_for_function("document.body.textContent.includes('ausa')", timeout=8000)

    # ------------------------------------------------------------------ seguridad
    @s.case("Seguridad: la jugadora no puede leer los tokens ocultos del DM (private/dmOnly)")
    def _():
        emu.set_doc(f"campaigns/{CAMP}/maps/{MID}/private/dmOnly",
                    {"secretTokens": {"tok-secreto": {"name": "Asesino oculto", "x": 0, "y": 0, "size": 1, "ownerUid": None}}})
        pl.goto(f"{BASE}/campaigns?campaign={CAMP}&character={CHAR}&mode=player", wait_until="domcontentloaded")
        pl.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=15000)
        pl.wait_for_timeout(1500)
        expect("Asesino oculto" not in (pl.text_content("body") or ""), "La jugadora ve un token secreto del DM")
