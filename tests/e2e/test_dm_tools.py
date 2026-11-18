"""
tests/e2e/test_dm_tools.py
Herramientas del DM: Grimorio (roster, PG, inspiración, descanso de mesa, bitácora), estado de la
sesión y CombatTracker (inicio, orden de iniciativa, turnos, rondas, PG, quitar y terminar combate).
Incluye sincronización DM ↔ jugador entre dos pestañas del mismo navegador (modo local).

Ejecutar:  python3 tests/e2e/test_dm_tools.py
"""
from __future__ import annotations

from harness import (
    Suite, app_dialog, app_dialog_click, app_dialog_primary,
    expect, expect_eq, ls_get, text, wait_hidden, wait_text,
)
import fixtures as fx


def pc_store(page) -> dict:
    return next((c for c in (ls_get(page, "dnd_all_characters_v1") or []) if c["id"] == fx.DM_PC), {})


def combat(page) -> dict:
    return ls_get(page, f"dnd_combat_{fx.DM_CAMP}") or {}


def camp(page) -> dict:
    return next((c for c in (ls_get(page, "dnd_campaigns_v1") or []) if c["id"] == fx.DM_CAMP), {})


def roster_card(page):
    return page.locator("#grimoire-players-grid > *", has_text="Kaeroc").first


def fresh(page, **kw):
    fx.seed_dm(page, **kw)
    fx.open_dm(page)
    page.wait_for_selector("#grimoire-players-grid .hp-sub-btn", timeout=5000)


def start_combat(page, *, pc_init="15", monster="Orco", m_init="12", m_hp="15", m_ac="13", qty="1", token=False):
    page.click("#dm-start-combat-btn")
    page.wait_for_selector("#dm-start-combat-modal:not(.hidden)")
    page.locator("#dm-modal-players-list .dm-player-init-input").first.fill(pc_init)
    page.fill("#dm-init-monster-name", monster)
    page.fill("#dm-init-monster-init", m_init)
    page.fill("#dm-init-monster-hp", m_hp)
    page.fill("#dm-init-monster-ac", m_ac)
    page.fill("#dm-init-monster-qty", qty)
    if token:
        page.check("#dm-init-monster-add-token")
    else:
        page.uncheck("#dm-init-monster-add-token")
    page.click("#dm-modal-confirm-start-btn")
    wait_hidden(page, "#dm-start-combat-modal")
    page.wait_for_selector("#dm-combatants-container [id^='dm-combatant-']")


def open_dual(s, ctx, page):
    """DM en `page` y el mismo usuario jugando su PJ en otra pestaña (mismo localStorage)."""
    fx.seed_dm(page, pc_overrides={"userId": fx.ME, "playerName": "Gonzo (Tú)"})
    page.evaluate("pc => localStorage.setItem('dnd_active_character_v1', JSON.stringify(pc))", pc_store(page))
    fx.open_dm(page)
    page.wait_for_selector("#grimoire-players-grid .hp-sub-btn")
    player, pdialogs = s.new_page(ctx)
    player.goto(f"{fx.BASE}/campaigns?campaign={fx.DM_CAMP}&character={fx.DM_PC}&mode=player", wait_until="domcontentloaded")
    player.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=10000)
    return player, pdialogs


