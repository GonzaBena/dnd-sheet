"""
tests/e2e/test_companions.py
Compañeros, familiares, monturas e invocaciones (CompanionsPanel) — caminos felices y tristes.

Ejecutar:  python3 tests/e2e/test_companions.py      (E2E_ONLY="texto" para filtrar)
"""
from __future__ import annotations

from harness import (
    Suite, app_dialog, app_dialog_fill, app_dialog_primary, app_dialog_click,
    expect, expect_eq, ls_get, wait_hidden,
)
import fixtures as fx

PANEL = "#companions-panel"
MODAL = "#companion-edit-modal"


def companions_in_storage(page) -> list[dict]:
    char = ls_get(page, "dnd_active_character_v1") or {}
    return char.get("companions") or []


def map_tokens(page, camp=fx.PLAYER_CAMP, mid=fx.MAP_ID) -> dict:
    maps = ls_get(page, f"dnd_maps_{camp}") or []
    m = next((m for m in maps if m["id"] == mid), None)
    return (m or {}).get("tokens") or {}


def cards(page):
    return page.locator("#companions-list > div")


def card_text(page, idx: int = 0) -> str:
    return cards(page).nth(idx).inner_text()


def open_add_modal(page):
    page.click("#btn-add-companion")
    page.wait_for_selector(f"{MODAL}:not(.hidden)", timeout=3000)


def fill_companion(page, *, name=None, type_=None, size=None, hp=None, ac=None, speed=None, notes=None):
    if name is not None:
        page.fill("#comp-form-name", name)
    if type_ is not None:
        page.select_option("#comp-form-type", type_)
    if size is not None:
        page.select_option("#comp-form-size", str(size))
    if hp is not None:
        page.fill("#comp-form-hp-max", str(hp))
    if ac is not None:
        page.fill("#comp-form-ac", str(ac))
    if speed is not None:
        page.fill("#comp-form-speed", str(speed))
    if notes is not None:
        page.fill("#comp-form-notes", notes)


def save_modal(page):
    page.click(f"{MODAL} button[type=submit]")
    wait_hidden(page, MODAL)


def add_companion(page, **kw):
    open_add_modal(page)
    fill_companion(page, **kw)
    save_modal(page)


def fresh(page, *, with_map=True, companions=None):
    overrides = {"companions": companions} if companions is not None else None
    fx.seed_player(page, with_map=with_map, char_overrides=overrides)
    fx.open_player_sheet(page)
    page.wait_for_selector(PANEL, timeout=5000)


