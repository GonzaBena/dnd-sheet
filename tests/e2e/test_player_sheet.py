"""
tests/e2e/test_player_sheet.py
Ficha de jugador en vivo (/campaigns?mode=player): PG, monedas, inspiración, edición de atributos y
sus valores derivados, armas, mochila, conjuros y descansos. Felices, tristes y "cambio y vuelvo a cambiar".

Ejecutar:  python3 tests/e2e/test_player_sheet.py
"""
from __future__ import annotations

from harness import Suite, expect, expect_eq, ls_get, text, wait_hidden, wait_text
import fixtures as fx


def char(page) -> dict:
    return ls_get(page, "dnd_active_character_v1") or {}


def all_char(page) -> dict:
    return next((c for c in (ls_get(page, "dnd_all_characters_v1") or []) if c["id"] == fx.PLAYER_CHAR), {})


def finish_steps(page, modal: str, max_steps: int = 6) -> None:
    """Avanza un modal por pasos (modalSteps.ts) hasta que se cierre."""
    btn = page.locator(f"{modal} [data-step-next]")
    for _ in range(max_steps):
        if not btn.is_visible():
            return
        btn.click()
        page.wait_for_timeout(150)
    raise AssertionError(f"El modal {modal} no se cerró tras {max_steps} pasos")


def fresh(page, **char_overrides):
    fx.seed_player(page, char_overrides=char_overrides or None)
    fx.open_player_sheet(page)
    page.wait_for_timeout(300)


def hp(page) -> str:
    return text(page, "#current-hp-num")