with Suite("Herramientas DM") as s:
    ctx = s.new_context()
    page, dialogs = s.new_page(ctx)

    # ------------------------------------------------------------------ grimorio
    @s.case("Grimorio: cabecera de sesión y tarjeta del aventurero muestran datos correctos")
    def _():
        fresh(page)
        expect("Descenso al Averno" in text(page, "#grimoire-campaign-title"), "Título de campaña")
        expect("Phandalin" in text(page, "#grimoire-location-text"), "Ubicación")
        card = " ".join(roster_card(page).text_content().split())
        for frag in ("Kaeroc Cuernonegro", "40", "58"):
            expect(frag in card, f"La tarjeta no muestra {frag!r}: {card!r}")

    @s.case("Grimorio: dañar 10 y curar 4 actualiza tarjeta y ficha guardada; persiste tras recargar")
    def _():
        fresh(page)
        dialogs.answer("10")
        roster_card(page).locator(".hp-sub-btn").click()
        page.wait_for_timeout(250)
        expect_eq(pc_store(page)["hp"]["current"], 30, "PG tras daño")
        expect("30" in roster_card(page).text_content(), "La tarjeta no muestra 30")
        dialogs.answer("4")
        roster_card(page).locator(".hp-add-btn").click()
        page.wait_for_timeout(250)
        expect_eq(pc_store(page)["hp"]["current"], 34, "PG tras curar")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#grimoire-players-grid .hp-sub-btn")
        expect("34" in roster_card(page).text_content(), "PG tras recargar")

    @s.case("Triste Grimorio: daño mayor que los PG deja 0 (no negativo); curación excesiva tope en el máximo")
    def _():
        fresh(page)
        dialogs.answer("999")
        roster_card(page).locator(".hp-sub-btn").click()
        page.wait_for_timeout(250)
        expect_eq(pc_store(page)["hp"]["current"], 0, "PG tras daño excesivo")
        dialogs.answer("999")
        roster_card(page).locator(".hp-add-btn").click()
        page.wait_for_timeout(250)
        expect_eq(pc_store(page)["hp"]["current"], 58, "PG tras curación excesiva")

    @s.case("Triste Grimorio: cancelar el prompt o texto inválido no cambia los PG")
    def _():
        fresh(page)
        for ans in (None, "xyz", "-5"):
            if ans is None:
                dialogs.dismiss_next()
            else:
                dialogs.answer(ans)
            roster_card(page).locator(".hp-sub-btn").click()
            page.wait_for_timeout(200)
            expect_eq(pc_store(page)["hp"]["current"], 40, f"PG tras respuesta {ans!r}")

    @s.case("Grimorio: Inspirar alterna la inspiración del PJ y el botón cambia a 'Inspirado'")
    def _():
        fresh(page)
        roster_card(page).locator(".inspire-btn").click()
        page.wait_for_timeout(250)
        expect_eq(pc_store(page)["inspiration"], True, "Inspiración guardada")
        expect("Inspirado" in roster_card(page).locator(".inspire-btn").text_content(), "Texto del botón")
        roster_card(page).locator(".inspire-btn").click()
        page.wait_for_timeout(250)
        expect_eq(pc_store(page)["inspiration"], False, "Inspiración retirada")

    @s.case("Grimorio: Descanso Largo de mesa (confirmado) restaura los PG del PJ")
    def _():
        fresh(page, pc_overrides={"hp": {"current": 5, "max": 58, "temp": 0}})
        page.click("#grimoire-long-rest-btn")
        app_dialog(page)
        app_dialog_click(page, "Aplicar")
        page.wait_for_timeout(400)
        while page.locator("#app-dialog:not(.hidden) .app-dialog-card").count():
            app_dialog_primary(page)
        expect_eq(pc_store(page)["hp"]["current"], 58, "PG tras descanso largo de mesa")

    @s.case("Triste Grimorio: cancelar el Descanso Largo de mesa no cambia los PG")
    def _():
        fresh(page, pc_overrides={"hp": {"current": 5, "max": 58, "temp": 0}})
        page.click("#grimoire-long-rest-btn")
        app_dialog(page)
        app_dialog_click(page, "Cancelar")
        expect_eq(pc_store(page)["hp"]["current"], 5, "PG tras cancelar")

    # ------------------------------------------------------------------ bitácora
    @s.case("Bitácora: publicar entrada con etiqueta, filtrarla y eliminarla")
    def _():
        fresh(page)
        page.fill("#grimoire-entry-title", "Emboscada en el puente")
        page.fill("#grimoire-entry-desc", "Tres goblins atacan desde la niebla.")
        page.locator(".grimoire-tag-btn", has_text="#Combate").first.click()
        page.locator("#grimoire-entry-form button[type=submit]").click()
        page.wait_for_function("document.getElementById('grimoire-journal-feed').textContent.includes('Emboscada en el puente')")
        page.click('.grimoire-filter-btn[data-filter="#Botín"]')
        page.wait_for_timeout(200)
        expect("Emboscada en el puente" not in text(page, "#grimoire-journal-feed"), "El filtro #Botín muestra una entrada #Combate")
        page.click('.grimoire-filter-btn[data-filter="#Combate"]')
        page.wait_for_timeout(200)
        expect("Emboscada en el puente" in text(page, "#grimoire-journal-feed"), "El filtro #Combate no muestra la entrada")
        page.click('.grimoire-filter-btn[data-filter="all"]')
        entry = page.locator("#grimoire-journal-feed > *", has_text="Emboscada en el puente").first
        entry.locator(".grimoire-delete-note-btn").click()
        d = app_dialog(page)
        expect("Emboscada en el puente" in d["message"], f"Confirmación de borrado: {d}")
        app_dialog_click(page, "Eliminar")
        page.wait_for_timeout(300)
        expect("Emboscada en el puente" not in text(page, "#grimoire-journal-feed"), "La entrada sigue tras eliminarla")

    @s.case("Triste Bitácora: publicar sin contenido no crea entradas")
    def _():
        fresh(page)
        before = page.locator("#grimoire-journal-feed .grimoire-delete-note-btn").count()
        page.fill("#grimoire-entry-title", "")
        page.fill("#grimoire-entry-desc", "")
        page.locator("#grimoire-entry-form button[type=submit]").click()
        page.wait_for_timeout(300)
        while page.locator("#app-dialog:not(.hidden) .app-dialog-card").count():
            app_dialog_primary(page)
        expect_eq(page.locator("#grimoire-journal-feed .grimoire-delete-note-btn").count(), before, "Entradas tras publicar vacío")

    @s.case("Triste Bitácora: cancelar el borrado conserva la entrada")
    def _():
        fresh(page)
        page.fill("#grimoire-entry-title", "Pista del anillo")
        page.fill("#grimoire-entry-desc", "El anillo lleva el sello del Cuervo.")
        page.locator("#grimoire-entry-form button[type=submit]").click()
        page.wait_for_function("document.getElementById('grimoire-journal-feed').textContent.includes('Pista del anillo')")
        page.locator("#grimoire-journal-feed > *", has_text="Pista del anillo").first.locator(".grimoire-delete-note-btn").click()
        app_dialog(page)
        app_dialog_click(page, "Cancelar")
        expect("Pista del anillo" in text(page, "#grimoire-journal-feed"), "La entrada se borró pese a cancelar")

    @s.case("Seguridad: título y contenido de bitácora con HTML se muestran como texto y no ejecutan código")
    def _():
        fresh(page)
        page.evaluate("window.__xss = 0")
        page.fill("#grimoire-entry-title", '<img src=x onerror="window.__xss=1">Trampa')
        page.fill("#grimoire-entry-desc", '<img src=x onerror="window.__xss=2"> cuidado')
        page.locator("#grimoire-entry-form button[type=submit]").click()
        page.wait_for_function("document.getElementById('grimoire-journal-feed').textContent.includes('Trampa')")
        page.wait_for_timeout(400)
        expect_eq(page.evaluate("window.__xss"), 0, "Se ejecutó JS inyectado desde la bitácora")
        expect('<img src=x onerror="window.__xss=1">Trampa' in text(page, "#grimoire-journal-feed"),
               "El título no se muestra literalmente como texto")

    @s.case("Seguridad: un PJ con HTML en el nombre no ejecuta código en el Grimorio ni en el combate del DM")
    def _():
        evil = '<img src=x onerror="window.__xss=1">Kaeroc'
        fresh(page, pc_overrides={"name": evil})
        start_combat(page)
        page.wait_for_timeout(400)
        expect_eq(page.evaluate("window.__xss || 0"), 0, "Se ejecutó JS inyectado desde el nombre del PJ")
        expect(evil in text(page, "#dm-combatants-container"), "El nombre del PJ no se muestra literalmente en el tracker")

    @s.case("Bitácora: las notas de una campaña no aparecen en el Grimorio de otra campaña del mismo DM",
            known_bug="renderJournalFeed usa journalStore.getEntries() sin filtrar por campaignId (fuga entre campañas en modo local)")
    def _():
        fresh(page)
        other = fx.make_campaign("camp-e2e-otra", name="Otra Campaña", dm_id=fx.ME, members=[fx.ME], char_ids=[])
        page.evaluate("c => { const cs = JSON.parse(localStorage.getItem('dnd_campaigns_v1')); cs.push(c); localStorage.setItem('dnd_campaigns_v1', JSON.stringify(cs)); }", other)
        page.fill("#grimoire-entry-title", "Secreto exclusivo del Averno")
        page.fill("#grimoire-entry-desc", "Solo para esta campaña.")
        page.locator("#grimoire-entry-form button[type=submit]").click()
        page.wait_for_function("document.getElementById('grimoire-journal-feed').textContent.includes('Secreto exclusivo del Averno')")
        page.goto(f"{fx.BASE}/campaigns?campaign=camp-e2e-otra", wait_until="domcontentloaded")
        page.wait_for_selector("#dm-control-workspace:not(.hidden)")
        page.wait_for_timeout(400)
        expect("Otra Campaña" in text(page, "#grimoire-campaign-title"), "No se abrió la otra campaña")
        expect("Secreto exclusivo del Averno" not in text(page, "#grimoire-journal-feed"),
               "La nota de 'Descenso al Averno' aparece en la bitácora de 'Otra Campaña'")

    # ------------------------------------------------------------------ estado de sesión
    @s.case("Sesión: Pausar cambia el estado a 'paused' y Terminar a 'ended' (con confirmación)")
    def _():
        fresh(page)
        page.locator(".status-btn-pause:visible").first.click()
        if page.locator("#app-dialog:not(.hidden) .app-dialog-card").count():
            app_dialog_primary(page)
        page.wait_for_timeout(300)
        expect_eq(camp(page)["status"], "paused", "Estado tras pausar")
        page.locator(".status-btn-end:visible").first.click()
        app_dialog(page)
        app_dialog_primary(page)
        page.wait_for_timeout(300)
        expect_eq(camp(page)["status"], "ended", "Estado tras terminar")
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#dm-control-workspace:not(.hidden)")
        expect_eq(camp(page)["status"], "ended", "Estado persistido")

    @s.case("Triste Sesión: cancelar 'Terminar' mantiene la partida activa")
    def _():
        fresh(page)
        page.locator(".status-btn-end:visible").first.click()
        app_dialog(page)
        app_dialog_click(page, "Cancelar")
        page.wait_for_timeout(200)
        expect_eq(camp(page)["status"], "active", "Estado tras cancelar")

    # ------------------------------------------------------------------ combate
    @s.case("Combate: iniciar con PJ (15) y 2 Orcos (12) ordena por iniciativa, ronda 1 y turno del PJ")
    def _():
        fresh(page)
        start_combat(page, qty="2")
        c = combat(page)
        expect_eq((c["active"], c["round"], c["turnIndex"]), (True, 1, 0), "Estado inicial del combate")
        names = [x["name"] for x in c["combatants"]]
        expect_eq(names[0], "Kaeroc Cuernonegro", "El PJ con mayor iniciativa debe ir primero")
        expect_eq(sorted(names[1:]), ["Orco 1", "Orco 2"], "Enemigos creados")
        pc = c["combatants"][0]
        expect_eq((pc["hp"], pc["maxHp"], pc["ac"], pc["isPlayer"]), (40, 58, 14, True), "Datos del PJ en combate")
        rows = page.locator("#dm-combatants-container [id^='dm-combatant-']")
        expect_eq(rows.count(), 3, "Filas en el tracker")
        expect("Kaeroc" in rows.first.text_content(), "La primera fila no es el PJ")
        expect("1" in text(page, "#dm-combat-round-text"), f"Ronda mostrada: {text(page, '#dm-combat-round-text')}")

    @s.case("Combate: Siguiente turno recorre a todos y al volver al primero sube a ronda 2; Anterior retrocede")
    def _():
        for _ in range(3):
            page.click("#dm-next-turn-btn")
            page.wait_for_timeout(150)
        c = combat(page)
        expect_eq((c["round"], c["turnIndex"]), (2, 0), "Tras 3 avances con 3 combatientes")
        expect("2" in text(page, "#dm-combat-round-text"), "La ronda mostrada no subió a 2")
        page.click("#dm-prev-turn-btn")
        page.wait_for_timeout(150)
        c = combat(page)
        expect_eq((c["round"], c["turnIndex"]), (1, 2), "Tras retroceder desde el inicio de la ronda 2")

    @s.case("Combate: dañar al PJ en el tracker sincroniza su ficha y la tarjeta del Grimorio")
    def _():
        pc_id = next(x["id"] for x in combat(page)["combatants"] if x["isPlayer"])
        dialogs.answer("8")
        page.click(f"#dm-combatant-{pc_id} .dm-hp-sub-btn")
        wait_text(page, f"#dm-hp-num-{pc_id}", "32")
        expect_eq(pc_store(page)["hp"]["current"], 32, "PG de la ficha tras daño en combate")
        page.wait_for_function("(() => { const g = document.getElementById('grimoire-players-grid'); return g && g.textContent.includes('32'); })()", timeout=3000)

    @s.case("Triste Combate: el daño a un enemigo no baja de 0 y la curación no supera su máximo")
    def _():
        npc = next(x for x in combat(page)["combatants"] if not x["isPlayer"])
        dialogs.answer("500")
        page.click(f"#dm-combatant-{npc['id']} .dm-hp-sub-btn")
        wait_text(page, f"#dm-hp-num-{npc['id']}", "0")
        dialogs.answer("500")
        page.click(f"#dm-combatant-{npc['id']} .dm-hp-add-btn")
        wait_text(page, f"#dm-hp-num-{npc['id']}", "15")

    @s.case("Combate: quitar un combatiente (con confirmación) lo elimina y conserva el resto")
    def _():
        npc = next(x for x in combat(page)["combatants"] if x["name"] == "Orco 2")
        page.click(f"#dm-combatant-{npc['id']} .dm-remove-combatant-btn")
        d = app_dialog(page)
        expect("Orco 2" in d["message"], f"Confirmación: {d}")
        app_dialog_click(page, "Eliminar")
        page.wait_for_timeout(300)
        names = [x["name"] for x in combat(page)["combatants"]]
        expect("Orco 2" not in names and len(names) == 2, f"Combatientes tras quitar: {names}")
        expect_eq(page.locator(f"#dm-combatant-{npc['id']}").count(), 0, "La fila sigue en el tracker")

    @s.case("Combate: terminar (confirmado) desactiva el combate y vuelve el estado vacío")
    def _():
        page.click("#dm-end-combat-btn")
        app_dialog(page)
        app_dialog_click(page, "Finalizar Combate")
        page.wait_for_timeout(400)
        c = combat(page)
        expect(not c or not c.get("active"), f"El combate sigue activo: {c.get('active')}")
        page.wait_for_selector("#dm-no-combat-box:not(.hidden)", timeout=3000)

    @s.case("Combate: enemigos con token en el mapa; quitar uno del combate retira su token")
    def _():
        fresh(page)
        start_combat(page, monster="Gnoll", qty="2", token=True)
        maps = ls_get(page, f"dnd_maps_{fx.DM_CAMP}")
        toks = maps[0]["tokens"]
        expect_eq(sorted(t["name"] for t in toks.values()), ["Gnoll 1", "Gnoll 2"], "Tokens desplegados con el combate")
        npc = next(x for x in combat(page)["combatants"] if x["name"] == "Gnoll 1")
        expect(npc.get("tokenId") in toks, "El combatiente no quedó vinculado a su token")
        page.click(f"#dm-combatant-{npc['id']} .dm-remove-combatant-btn")
        app_dialog(page)
        app_dialog_click(page, "Eliminar")
        page.wait_for_timeout(400)
        toks = ls_get(page, f"dnd_maps_{fx.DM_CAMP}")[0]["tokens"]
        expect(npc["tokenId"] not in toks, "El token del enemigo quitado sigue en el mapa")

    @s.case("Triste Combate: iniciar sin PJ ni enemigos avisa y no crea combate")
    def _():
        fx.seed_dm(page, camp_overrides={"characterIds": []})
        page.evaluate("() => localStorage.setItem('dnd_all_characters_v1', '[]')")
        fx.open_dm(page)
        page.click("#dm-start-combat-btn")
        page.wait_for_selector("#dm-start-combat-modal:not(.hidden)")
        page.fill("#dm-init-monster-name", "")
        page.click("#dm-modal-confirm-start-btn")
        d = app_dialog(page)
        expect("al menos un combatiente" in d["message"], f"Aviso inesperado: {d}")
        app_dialog_primary(page)
        expect(not (combat(page) or {}).get("active"), "Se creó un combate vacío")

    @s.case("Triste Combate: cancelar 'Terminar combate' lo mantiene activo")
    def _():
        fresh(page)
        start_combat(page)
        page.click("#dm-end-combat-btn")
        app_dialog(page)
        app_dialog_click(page, "Cancelar")
        expect_eq(combat(page).get("active"), True, "El combate terminó pese a cancelar")

    # ------------------------------------------------------------------ sync entre pestañas
    @s.case("Sync DM→jugador (2 pestañas): el DM daña al PJ en el Grimorio y la ficha del jugador baja sin recargar")
    def _():
        player, _pd = open_dual(s, ctx, page)
        try:
            wait_text(player, "#current-hp-num", "40")
            dialogs.answer("15")
            roster_card(page).locator(".hp-sub-btn").click()
            wait_text(player, "#current-hp-num", "25", timeout=5000)
        finally:
            player.close()

    @s.case("Sync jugador→DM (2 pestañas): el jugador se cura y el Grimorio del DM lo refleja sin recargar")
    def _():
        player, pdialogs = open_dual(s, ctx, page)
        try:
            pdialogs.answer("10")
            player.click("#hp-add-btn")
            wait_text(player, "#current-hp-num", "50")
            page.wait_for_function("document.getElementById('grimoire-players-grid').textContent.includes('50')", timeout=5000)
        finally:
            player.close()

    @s.case("Sync DM→jugador (2 pestañas): el DM inspira al PJ y la ficha del jugador lo muestra; luego lo quita")
    def _():
        player, _pd = open_dual(s, ctx, page)
        try:
            before = text(player, "#hero-inspiration-text")
            roster_card(page).locator(".inspire-btn").click()
            player.wait_for_function("t => document.getElementById('hero-inspiration-text').textContent.trim() !== t", arg=before, timeout=5000)
            roster_card(page).locator(".inspire-btn").click()
            player.wait_for_function("t => document.getElementById('hero-inspiration-text').textContent.trim() === t", arg=before, timeout=5000)
        finally:
            player.close()