with Suite("Compañeros") as s:
    ctx = s.new_context()
    page, dialogs = s.new_page(ctx)

    # ------------------------------------------------------------------ felices
    @s.case("El panel renderiza tarjetas cuando ya hay compañeros guardados (sin errores JS)")
    def _():
        fresh(page, companions=[{"id": "comp-0", "name": "Centinela", "type": "summon", "size": 1, "hp": {"current": 5, "max": 5}}])
        page.wait_for_selector("#companions-list .comp-edit-btn", timeout=3000)
        expect("Centinela" in card_text(page), "No se renderizó la tarjeta del compañero existente")

    @s.case("Estado vacío: contador 0 y mensaje de ayuda con botón de invocar")
    def _():
        fresh(page)
        expect_eq(page.inner_text("#companions-count").strip(), "0", "Contador inicial")
        expect("No tienes compañeros" in page.inner_text("#companions-list"), "Falta el mensaje de estado vacío")
        expect(page.is_visible("#btn-empty-summon-familiar"), "Falta el botón de invocar en estado vacío")

    @s.case("Añadir compañero: la tarjeta muestra nombre, tipo, tamaño, PG, CA, velocidad y notas; contador 1")
    def _():
        fresh(page)
        add_companion(page, name="Archimedes", type_="familiar", size=1, hp=7, ac=13, speed=10, notes="Vuelo 60 ft")
        page.wait_for_function("document.getElementById('companions-count').textContent.trim() === '1'", timeout=3000)
        t = card_text(page)
        for frag in ("Archimedes", "Familiar", "Mediano (1x1)", "7", "CA: 13", "Vel: 10 ft", "Vuelo 60 ft"):
            expect(frag in t, f"La tarjeta no muestra {frag!r}. Texto: {t!r}")
        comps = companions_in_storage(page)
        expect_eq(len(comps), 1, "Compañeros persistidos")
        c = comps[0]
        expect_eq((c["name"], c["type"], c["size"], c["hp"], c.get("armorClass"), c.get("speedFt")),
                  ("Archimedes", "familiar", 1, {"current": 7, "max": 7}, 13, 10), "Datos persistidos")

    @s.case("Persistencia: el compañero sigue tras recargar la página")
    def _():
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#companions-list > div", timeout=8000)
        expect("Archimedes" in card_text(page), "El compañero desapareció tras recargar")
        expect_eq(page.inner_text("#companions-count").strip(), "1", "Contador tras recargar")

    @s.case("Editar: cambiar nombre, tipo, tamaño y CA se refleja en la tarjeta y en el almacenamiento")
    def _():
        page.click("#companions-list .comp-edit-btn")
        page.wait_for_selector(f"{MODAL}:not(.hidden)")
        expect_eq(page.inner_text("#companion-modal-title").strip(), "Editar Archimedes", "Título del modal de edición")
        expect_eq(page.input_value("#comp-form-name"), "Archimedes", "El modal debe precargar el nombre")
        expect_eq(page.input_value("#comp-form-ac"), "13", "El modal debe precargar la CA")
        expect(page.is_visible("#comp-form-delete-btn"), "En edición debe verse el botón Eliminar")
        fill_companion(page, name="Archimedes el Sabio", type_="mount", size=2, ac=15)
        save_modal(page)
        page.wait_for_function("document.querySelector('#companions-list').innerText.includes('Archimedes el Sabio')", timeout=3000)
        t = card_text(page)
        expect("Montura" in t and "Grande (2x2)" in t and "CA: 15" in t, f"La tarjeta no refleja la edición: {t!r}")
        c = companions_in_storage(page)[0]
        expect_eq((c["name"], c["type"], c["size"], c["armorClass"]), ("Archimedes el Sabio", "mount", 2, 15), "Edición persistida")
        expect_eq(len(companions_in_storage(page)), 1, "Editar no debe duplicar el compañero")

    @s.case("PG: dañar y curar con el prompt actualiza número y barra, con topes en 0 y en el máximo")
    def _():
        fresh(page, companions=[{"id": "comp-a", "name": "Lobo", "type": "companion", "size": 1, "hp": {"current": 10, "max": 10}}])
        dialogs.answer("4")
        page.click(".comp-hp-sub-btn")
        page.wait_for_function("document.querySelector('#companions-list').innerText.includes('6')", timeout=3000)
        expect_eq(companions_in_storage(page)[0]["hp"], {"current": 6, "max": 10}, "Daño 10-4")
        width = page.eval_on_selector("#companions-list .h-full", "e => e.style.width")
        expect_eq(width, "60%", "Ancho de la barra de PG")
        dialogs.answer("2")
        page.click(".comp-hp-add-btn")
        page.wait_for_timeout(150)
        expect_eq(companions_in_storage(page)[0]["hp"]["current"], 8, "Curación 6+2")
        dialogs.answer("50")
        page.click(".comp-hp-add-btn")
        page.wait_for_timeout(150)
        expect_eq(companions_in_storage(page)[0]["hp"]["current"], 10, "La curación no debe superar el máximo")
        dialogs.answer("999")
        page.click(".comp-hp-sub-btn")
        page.wait_for_timeout(150)
        expect_eq(companions_in_storage(page)[0]["hp"]["current"], 0, "El daño no debe bajar de 0")

    @s.case("Invocar Familiar (ritual) con mapa activo: crea el familiar y su token en el mapa")
    def _():
        fresh(page)
        page.click("#btn-quick-summon-familiar")
        d = app_dialog(page)
        expect("Encontrar Familiar" in d["title"], f"Título del ritual inesperado: {d}")
        app_dialog_fill(page, "animal", "Cuervo")
        app_dialog_fill(page, "customName", "Hugin")
        app_dialog_primary(page)
        d2 = app_dialog(page)
        expect("Hugin" in d2["message"] and "mapa" in d2["message"], f"Mensaje de éxito inesperado: {d2}")
        app_dialog_primary(page)
        comps = companions_in_storage(page)
        expect_eq(len(comps), 1, "Familiares creados")
        c = comps[0]
        expect_eq((c["name"], c["type"], c["hp"]), ("Hugin", "familiar", {"current": 3, "max": 3}), "Familiar del ritual")
        expect("Cuervo" in (c.get("notes") or ""), "Las notas deben mencionar la forma elegida")
        expect(bool(c.get("tokenId")), "El familiar debe quedar vinculado a un token")
        tok = map_tokens(page).get(c["tokenId"])
        expect(tok is not None, "El token no existe en el mapa activo")
        expect_eq((tok["name"], tok["companionId"], tok["characterId"], tok["kind"]),
                  ("Hugin (Lyra Brasaviva)", c["id"], fx.PLAYER_CHAR, "companion"), "Datos del token")
        t = card_text(page)
        expect("En mapa táctico" in t and "Retirar" in t and "Centrar" in t, f"La tarjeta no indica despliegue: {t!r}")

    @s.case("Invocar Familiar sin nombre usa la forma elegida como nombre")
    def _():
        fresh(page)
        page.click("#btn-quick-summon-familiar")
        app_dialog(page)
        app_dialog_fill(page, "animal", "Gato")
        app_dialog_primary(page)
        app_dialog_primary(page)
        expect_eq(companions_in_storage(page)[0]["name"], "Gato", "Nombre por defecto")

    @s.case("Desplegar en mapa un compañero existente y luego retirarlo elimina su token")
    def _():
        fresh(page, companions=[{"id": "comp-b", "name": "Brisa", "type": "mount", "size": 2, "hp": {"current": 13, "max": 13}}])
        page.click(".comp-map-btn")
        app_dialog(page)
        app_dialog_primary(page)
        c = companions_in_storage(page)[0]
        tid = c.get("tokenId")
        expect(bool(tid) and tid in map_tokens(page), "El token de la montura no se creó")
        tok = map_tokens(page)[tid]
        expect_eq((tok["size"], tok["kind"]), (2, "mount"), "Tamaño/tipo del token de montura")
        page.click(".comp-dismiss-btn")
        d = app_dialog(page)
        expect("Brisa" in d["message"], f"Confirmación de retiro inesperada: {d}")
        app_dialog_click(page, "Retirar")
        app_dialog(page)
        app_dialog_primary(page)
        expect(tid not in map_tokens(page), "El token sigue en el mapa tras retirar")
        expect("tokenId" not in companions_in_storage(page)[0], "El compañero sigue vinculado a un token retirado")
        expect("Fuera del mapa" in card_text(page), "La tarjeta debería indicar 'Fuera del mapa'")

    @s.case("Editar un familiar desplegado actualiza el nombre y tamaño de su token en el mapa")
    def _():
        fresh(page)
        page.click("#btn-quick-summon-familiar")
        app_dialog(page)
        app_dialog_fill(page, "customName", "Salem")
        app_dialog_primary(page)
        app_dialog_primary(page)
        page.click("#companions-list .comp-edit-btn")
        page.wait_for_selector(f"{MODAL}:not(.hidden)")
        fill_companion(page, name="Salem II", size=2)
        save_modal(page)
        c = companions_in_storage(page)[0]
        tok = map_tokens(page).get(c.get("tokenId"), {})
        expect_eq(tok.get("name"), "Salem II (Lyra Brasaviva)", "Nombre del token tras editar el familiar")
        expect_eq(tok.get("size"), 2, "Tamaño del token tras editar el familiar")

    @s.case("Eliminar un familiar desplegado también retira su token del mapa")
    def _():
        fresh(page)
        page.click("#btn-quick-summon-familiar")
        app_dialog(page)
        app_dialog_primary(page)
        app_dialog_primary(page)
        tid = companions_in_storage(page)[0]["tokenId"]
        page.click("#companions-list .comp-edit-btn")
        page.wait_for_selector(f"{MODAL}:not(.hidden)")
        page.click("#comp-form-delete-btn")  # confirm() nativo → aceptado por DialogQueue
        page.wait_for_timeout(200)
        expect_eq(companions_in_storage(page), [], "El familiar debería eliminarse")
        expect(tid not in map_tokens(page), "El token del familiar eliminado sigue en el mapa (huérfano)")

    @s.case("Eliminar compañero (no desplegado) con confirmación lo quita y vuelve el estado vacío")
    def _():
        fresh(page, companions=[{"id": "comp-c", "name": "Pip", "type": "familiar", "size": 1, "hp": {"current": 2, "max": 2}}])
        page.click("#companions-list .comp-edit-btn")
        page.wait_for_selector(f"{MODAL}:not(.hidden)")
        page.click("#comp-form-delete-btn")
        wait_hidden(page, MODAL)
        expect_eq(companions_in_storage(page), [], "Compañeros tras eliminar")
        expect_eq(page.inner_text("#companions-count").strip(), "0", "Contador tras eliminar")
        expect("No tienes compañeros" in page.inner_text("#companions-list"), "No volvió el estado vacío")

    # ------------------------------------------------------------------ tristes
    @s.case("Triste: cancelar el modal de alta no crea nada")
    def _():
        fresh(page)
        open_add_modal(page)
        fill_companion(page, name="Fantasma")
        page.click("#comp-form-cancel-btn")
        wait_hidden(page, MODAL)
        expect_eq(companions_in_storage(page), [], "Cancelar no debe crear compañeros")
        open_add_modal(page)
        expect_eq(page.input_value("#comp-form-name"), "", "Reabrir el modal debe limpiar el formulario")
        page.click("#companion-modal-close")
        wait_hidden(page, MODAL)

    @s.case("Triste: nombre vacío bloquea el guardado (campo requerido)")
    def _():
        fresh(page)
        open_add_modal(page)
        fill_companion(page, name="")
        page.click(f"{MODAL} button[type=submit]")
        page.wait_for_timeout(200)
        expect(page.is_visible(MODAL), "El modal se cerró con el nombre vacío")
        expect_eq(companions_in_storage(page), [], "Se creó un compañero sin nombre")
        page.click("#comp-form-cancel-btn")

    @s.case("Triste: PG máximos 0 o negativos no se guardan como inválidos")
    def _():
        fresh(page)
        open_add_modal(page)
        fill_companion(page, name="Sombra", hp=-5)
        page.click(f"{MODAL} button[type=submit]")
        page.wait_for_timeout(200)
        comps = companions_in_storage(page)
        if comps:
            expect(comps[0]["hp"]["max"] >= 1, f"PG máximos inválidos guardados: {comps[0]['hp']}")
        else:
            expect(page.is_visible(MODAL), "Ni guardó ni mantuvo el modal abierto")
            page.click("#comp-form-cancel-btn")

    @s.case("Triste: cancelar el prompt o escribir texto/negativos no cambia los PG")
    def _():
        fresh(page, companions=[{"id": "comp-d", "name": "Rata", "type": "familiar", "size": 1, "hp": {"current": 4, "max": 4}}])
        for answer in (None, "abc", "-3", "0", ""):
            if answer is None:
                dialogs.dismiss_next()
            else:
                dialogs.answer(answer)
            page.click(".comp-hp-sub-btn")
            page.wait_for_timeout(120)
            expect_eq(companions_in_storage(page)[0]["hp"]["current"], 4, f"PG tras respuesta {answer!r}")

    @s.case("Triste: editar solo el nombre de un compañero herido NO lo cura")
    def _():
        fresh(page, companions=[{"id": "comp-e", "name": "Lobo", "type": "companion", "size": 1, "hp": {"current": 3, "max": 11}}])
        page.click("#companions-list .comp-edit-btn")
        page.wait_for_selector(f"{MODAL}:not(.hidden)")
        fill_companion(page, name="Lobo Gris")
        save_modal(page)
        c = companions_in_storage(page)[0]
        expect_eq(c["name"], "Lobo Gris", "Nombre editado")
        expect_eq(c["hp"], {"current": 3, "max": 11}, "Renombrar no debería restaurar los PG")

    @s.case("Triste: desplegar sin mapa activo muestra aviso y no vincula token")
    def _():
        fresh(page, with_map=False, companions=[{"id": "comp-f", "name": "Ruffo", "type": "companion", "size": 1, "hp": {"current": 5, "max": 5}}])
        page.click(".comp-map-btn")
        d = app_dialog(page)
        expect_eq(d["title"], "Sin Mapa Activo", "Título del aviso")
        app_dialog_primary(page)
        expect("tokenId" not in companions_in_storage(page)[0], "Se vinculó un token sin mapa activo")
        expect("Fuera del mapa" in card_text(page), "La tarjeta debería seguir 'Fuera del mapa'")

    @s.case("Triste: invocar familiar sin mapa activo lo crea sin token y avisa")
    def _():
        fresh(page, with_map=False)
        page.click("#btn-quick-summon-familiar")
        app_dialog(page)
        app_dialog_primary(page)
        d = app_dialog(page)
        expect("cuando el DM active un mapa" in d["message"] or "listo para desplegar" in d["message"], f"Aviso inesperado: {d}")
        app_dialog_primary(page)
        c = companions_in_storage(page)[0]
        expect("tokenId" not in c, "No debería haber token sin mapa")

    @s.case("Triste: cancelar el ritual (Esc) no crea ningún familiar")
    def _():
        fresh(page)
        page.click("#btn-quick-summon-familiar")
        app_dialog(page)
        page.keyboard.press("Escape")
        page.wait_for_timeout(300)
        expect_eq(companions_in_storage(page), [], "Esc en el ritual no debe crear familiar")

    @s.case("Triste: cancelar 'Retirar' mantiene el token en el mapa")
    def _():
        fresh(page)
        page.click("#btn-quick-summon-familiar")
        app_dialog(page)
        app_dialog_primary(page)
        app_dialog_primary(page)
        tid = companions_in_storage(page)[0]["tokenId"]
        page.click(".comp-dismiss-btn")
        app_dialog(page)
        app_dialog_click(page, "Cancelar")
        expect(tid in map_tokens(page), "El token se retiró pese a cancelar")
        expect_eq(companions_in_storage(page)[0].get("tokenId"), tid, "El vínculo se perdió pese a cancelar")

    @s.case("Seguridad: un nombre con HTML se muestra como texto y no ejecuta código")
    def _():
        fresh(page)
        page.evaluate("window.__xss = 0")
        add_companion(page, name='<img src=x onerror="window.__xss=1">Mal', notes='<b id="inj">negrita</b>')
        page.wait_for_timeout(300)
        expect_eq(page.evaluate("window.__xss"), 0, "Se ejecutó JS inyectado desde el nombre del compañero")
        expect(page.locator("#companions-list #inj").count() == 0, "Las notas se renderizaron como HTML")
        expect("<img" in card_text(page), "El nombre debería verse literalmente")