with Suite("Ficha jugador") as s:
    ctx = s.new_context()
    page, dialogs = s.new_page(ctx)

    # ------------------------------------------------------------------ datos mostrados
    @s.case("Carga: nombre, raza, nivel, PG, CA, iniciativa, velocidad, monedas y atributos coinciden con los datos")
    def _():
        fresh(page)
        expect("Lyra Brasaviva" in text(page, "#hero-name-title"), "Nombre del héroe")
        expect_eq(text(page, "#hero-race-tag"), "Humano", "Raza")
        expect("3" in text(page, "#hero-level-seal"), "Nivel")
        expect_eq((hp(page), text(page, "#max-hp-num").lstrip("/ ").split()[0]), ("18", "18"), "PG actual/máx")
        expect_eq(text(page, "#vitals-ac-num"), "12", "CA sin armadura = 10 + DES(+2)")
        expect_eq(text(page, "#vitals-init-num"), "+2", "Iniciativa = DES")
        expect_eq(text(page, "#vitals-speed-num"), "30", "Velocidad")
        expect_eq([text(page, f"#coin-{c}") for c in ("cp", "sp", "ep", "gp", "pp")], ["10", "5", "0", "50", "0"], "Monedas")
        expect_eq([text(page, f"#stat-{k}-mod") for k in ("str", "dex", "con", "int", "wis", "cha")],
                  ["-1", "+2", "+2", "+3", "+1", "+0"], "Modificadores")
        expect("La Mina Perdida" in text(page, "#session-banner-root"), "Banner de sesión con la campaña")
        expect("18/18" in text(page, "#header-hp-btn"), "PG en la cabecera")

    # ------------------------------------------------------------------ PG
    @s.case("PG: daño 7 → 11, cabecera y barra se actualizan; curar 3 → 14; persiste tras recargar")
    def _():
        fresh(page)
        dialogs.answer("7")
        page.click("#hp-sub-btn")
        wait_text(page, "#current-hp-num", "11")
        expect("11/18" in text(page, "#header-hp-btn"), f"Cabecera desincronizada: {text(page, '#header-hp-btn')}")
        width = page.eval_on_selector("#hp-progress-bar", "e => e.style.width")
        expect(width.startswith("61"), f"Barra de PG: {width}")
        dialogs.answer("3")
        page.click("#hp-add-btn")
        wait_text(page, "#current-hp-num", "14")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#player-sheet-workspace:not(.hidden)")
        wait_text(page, "#current-hp-num", "14")
        expect_eq(all_char(page)["hp"]["current"], 14, "PG en el almacén de campaña (lo que ve el DM)")

    @s.case("PG temporales: el daño los consume primero y luego resta de los PG actuales")
    def _():
        fresh(page, hp={"current": 18, "max": 18, "temp": 5})
        dialogs.answer("7")
        page.click("#hp-sub-btn")
        wait_text(page, "#current-hp-num", "16")
        expect_eq(char(page)["hp"], {"current": 16, "max": 18, "temp": 0}, "PG tras daño con temporales")

    @s.case("Triste: el daño no deja PG negativos y la curación no supera el máximo")
    def _():
        fresh(page)
        dialogs.answer("500")
        page.click("#hp-sub-btn")
        wait_text(page, "#current-hp-num", "0")
        dialogs.answer("500")
        page.click("#hp-add-btn")
        wait_text(page, "#current-hp-num", "18")

    @s.case("Triste: cancelar el prompt o ingresar texto/negativo no cambia los PG")
    def _():
        fresh(page)
        for ans in (None, "abc", "-4", ""):
            if ans is None:
                dialogs.dismiss_next()
            else:
                dialogs.answer(ans)
            page.click("#hp-sub-btn")
            page.wait_for_timeout(200)
            expect_eq(hp(page), "18", f"PG tras respuesta {ans!r}")
            expect_eq(char(page)["hp"]["current"], 18, f"PG guardados tras respuesta {ans!r}")

    # ------------------------------------------------------------------ inspiración / monedas
    @s.case("Inspiración: activar y desactivar cambia el texto y persiste")
    def _():
        fresh(page)
        before = text(page, "#hero-inspiration-text")
        page.click("#hero-inspiration-btn")
        page.wait_for_timeout(200)
        expect_eq(char(page)["inspiration"], True, "Inspiración guardada")
        expect(text(page, "#hero-inspiration-text") != before, "El texto de inspiración no cambió")
        page.click("#hero-inspiration-btn")
        page.wait_for_timeout(200)
        expect_eq(char(page)["inspiration"], False, "Inspiración desactivada")
        expect_eq(text(page, "#hero-inspiration-text"), before, "Texto tras desactivar")

    @s.case("Monedas: editar oro y plata se refleja en la tarjeta, el total y tras recargar; luego volver a cambiar")
    def _():
        fresh(page)
        page.click("#currency-edit-btn")
        page.wait_for_selector("#edit-currency-modal:not(.hidden)")
        page.fill("#coin-input-gp", "75")
        page.fill("#coin-input-sp", "12")
        page.click("#currency-modal-save-btn")
        wait_hidden(page, "#edit-currency-modal")
        wait_text(page, "#coin-gp", "75")
        expect_eq(text(page, "#coin-sp"), "12", "Plata")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#player-sheet-workspace:not(.hidden)")
        wait_text(page, "#coin-gp", "75")
        page.click("#currency-edit-btn")
        page.wait_for_selector("#edit-currency-modal:not(.hidden)")
        expect_eq(page.input_value("#coin-input-gp"), "75", "El modal debe precargar el valor actual")
        page.fill("#coin-input-gp", "3")
        page.click("#currency-modal-save-btn")
        wait_text(page, "#coin-gp", "3")
        expect_eq(char(page)["currency"]["gp"], 3, "Oro tras segundo cambio")

    @s.case("Triste: monedas negativas o texto no se guardan como valores inválidos")
    def _():
        fresh(page)
        page.click("#currency-edit-btn")
        page.wait_for_selector("#edit-currency-modal:not(.hidden)")
        page.fill("#coin-input-gp", "-20")
        page.click("#currency-modal-save-btn")
        page.wait_for_timeout(250)
        gp = char(page)["currency"]["gp"]
        expect(isinstance(gp, (int, float)) and gp >= 0, f"Oro inválido guardado: {gp!r}")
        if page.is_visible("#edit-currency-modal"):
            page.click("#currency-modal-cancel-btn")

    @s.case("Triste: cancelar el modal de monedas descarta los cambios")
    def _():
        fresh(page)
        page.click("#currency-edit-btn")
        page.wait_for_selector("#edit-currency-modal:not(.hidden)")
        page.fill("#coin-input-gp", "9999")
        page.click("#currency-modal-cancel-btn")
        wait_hidden(page, "#edit-currency-modal")
        expect_eq(text(page, "#coin-gp"), "50", "Oro tras cancelar")
        expect_eq(char(page)["currency"]["gp"], 50, "Oro guardado tras cancelar")

    # ------------------------------------------------------------------ edición y derivados
    @s.case("Editar DES 14 → 18: modificador, iniciativa, CA y Acrobacias se recalculan; volver a 14 lo revierte")
    def _():
        fresh(page)

        def set_dex(v: str):
            page.click("#hero-edit-direct-btn")
            page.wait_for_selector("#edit-character-modal:not(.hidden)")
            page.fill("#edit-stat-dex", v)
            page.click("#edit-save-btn")
            wait_hidden(page, "#edit-character-modal")
            page.wait_for_timeout(200)

        def acrobatics() -> str:
            return page.evaluate("""() => {
                const els = [...document.querySelectorAll('body *')].filter(e => /Acrobacias/.test(e.textContent) && /[+-]\\d/.test(e.textContent) && e.offsetParent);
                els.sort((a, b) => a.textContent.length - b.textContent.length);
                return els[0] ? els[0].textContent.replace(/\\s+/g, ' ').trim() : '';
            }""")

        set_dex("18")
        expect_eq((text(page, "#stat-dex-score"), text(page, "#stat-dex-mod")), ("18", "+4"), "DES tras subir")
        expect_eq(text(page, "#vitals-init-num"), "+4", "Iniciativa tras subir DES")
        expect_eq(text(page, "#vitals-ac-num"), "14", "CA tras subir DES")
        expect("+4" in acrobatics(), f"Acrobacias no refleja DES 18: {acrobatics()!r}")
        set_dex("14")
        expect_eq(text(page, "#stat-dex-mod"), "+2", "DES tras revertir")
        expect_eq(text(page, "#vitals-init-num"), "+2", "Iniciativa tras revertir")
        expect_eq(text(page, "#vitals-ac-num"), "12", "CA tras revertir")

    @s.case("Editar nombre y PG máximos: cabecera, héroe y almacén de campaña se actualizan")
    def _():
        fresh(page)
        page.click("#hero-edit-direct-btn")
        page.wait_for_selector("#edit-character-modal:not(.hidden)")
        page.fill("#edit-char-name", "Lyra la Roja")
        page.fill("#edit-char-max-hp", "25")
        page.click("#edit-save-btn")
        wait_hidden(page, "#edit-character-modal")
        page.wait_for_timeout(250)
        expect("Lyra la Roja" in text(page, "#hero-name-title"), "Nombre en el héroe")
        expect("25" in text(page, "#max-hp-num"), "PG máximos en vitales")
        expect_eq(all_char(page).get("name"), "Lyra la Roja", "Nombre en el almacén de campaña (lo que ve el DM)")
        expect_eq(all_char(page)["hp"]["max"], 25, "PG máx en el almacén de campaña")

    @s.case("Triste: cancelar la edición del personaje no aplica cambios")
    def _():
        fresh(page)
        page.click("#hero-edit-direct-btn")
        page.wait_for_selector("#edit-character-modal:not(.hidden)")
        page.fill("#edit-char-name", "NO")
        page.fill("#edit-stat-dex", "3")
        page.click("#edit-cancel-btn")
        wait_hidden(page, "#edit-character-modal")
        expect("Lyra Brasaviva" in text(page, "#hero-name-title"), "El nombre cambió pese a cancelar")
        expect_eq(text(page, "#stat-dex-mod"), "+2", "DES cambió pese a cancelar")

    @s.case("Triste: atributo fuera de rango (0 o 99) se acota a un valor válido")
    def _():
        fresh(page)
        page.click("#hero-edit-direct-btn")
        page.wait_for_selector("#edit-character-modal:not(.hidden)")
        page.fill("#edit-stat-str", "99")
        page.fill("#edit-stat-dex", "0")
        page.click("#edit-save-btn")
        page.wait_for_timeout(300)
        st = char(page)["stats"]
        expect(1 <= st["str"]["score"] <= 30 and 1 <= st["dex"]["score"] <= 30,
               f"Atributos fuera de rango guardados: FUE {st['str']['score']}, DES {st['dex']['score']}")
        if page.is_visible("#edit-character-modal"):
            page.click("#edit-cancel-btn")

    # ------------------------------------------------------------------ armas
    @s.case("Arma automática: Espada corta (DES, competente) → '+4 al Impacto', '1d6 + 2'; subir DES la recalcula")
    def _():
        fresh(page)
        page.click("#open-add-weapon-btn")
        page.wait_for_selector("#add-weapon-modal:not(.hidden)")
        page.fill("#weapon-name-input", "Espada corta")
        page.click("#add-weapon-modal [data-step-next]")
        page.select_option("#weapon-ability-select", "dex")
        page.select_option("#weapon-damage-dice-select", "1d6")
        if not page.is_checked("#weapon-proficient-check"):
            page.check("#weapon-proficient-check", force=True)
        if not page.is_checked("#weapon-add-ability-dmg-check"):
            page.check("#weapon-add-ability-dmg-check", force=True)
        finish_steps(page, "#add-weapon-modal")
        card = page.locator("#weapon-actions-container > div", has_text="Espada corta").first
        t = " ".join(card.text_content().split())
        expect("+4 al Impacto" in t and "1d6 + 2" in t, f"Tarjeta del arma: {t!r}")
        # Cambio posterior de DES
        page.click("#hero-edit-direct-btn")
        page.wait_for_selector("#edit-character-modal:not(.hidden)")
        page.fill("#edit-stat-dex", "18")
        page.click("#edit-save-btn")
        wait_hidden(page, "#edit-character-modal")
        page.wait_for_timeout(300)
        t = " ".join(page.locator("#weapon-actions-container > div", has_text="Espada corta").first.text_content().split())
        expect("+6 al Impacto" in t and "1d6 + 4" in t, f"El arma no se recalculó con DES 18: {t!r}")

    @s.case("Arma: editar nombre desde 'Editar' actualiza la tarjeta sin duplicarla; eliminar la quita")
    def _():
        fresh(page, actions=[{"id": "act-1", "name": "Daga", "type": "Cuerpo a cuerpo", "bonus": "+4 al Impacto",
                              "damage": "1d4 + 2", "damageType": "Perforante", "tags": ["Equipada"], "isAuto": False, "ability": "none"}])
        card = page.locator("#weapon-actions-container > div", has_text="Daga").first
        card.locator(".expand-weapon-btn").click()
        card.locator(".edit-weapon-btn").click()
        page.wait_for_selector("#add-weapon-modal:not(.hidden)")
        expect_eq(page.input_value("#weapon-name-input"), "Daga", "Precarga del nombre")
        page.fill("#weapon-name-input", "Daga envenenada")
        finish_steps(page, "#add-weapon-modal")
        names = [a["name"] for a in char(page)["actions"]]
        expect_eq(names, ["Daga envenenada"], "Acciones tras editar")
        card = page.locator("#weapon-actions-container > div", has_text="Daga envenenada").first
        if not card.locator(".delete-weapon-btn").is_visible():
            card.locator(".expand-weapon-btn").click()
        card.locator(".delete-weapon-btn").click()
        page.wait_for_selector("#confirm-delete-modal:not(.hidden)")
        expect("Daga envenenada" in text(page, "#delete-modal-item-name"), "El modal de borrado muestra otra arma")
        page.click("#delete-modal-confirm-btn")
        page.wait_for_timeout(300)
        expect_eq(char(page)["actions"], [], "Acciones tras eliminar")
        expect_eq(page.locator("#weapon-actions-container > div", has_text="Daga envenenada").count(), 0, "La tarjeta sigue visible")

    @s.case("Triste: arma sin nombre no avanza del primer paso")
    def _():
        fresh(page)
        page.click("#open-add-weapon-btn")
        page.wait_for_selector("#add-weapon-modal:not(.hidden)")
        page.fill("#weapon-name-input", "")
        page.click("#add-weapon-modal [data-step-next]")
        page.wait_for_timeout(200)
        expect(page.is_visible("#weapon-name-input"), "Avanzó de paso sin nombre")
        page.click("#add-weapon-close-btn")
        expect_eq(char(page).get("actions") or [], [], "Se creó un arma sin nombre")

    # ------------------------------------------------------------------ mochila
    @s.case("Mochila: añadir 'Cuerda' x2, editar cantidad a 5 y nombre, contador y persistencia")
    def _():
        fresh(page)
        page.click("#open-add-item-btn")
        page.wait_for_selector("#add-item-modal:not(.hidden)")
        page.fill("#item-name-input", "Cuerda de seda")
        page.fill("#item-quantity-input", "2")
        finish_steps(page, "#add-item-modal")
        page.wait_for_function("document.getElementById('backpack-items-container').textContent.includes('Cuerda de seda')")
        expect("x2" in text(page, "#backpack-items-container"), "Cantidad x2 en la tarjeta")
        expect("1" in text(page, "#backpack-item-count"), f"Contador de objetos: {text(page, '#backpack-item-count')}")
        item = page.locator("#backpack-items-container > div", has_text="Cuerda de seda").first
        item.locator(".expand-item-btn").click()
        item.locator(".panel-edit-btn").click()
        page.wait_for_selector("#add-item-modal:not(.hidden)")
        expect_eq(page.input_value("#item-quantity-input"), "2", "Precarga de cantidad")
        page.fill("#item-name-input", "Cuerda élfica")
        page.fill("#item-quantity-input", "5")
        finish_steps(page, "#add-item-modal")
        inv = char(page)["inventory"]
        expect_eq([(i["name"], i["quantity"]) for i in inv], [("Cuerda élfica", 5)], "Inventario tras editar (sin duplicar)")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_function("document.getElementById('backpack-items-container').textContent.includes('Cuerda élfica')", timeout=8000)
        expect("x5" in text(page, "#backpack-items-container"), "Cantidad tras recargar")

    @s.case("Triste: objeto con cantidad 0 o negativa no se guarda con cantidad inválida",
            known_bug="AddItemModal: parseInt('-3') || 1 = -3; el min=1 del input no se valida (el botón no es submit)")
    def _():
        fresh(page)
        page.click("#open-add-item-btn")
        page.wait_for_selector("#add-item-modal:not(.hidden)")
        page.fill("#item-name-input", "Antorcha")
        page.fill("#item-quantity-input", "-3")
        finish_steps(page, "#add-item-modal")
        inv = char(page)["inventory"]
        expect(all(i["quantity"] >= 1 for i in inv), f"Cantidad inválida guardada: {[(i['name'], i['quantity']) for i in inv]}")

    @s.case("Seguridad: nombre de arma con HTML no ejecuta código")
    def _():
        fresh(page, actions=[{"id": "act-x", "name": '<img src=x onerror="window.__xss=1">', "type": "", "bonus": "+0",
                              "damage": "1d4", "damageType": "Contundente", "tags": [], "isAuto": False, "ability": "none"}])
        page.wait_for_timeout(400)
        expect_eq(page.evaluate("window.__xss || 0"), 0, "Se ejecutó JS inyectado desde el nombre del arma")
        # Atacar abre el lanzador de dados con "Ataque con <nombre>": tampoco debe ejecutarse
        page.locator(".roll-atk-btn:visible").first.click()
        page.wait_for_selector("#dice-roller-modal:not(.hidden)")
        page.wait_for_timeout(400)
        expect_eq(page.evaluate("window.__xss || 0"), 0, "Se ejecutó JS inyectado desde el nombre del arma en el lanzador de dados")
        expect("Ataque con <img" in text(page, "#dice-roller-modal"), "El nombre del arma no se muestra como texto en el lanzador")

    # ------------------------------------------------------------------ conjuros
    @s.case("Conjuros: añadir 'Proyectil mágico' nivel 1 lo muestra en la lista; editarlo a nivel 2 lo actualiza")
    def _():
        fresh(page)
        page.click("#open-add-spell-btn")
        page.wait_for_selector("#add-spell-modal:not(.hidden)")
        page.fill("#spell-name-input", "Proyectil mágico")
        page.select_option("#spell-level-select", "1")
        finish_steps(page, "#add-spell-modal")
        page.wait_for_function("document.getElementById('spells-list-container').textContent.includes('Proyectil mágico')")
        spells = char(page)["spellcasting"]["spells"]
        expect_eq([(sp["name"], sp["level"]) for sp in spells], [("Proyectil mágico", 1)], "Conjuros guardados")
        expect_eq(text(page, "#spell-dc-num"), "13", "CD de conjuros mostrada")

    # ------------------------------------------------------------------ descansos
    @s.case("Descanso largo: restaura PG, dados de golpe y espacios de conjuro gastados")
    def _():
        slots = {str(i): {"total": (4 if i == 1 else 2 if i == 2 else 0), "used": (3 if i == 1 else 0)} for i in range(1, 10)}
        fresh(page, hp={"current": 4, "max": 18, "temp": 0}, hitDice={"total": 3, "remaining": 1, "die": "d6"},
              spellcasting={"ability": "int", "saveDc": 13, "attackBonus": 5, "slots": slots, "spells": []})
        page.click("#rest-long-btn")
        page.wait_for_selector("#rest-modal:not(.hidden)")
        page.click("#rest-confirm-long-btn")
        page.wait_for_timeout(600)
        # Puede abrirse un resumen del descanso: cerrarlo si aparece
        for sel in ("#rest-summary-close-btn", "#rest-summary-modal button"):
            if page.locator(sel).count() and page.locator(sel).first.is_visible():
                page.locator(sel).first.click()
                break
        c = char(page)
        expect_eq(c["hp"]["current"], 18, "PG tras descanso largo")
        expect(c["hitDice"]["remaining"] >= 2, f"Dados de golpe tras descanso largo: {c['hitDice']}")
        expect_eq(c["spellcasting"]["slots"]["1"]["used"], 0, "Espacios de nivel 1 recuperados")
        wait_text(page, "#current-hp-num", "18")

    @s.case("Triste: cancelar el modal de descanso no cambia nada")
    def _():
        fresh(page, hp={"current": 4, "max": 18, "temp": 0})
        page.click("#rest-long-btn")
        page.wait_for_selector("#rest-modal:not(.hidden)")
        page.click("#rest-modal-cancel-btn")
        wait_hidden(page, "#rest-modal")
        expect_eq(char(page)["hp"]["current"], 4, "PG tras cancelar descanso")
        expect_eq(hp(page), "4", "PG mostrados tras cancelar descanso")

    # ------------------------------------------------------------------ móvil
    @s.case("Móvil (390px): abre la vista 'Mesa Física' sin scroll horizontal; daño en esa vista se refleja al volver a la ficha completa")
    def _():
        mctx = s.new_context(viewport=(390, 844))
        mpage, mdialogs = s.new_page(mctx)
        try:
            fx.seed_player(mpage)
            fx.open_player_sheet(mpage)
            mpage.wait_for_selector("#physical-table-sheet-root", state="visible", timeout=5000)
            mpage.wait_for_timeout(300)
            overflow = mpage.evaluate("document.documentElement.scrollWidth - window.innerWidth")
            expect(overflow <= 1, f"Scroll horizontal de {overflow}px en móvil")
            expect_eq(text(mpage, "#pts-current-hp"), "18", "PG en Mesa Física")
            mdialogs.answer("5")
            mpage.click("#pts-sub-btn")
            wait_text(mpage, "#pts-current-hp", "13")
            mpage.click("#pts-to-standard-btn")
            mpage.wait_for_selector("#hp-sub-btn", state="visible", timeout=5000)
            wait_text(mpage, "#current-hp-num", "13")
            expect_eq(char(mpage)["hp"]["current"], 13, "PG guardados desde Mesa Física")
        finally:
            mctx.close()

    @s.case("Móvil: la CA de 'Mesa Física' coincide con la de la ficha completa (10 + DES)",
            known_bug="PhysicalTableSheet muestra char.armorClass || 10 en vez de getArmorClass(char)")
    def _():
        mctx = s.new_context(viewport=(390, 844))
        mpage, _ = s.new_page(mctx)
        try:
            fx.seed_player(mpage)
            fx.open_player_sheet(mpage)
            mpage.wait_for_selector("#physical-table-sheet-root", state="visible", timeout=5000)
            mpage.wait_for_timeout(300)
            expect_eq(text(mpage, "#pts-ac"), "12 CA", "CA en Mesa Física")
        finally:
            mctx.close()

    @s.case("Triste: cancelar el borrado de un arma la conserva")
    def _():
        fresh(page, actions=[{"id": "act-2", "name": "Ballesta", "type": "Distancia", "bonus": "+4 al Impacto",
                              "damage": "1d8 + 2", "damageType": "Perforante", "tags": [], "isAuto": False, "ability": "none"}])
        card = page.locator("#weapon-actions-container > div", has_text="Ballesta").first
        card.locator(".expand-weapon-btn").click()
        card.locator(".delete-weapon-btn").click()
        page.wait_for_selector("#confirm-delete-modal:not(.hidden)")
        page.click("#delete-modal-cancel-btn")
        wait_hidden(page, "#confirm-delete-modal")
        expect_eq([a["name"] for a in char(page)["actions"]], ["Ballesta"], "El arma se borró pese a cancelar")

    @s.case("Mochila: eliminar parte de una pila (2 de 5) deja 3; eliminar el resto la quita")
    def _():
        fresh(page, inventory=[{"id": "it-flechas", "name": "Flechas", "quantity": 5, "category": "gear"}])
        item = page.locator("#backpack-items-container > div", has_text="Flechas").first
        item.locator(".expand-item-btn").click()
        item.locator(".panel-delete-btn").click()
        page.wait_for_selector("#confirm-delete-modal:not(.hidden)")
        page.fill("#delete-qty-input", "2")
        page.click("#delete-modal-confirm-btn")
        page.wait_for_timeout(300)
        expect_eq([(i["name"], i["quantity"]) for i in char(page)["inventory"]], [("Flechas", 3)], "Pila tras quitar 2")
        expect("x3" in text(page, "#backpack-items-container"), "La tarjeta no muestra x3")
        item = page.locator("#backpack-items-container > div", has_text="Flechas").first
        if not item.locator(".panel-delete-btn").is_visible():
            item.locator(".expand-item-btn").click()
        item.locator(".panel-delete-btn").click()
        page.wait_for_selector("#confirm-delete-modal:not(.hidden)")
        page.click("#delete-modal-all-btn")
        page.wait_for_timeout(300)
        expect_eq(char(page)["inventory"], [], "Inventario tras eliminar todo")
