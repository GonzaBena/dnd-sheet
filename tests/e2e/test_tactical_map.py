"""
tests/e2e/test_tactical_map.py
Mapa táctico desde el panel del DM: TokenEditor (aventureros, compañeros, enemigos, tokens ocultos),
lienzo Konva y sincronización jugador → DM entre pestañas (modo local, BroadcastChannel).

Ejecutar:  python3 tests/e2e/test_tactical_map.py
"""
from __future__ import annotations

from harness import (
    Suite, app_dialog, app_dialog_click, app_dialog_fill, app_dialog_primary,
    expect, expect_eq, ls_get, text, wait_hidden,
)
import fixtures as fx

TOKEN_MODAL = "#token-editor-modal"


def tokens(page, camp=fx.DM_CAMP, mid=fx.MAP_ID) -> dict:
    maps = ls_get(page, f"dnd_maps_{camp}") or []
    m = next((m for m in maps if m["id"] == mid), None)
    return (m or {}).get("tokens") or {}


def secret_tokens(page, camp=fx.DM_CAMP, mid=fx.MAP_ID) -> dict:
    return (ls_get(page, f"dnd_dm_only_{camp}_{mid}") or {}).get("secretTokens") or {}


def konva_token(page, tid: str) -> dict | None:
    """Datos del nodo Konva del token (posición y textos) o None si no está en el lienzo."""
    return page.evaluate(
        """tid => {
            for (const st of (window.Konva?.stages || [])) {
                const g = st.find(n => n.id && n.id() === tid)[0];
                if (g) return { x: Math.round(g.x()), y: Math.round(g.y()), visible: g.isVisible(),
                                 texts: g.find('Text').map(t => t.text()) };
            }
            return null;
        }""",
        tid,
    )


def wait_konva_token(page, tid: str, present: bool = True, timeout: int = 4000) -> None:
    page.wait_for_function(
        """([tid, present]) => {
            const found = (window.Konva?.stages || []).some(st => st.find(n => n.id && n.id() === tid).length > 0);
            return found === present;
        }""",
        arg=[tid, present],
        timeout=timeout,
    )


def quick_enemy(page, name: str, size="1", qty="1"):
    page.click("#token-editor-quick-enemy-btn")
    app_dialog(page)
    app_dialog_fill(page, "name", name)
    app_dialog_fill(page, "size", size)
    app_dialog_fill(page, "qty", qty)
    app_dialog_primary(page)


def monster_card(page, name: str):
    return page.locator("#token-monsters-container > div", has_text=name).first


def adventurer_rows(page):
    return page.locator("#token-adventurers-container > div")


def fresh_dm(page, **kw):
    fx.seed_dm(page, **kw)
    fx.open_dm(page)
    page.wait_for_selector("#dm-token-editor-root", timeout=5000)
    page.wait_for_timeout(300)


