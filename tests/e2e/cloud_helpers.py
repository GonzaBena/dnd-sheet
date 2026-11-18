"""
tests/e2e/cloud_helpers.py
Utilidades compartidas por las suites en modo nube (emuladores): semilla, login por AuthGate y lecturas.
"""
from __future__ import annotations

import emulator as emu
import fixtures as fx
from harness import BASE, text, wait_hidden, wait_text

PASSWORD = "secreta-e2e-123"
CAMP = "camp-cloud-e2e"
CHAR = "char-cloud-lyra"
MID = "map-cloud-e2e"


def seed_cloud(*, companions=None, with_map=True) -> tuple[str, str]:
    emu.reset()
    dm = emu.sign_up("dm@e2e.test", PASSWORD, "Lord Raven")
    pl = emu.sign_up("jugadora@e2e.test", PASSWORD, "Elena")
    emu.set_doc(f"users/{dm}", {"id": dm, "name": "Lord Raven", "email": "dm@e2e.test"})
    emu.set_doc(f"users/{pl}", {"id": pl, "name": "Elena", "email": "jugadora@e2e.test"})
    camp = fx.make_campaign(CAMP, name="La Mina Perdida (nube)", dm_id=dm, members=[dm, pl], char_ids=[CHAR],
                            **({"activeMapId": MID} if with_map else {}))
    camp["dmName"] = "Lord Raven"
    emu.set_doc(f"campaigns/{CAMP}", camp)
    char = fx.make_character(CHAR, name="Lyra Brasaviva", campaign_id=CAMP, user_id=pl, player_name="Elena",
                             hp=(18, 18, 0), companions=companions or [])
    char["sessionContext"]["campaignName"] = camp["name"]
    emu.set_doc(f"characters/{CHAR}", char)
    if with_map:
        m = fx.make_map(MID)
        # firestore.rules (validMap) exige imageUrl https; el harness responde vacío a cualquier URL externa.
        m["imageUrl"] = "https://example.invalid/cripta.png"
        emu.set_doc(f"campaigns/{CAMP}/maps/{MID}", m)
    return dm, pl


def login(page, email: str, password: str = PASSWORD, expect_ok: bool = True) -> None:
    if not page.url.startswith(BASE):
        page.goto(f"{BASE}/", wait_until="load")
    # cloudSession hace su primer render de forma asíncrona y puede volver a ocultar el modal:
    # se reabre hasta que el botón de envío esté realmente visible.
    for _ in range(10):
        page.evaluate("window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'login' } }))")
        try:
            page.wait_for_selector("#auth-submit", state="visible", timeout=800)
            page.wait_for_timeout(300)
            if page.is_visible("#auth-submit"):
                break
        except Exception:
            pass
    else:
        raise AssertionError("No se pudo abrir el modal de login")
    page.fill("#auth-email", email)
    page.fill("#auth-password", password)
    page.click("#auth-submit")
    if expect_ok:
        page.wait_for_function("localStorage.getItem('dnd_cloud_authed') === '1'", timeout=10000)
        wait_hidden(page, "#auth-gate", timeout=10000)


def open_player(page):
    page.goto(f"{BASE}/campaigns?campaign={CAMP}&character={CHAR}&mode=player", wait_until="domcontentloaded")
    page.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=15000)
    wait_text(page, "#current-hp-num", text(page, "#current-hp-num") or "18", timeout=8000)


def open_dm(page):
    page.goto(f"{BASE}/campaigns?campaign={CAMP}", wait_until="domcontentloaded")
    page.wait_for_selector("#dm-control-workspace:not(.hidden)", timeout=15000)
    page.wait_for_selector("#grimoire-players-grid .hp-sub-btn", timeout=10000)


def map_tokens() -> dict:
    return (emu.get_doc(f"campaigns/{CAMP}/maps/{MID}") or {}).get("tokens") or {}


def char_doc() -> dict:
    return emu.get_doc(f"characters/{CHAR}") or {}




def konva_node(page, tid: str) -> dict | None:
    """Nodo Konva del token (por id) con sus textos, o None."""
    return page.evaluate(
        """tid => {
            for (const st of (window.Konva?.stages || [])) {
                const g = st.find(n => n.id && n.id() === tid)[0];
                if (g) return { texts: g.find('Text').map(t => t.text()), visible: g.isVisible() };
            }
            return null;
        }""",
        tid,
    )


def wait_konva_node(page, tid: str, timeout: int = 8000) -> dict:
    try:
        page.wait_for_function(
            "tid => (window.Konva?.stages || []).some(st => st.find(n => n.id && n.id() === tid).length > 0)",
            arg=tid, timeout=timeout,
        )
    except Exception:
        stages = page.evaluate("() => (window.Konva?.stages || []).map(st => st.find(n => n.id && n.id()).map(n => n.id()).slice(0, 20))")
        raise AssertionError(f"El token {tid} no se dibujó en el lienzo. Nodos con id: {stages}")
    return konva_node(page, tid) or {}