with Suite("Mapa táctico (DM)") as s:
    ctx = s.new_context()
    page, dialogs = s.new_page(ctx)

    # ------------------------------------------------------------------ aventureros
    @s.case("Lista de aventureros: muestra nombre, raza y CLASE correcta del PJ")
    def _():
        fresh_dm(page)
        row = " ".join((adventurer_rows(page).first.text_content() or "").split())
        expect("Kaeroc" in row, f"Falta el nombre del PJ: {row!r}")
        expect_eq(text(page, "#token-adventurers-count"), "1 personaje", "Contador de aventureros")
        expect("Brujo" in row, f"La tarjeta no muestra la clase 'Brujo' del PJ: {row!r}")

    @s.case("Desplegar PJ: crea token centrado y en grilla, con dueño = jugador; la tarjeta pasa a 'En mapa'")
    def _():
        fresh_dm(page)
        page.click("#token-adventurers-container [data-action='deploy']")
        page.wait_for_function("document.querySelector('#token-adventurers-container').innerText.includes('En mapa')", timeout=3000)
        toks = tokens(page)
        expect_eq(len(toks), 1, "Tokens tras desplegar")
        tid, t = next(iter(toks.items()))
        expect_eq((t["characterId"], t["ownerUid"], t["name"], t["size"]), (fx.DM_PC, fx.ELENA, "Kaeroc Cuernonegro", 1), "Datos del token de PJ")
        expect(t["x"] % 25 == 0 and t["y"] % 25 == 0, f"El token no quedó alineado a la grilla: {t['x']},{t['y']}")
        wait_konva_token(page, tid)
        expect(page.locator("#token-adventurers-container [data-action='deploy']").count() == 0, "Sigue el botón '+ Desplegar' tras desplegar (permite duplicados)")
        expect_eq(page.locator("#token-monsters-container > div", has_text="Kaeroc").count(), 0, "El PJ no debe listarse como monstruo")

    @s.case("Desplegar el compañero de un PJ desde el panel del DM crea un token de compañero (no de monstruo)")
    def _():
        fresh_dm(page, pc_overrides={"companions": [{"id": "comp-imp", "name": "Diablillo", "type": "familiar", "size": 1, "hp": {"current": 10, "max": 10}}]})
        rows = page.inner_text("#token-adventurers-container")
        expect("Diablillo" in rows and "Familiar (1x1)" in rows, f"El compañero no aparece bajo el PJ: {rows!r}")
        page.click("#token-adventurers-container [data-action='deploy-companion']")
        page.wait_for_timeout(300)
        toks = tokens(page)
        comp_tok = next((t for t in toks.values() if t.get("companionId") == "comp-imp"), None)
        expect(comp_tok is not None, f"No se creó el token del compañero: {toks}")
        expect_eq((comp_tok["kind"], comp_tok["ownerUid"], comp_tok["characterId"]), ("companion", fx.ELENA, fx.DM_PC), "Token de compañero")
        expect_eq(comp_tok["name"], "Diablillo (Kaeroc Cuernonegro)", "Nombre del token de compañero")
        expect_eq(page.locator("#token-monsters-container > div", has_text="Diablillo").count(), 0, "El compañero aparece como monstruo")
        # El PJ en sí sigue sin desplegar: un token de compañero no debe contar como el token del PJ
        expect(page.locator("#token-adventurers-container [data-action='deploy']").count() == 1,
               "El token del compañero se confundió con el del PJ")

    # ------------------------------------------------------------------ enemigos
    @s.case("+ Enemigo x3: crea 'Goblin 1..3' en fila, lista '3 criaturas' y dibuja los 3 en el lienzo")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Goblin", qty="3")
        page.wait_for_function("document.getElementById('token-monsters-count').textContent.includes('3 criaturas')", timeout=3000)
        toks = tokens(page)
        names = sorted(t["name"] for t in toks.values())
        expect_eq(names, ["Goblin 1", "Goblin 2", "Goblin 3"], "Nombres de enemigos")
        xs = sorted(t["x"] for t in toks.values())
        expect_eq(len(set(t["y"] for t in toks.values())), 1, "Los enemigos deberían estar en la misma fila")
        expect_eq(xs[1] - xs[0], 50, "Separación horizontal de una casilla")
        expect(all(t["ownerUid"] is None for t in toks.values()), "Los enemigos no deben tener dueño")
        for tid in toks:
            wait_konva_token(page, tid)

    @s.case("Editar enemigo desde su tarjeta: nombre y tamaño se reflejan en tarjeta, almacenamiento y lienzo")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Orco")
        monster_card(page, "Orco").locator("[data-action='edit']").click()
        page.wait_for_selector(f"{TOKEN_MODAL}:not(.hidden)")
        expect_eq(page.input_value("#token-field-name"), "Orco", "El modal debe precargar el nombre")
        page.fill("#token-field-name", "Orco Jefe")
        page.click("#token-editor-form label:has(input[name='token-size'][value='2'])")
        page.click("#token-save-btn")
        wait_hidden(page, TOKEN_MODAL)
        page.wait_for_function("document.querySelector('#token-monsters-container').innerText.includes('Orco Jefe')", timeout=3000)
        tid, t = next(iter(tokens(page).items()))
        expect_eq((t["name"], t["size"]), ("Orco Jefe", 2), "Token editado")
        expect("2×2" in monster_card(page, "Orco Jefe").inner_text(), "La tarjeta no muestra el nuevo tamaño")
        kt = konva_token(page, tid)
        expect(kt is not None and any("Orco Jefe" in x for x in kt["texts"]),
               f"El lienzo no refleja el nuevo nombre: {kt}")

    @s.case("Eliminar el último enemigo desde el modal lo quita del mapa, del lienzo y de la lista de criaturas")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Kobold")
        tid = next(iter(tokens(page)))
        wait_konva_token(page, tid)
        monster_card(page, "Kobold").locator("[data-action='edit']").click()
        page.wait_for_selector(f"{TOKEN_MODAL}:not(.hidden)")
        page.click("#token-delete-btn")
        app_dialog(page)
        app_dialog_click(page, "Eliminar")
        page.wait_for_timeout(250)
        expect_eq(tokens(page), {}, "Tokens tras eliminar")
        wait_konva_token(page, tid, present=False)
        page.wait_for_function("document.getElementById('token-monsters-count').textContent.trim() === '0 criaturas'", timeout=3000)

    @s.case("Eliminar enemigo desde el botón de papelera de su tarjeta")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Lobo")
        monster_card(page, "Lobo").locator("[data-action='delete']").click()
        d = app_dialog(page, timeout=2000)
        expect("Lobo" in d["message"], f"Confirmación inesperada: {d}")
        app_dialog_click(page, "Eliminar")
        page.wait_for_timeout(250)
        expect_eq(tokens(page), {}, "Tokens tras eliminar desde la tarjeta")

    @s.case("Ocultar un enemigo lo mueve a datos secretos del DM (OCULTO) y revelarlo lo devuelve al mapa")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Asesino")
        tid = next(iter(tokens(page)))
        monster_card(page, "Asesino").locator("[data-action='edit']").click()
        page.wait_for_selector(f"{TOKEN_MODAL}:not(.hidden)")
        page.click("#token-toggle-secret-btn")
        wait_hidden(page, TOKEN_MODAL)
        page.wait_for_timeout(300)
        expect(tid not in tokens(page), "El token oculto sigue en los tokens públicos")
        expect(tid in secret_tokens(page), "El token oculto no está en los datos secretos del DM")
        expect("OCULTO" in monster_card(page, "Asesino").inner_text(), "La tarjeta no marca el token como OCULTO")
        monster_card(page, "Asesino").locator("[data-action='edit']").click()
        page.wait_for_selector(f"{TOKEN_MODAL}:not(.hidden)")
        page.click("#token-toggle-secret-btn")
        wait_hidden(page, TOKEN_MODAL)
        page.wait_for_timeout(300)
        expect(tid in tokens(page), "Revelar no devolvió el token al mapa público")
        expect(tid not in secret_tokens(page), "El token revelado sigue en los datos secretos")

    @s.case("Nuevo Token → 'Colocar en el centro' abre el modal con coordenadas centradas y crea el token")
    def _():
        fresh_dm(page)
        page.click("#token-editor-new-btn")
        page.wait_for_selector("#token-placement-banner:not(.hidden)")
        page.click("#token-placement-center-btn")
        page.wait_for_selector(f"{TOKEN_MODAL}:not(.hidden)")
        expect_eq((page.input_value("#token-field-x"), page.input_value("#token-field-y")), ("500", "400"), "Coordenadas centradas")
        page.fill("#token-field-name", "Antorcha")
        page.click("#token-save-btn")
        wait_hidden(page, TOKEN_MODAL)
        page.wait_for_timeout(250)
        t = next(iter(tokens(page).values()))
        expect_eq((t["name"], t["x"], t["y"]), ("Antorcha", 500, 400), "Token creado en el centro")

    @s.case("Persistencia: tokens y estado de los paneles sobreviven a la recarga")
    def _():
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#dm-control-workspace:not(.hidden)")
        page.wait_for_function("document.querySelector('#token-monsters-container').innerText.includes('Antorcha')", timeout=5000)
        tid = next(iter(tokens(page)))
        wait_konva_token(page, tid)
        kt = konva_token(page, tid)
        expect(kt is not None, "El token no se redibujó tras recargar")

    # ------------------------------------------------------------------ tristes
    @s.case("Triste: + Enemigo con nombre vacío muestra error y no crea tokens")
    def _():
        fresh_dm(page)
        page.click("#token-editor-quick-enemy-btn")
        app_dialog(page)
        page.locator("#app-dialog .app-dialog-card > div:last-child button").last.click()
        page.wait_for_timeout(200)
        err = page.locator("#app-dialog p.text-rose-300")
        expect(err.count() == 1 and err.is_visible(), "No se mostró el error de campo obligatorio")
        page.keyboard.press("Escape")
        page.wait_for_timeout(250)
        expect_eq(tokens(page), {}, "Se crearon tokens con nombre vacío")

    @s.case("Triste: + Enemigo con tamaño 99 y cantidad 0 se acota a 4x4 y 1 unidad")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Tarrasca", size="99", qty="0")
        page.wait_for_timeout(250)
        toks = list(tokens(page).values())
        expect_eq(len(toks), 1, "Cantidad acotada")
        expect_eq(toks[0]["size"], 4, "Tamaño acotado")

    @s.case("Triste: + Enemigo sin mapa activo avisa 'Sin Mapa'")
    def _():
        fresh_dm(page, with_map=False)
        page.click("#token-editor-quick-enemy-btn")
        d = app_dialog(page)
        expect_eq(d["title"], "Sin Mapa", "Título del aviso")
        app_dialog_primary(page)

    @s.case("Triste: con la partida terminada no se pueden crear ni desplegar tokens")
    def _():
        fresh_dm(page, camp_overrides={"status": "ended"})
        page.click("#token-editor-quick-enemy-btn")
        d = app_dialog(page)
        expect_eq(d["title"], "Partida Terminada", "Aviso al crear enemigo")
        app_dialog_primary(page)
        if page.locator("#token-adventurers-container [data-action='deploy']").count():
            page.click("#token-adventurers-container [data-action='deploy']")
            d = app_dialog(page)
            expect_eq(d["title"], "Partida Terminada", "Aviso al desplegar PJ")
            app_dialog_primary(page)
        expect_eq(tokens(page), {}, "Se crearon tokens con la partida terminada")

    @s.case("Triste: cancelar la colocación de un token nuevo oculta el banner y no abre el modal")
    def _():
        fresh_dm(page)
        page.click("#token-editor-new-btn")
        page.wait_for_selector("#token-placement-banner:not(.hidden)")
        page.click("#token-placement-cancel-btn")
        wait_hidden(page, "#token-placement-banner")
        expect(not page.is_visible(TOKEN_MODAL), "Se abrió el modal tras cancelar")

    @s.case("Triste: cerrar el modal de edición sin guardar no modifica el token")
    def _():
        fresh_dm(page)
        quick_enemy(page, "Ogro")
        monster_card(page, "Ogro").locator("[data-action='edit']").click()
        page.wait_for_selector(f"{TOKEN_MODAL}:not(.hidden)")
        page.fill("#token-field-name", "NO GUARDAR")
        page.click("#token-cancel-btn")
        wait_hidden(page, TOKEN_MODAL)
        expect_eq(next(iter(tokens(page).values()))["name"], "Ogro", "El nombre cambió sin guardar")

    @s.case("Seguridad: un nombre de token con HTML no ejecuta código en la lista de criaturas")
    def _():
        fresh_dm(page)
        page.evaluate("window.__xss = 0")
        quick_enemy(page, '<img src=x onerror="window.__xss=1">')
        page.wait_for_timeout(400)
        expect_eq(page.evaluate("window.__xss"), 0, "Se ejecutó JS inyectado desde el nombre del token")

    # ------------------------------------------------------------------ sincronización entre pestañas
    @s.case("Sync jugador→DM (2 pestañas): el jugador invoca un familiar y el DM lo ve bajo su PJ sin recargar")
    def _():
        # Yo soy DM y además juego un PJ propio en mi campaña: dos pestañas del mismo navegador.
        fx.seed_dm(page, pc_overrides={"userId": fx.ME, "playerName": "Gonzo (Tú)"})
        page.evaluate("pc => localStorage.setItem('dnd_active_character_v1', JSON.stringify(pc))",
                      next(c for c in ls_get(page, "dnd_all_characters_v1") if c["id"] == fx.DM_PC))
        fx.open_dm(page)
        player, _pd = s.new_page(ctx)
        player.goto(f"{fx.BASE}/campaigns?campaign={fx.DM_CAMP}&character={fx.DM_PC}&mode=player", wait_until="domcontentloaded")
        player.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=10000)
        fx.wait_app_ready(player)
        player.click("#btn-quick-summon-familiar")
        app_dialog(player)
        app_dialog_fill(player, "customName", "Pseudodragón")
        app_dialog_primary(player)
        app_dialog_primary(player)
        # La pestaña del DM debe reflejarlo sin recargar
        try:
            page.wait_for_function("document.querySelector('#token-adventurers-container').textContent.includes('Pseudodragón')", timeout=5000)
        except Exception:
            player.close()
            raise AssertionError("La lista de aventureros del DM no muestra el familiar nuevo sin recargar")
        finally:
            player.close()

    @s.case("Sync jugador→DM (2 pestañas): el jugador renombra su familiar y el DM ve el nombre nuevo sin recargar")
    def _():
        fx.seed_dm(page, pc_overrides={"userId": fx.ME, "playerName": "Gonzo (Tú)", "companions": [
            {"id": "comp-tic", "name": "Tic", "type": "familiar", "size": 1, "hp": {"current": 3, "max": 3}}]})
        page.evaluate("pc => localStorage.setItem('dnd_active_character_v1', JSON.stringify(pc))",
                      next(c for c in ls_get(page, "dnd_all_characters_v1") if c["id"] == fx.DM_PC))
        fx.open_dm(page)
        expect("Tic" in text(page, "#token-adventurers-container"), "El DM no ve el familiar inicial")
        player, _pd = s.new_page(ctx)
        player.goto(f"{fx.BASE}/campaigns?campaign={fx.DM_CAMP}&character={fx.DM_PC}&mode=player", wait_until="domcontentloaded")
        player.wait_for_selector("#companions-list .comp-edit-btn", timeout=10000)
        fx.wait_app_ready(player)
        player.click("#companions-list .comp-edit-btn")
        player.fill("#comp-form-name", "Tac")
        player.click("#companion-edit-modal button[type=submit]")
        try:
            page.wait_for_function("document.querySelector('#token-adventurers-container').textContent.includes('Tac')", timeout=5000)
        finally:
            player.close()
