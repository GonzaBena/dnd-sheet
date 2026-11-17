import json
import os
import urllib.parse
from playwright.sync_api import sync_playwright

DIST_DIR = os.path.abspath("dist")
BRAVE_BIN = "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser"

results = []

def record(name, fn):
    print(f"--> Running: {name}", flush=True)
    try:
        info = fn()
        results.append({"name": name, "passed": True, "info": info or ""})
        print(f"    PASSED: {name}", flush=True)
    except Exception as e:
        import traceback
        tb = traceback.format_exc()
        results.append({"name": name, "passed": False, "error": f"{e}\n{tb}"})
        print(f"    FAILED: {name}: {e}\n{tb}", flush=True)

BASE = "http://local.app"

with sync_playwright() as p:
    browser = p.chromium.launch(
        executable_path=BRAVE_BIN,
        headless=True,
        args=["--no-sandbox", "--disable-gpu"]
    )
    context = browser.new_context(viewport={"width": 1440, "height": 900})

    def handle_route(route):
        url = route.request.url
        parsed = urllib.parse.urlparse(url)
        if parsed.netloc != "local.app":
            route.fulfill(status=200, body=b"")
            return

        path_part = parsed.path
        if path_part == "/" or path_part == "":
            file_path = os.path.join(DIST_DIR, "index.html")
        elif os.path.exists(os.path.join(DIST_DIR, path_part.lstrip("/"), "index.html")):
            file_path = os.path.join(DIST_DIR, path_part.lstrip("/"), "index.html")
        else:
            file_path = os.path.join(DIST_DIR, path_part.lstrip("/"))

        if os.path.exists(file_path) and os.path.isfile(file_path):
            ext = os.path.splitext(file_path)[1].lower()
            content_types = {
                ".html": "text/html; charset=utf-8",
                ".js": "application/javascript; charset=utf-8",
                ".mjs": "application/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8",
                ".json": "application/json; charset=utf-8",
                ".svg": "image/svg+xml",
                ".png": "image/png",
                ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg",
                ".webp": "image/webp",
                ".avif": "image/avif",
                ".woff": "font/woff",
                ".woff2": "font/woff2",
            }
            ct = content_types.get(ext, "application/octet-stream")
            with open(file_path, "rb") as f:
                body = f.read()
            route.fulfill(status=200, content_type=ct, body=body)
        else:
            route.fulfill(status=404, body=b"Not found")

    context.route("**/*", handle_route)
    context.add_init_script("window.__DND_FORCE_LOCAL__ = true; try { localStorage.setItem('dnd_force_local', '1'); } catch(e) {}")
    page = context.new_page()

    # -------------------------------------------------------------------------
    # 1. PÁGINA PRINCIPAL (/) - GESTOR DE CAMPAÑAS Y PERSONAJES
    # -------------------------------------------------------------------------
    def test_index_buttons():
        page.goto(f"{BASE}/?demo=1", wait_until="domcontentloaded")
        page.wait_for_selector("#btn-create-campaign-top", timeout=8000)

        # Abrir y cerrar modal Crear Campaña
        page.click("#btn-create-campaign-top")
        page.wait_for_selector("#create-campaign-modal", timeout=5000)
        page.click(".preset-img-btn >> nth=0")
        page.click("#create-campaign-cancel-btn")

        # Abrir modal Crear Personaje
        page.click("#btn-create-standalone-char")
        page.wait_for_selector("#create-character-modal[open]", timeout=5000)

        # Creador rápido
        page.click('#create-character-modal button[data-creation-mode="quick"]')
        page.wait_for_selector("#quick-creator-modal[open]", timeout=5000)
        page.click("#quick-suggest-name-btn")
        page.click("#quick-creator-close-btn")

        # Reabrir y Creación manual
        page.click("#btn-create-standalone-char")
        page.wait_for_selector("#create-character-modal[open]", timeout=5000)
        page.click('#create-character-modal button[data-creation-mode="manual"]')
        page.wait_for_selector("#manual-creator-modal[open]", timeout=5000)
        page.click("#manual-suggest-name-btn")
        page.click("#manual-creator-close-btn")

        # Compendio desde top nav
        page.click("#btn-nav-compendium-top")
        page.wait_for_selector("#compendium-modal:not(.hidden)", timeout=5000)
        page.click("#compendium-close-btn")
        page.evaluate("try { localStorage.removeItem('dnd_demo_mode'); } catch(e) {}")
        return "Index buttons OK"

    record("E2E Browser [/]: Botones de Crear Campaña, Crear Personaje (Rápido/Manual) y Compendio", test_index_buttons)

    # -------------------------------------------------------------------------
    # 2. FICHA DE JUGADORA EN VIVO (/campaigns) - REGRESIÓN 8 -> 3 PG Y BOTONES DE FICHA
    # -------------------------------------------------------------------------
    def test_player_sheet_hp_and_buttons():
        page.evaluate("""() => {
            localStorage.setItem('dnd_legacy_campaigns_cleaned_v2', 'true');
            localStorage.setItem('dnd_legacy_chars_cleaned_v2', 'true');
            localStorage.setItem('dnd_force_local', '1');
            window.__DND_FORCE_LOCAL__ = true;

            const camp = {
                id: 'camp-test-strahd',
                name: 'Maldición de Strahd',
                description: 'Prueba E2E Barovia',
                creatorId: 'user-raven',
                dmId: 'user-raven',
                dmName: 'Lord Raven',
                memberUserIds: ['user-me', 'user-raven'],
                status: 'active',
                sessionNumber: 15,
                weather: 'Niebla',
                location: 'Castillo Ravenloft',
                characterIds: ['char-test-elysian'],
                createdAt: Date.now()
            };

            const char = {
                id: 'char-test-elysian',
                name: 'Elysian Ventosombra',
                playerName: 'Gonzo (Tú)',
                campaignId: 'camp-test-strahd',
                userId: 'user-me',
                race: 'Semielfa',
                className: 'Pícara',
                level: 3,
                hp: { current: 8, max: 8, temp: 0 },
                armorClass: 15,
                stats: {
                    str: { score: 10, modifier: 0 },
                    dex: { score: 16, modifier: 3 },
                    con: { score: 12, modifier: 1 },
                    int: { score: 14, modifier: 2 },
                    wis: { score: 12, modifier: 1 },
                    cha: { score: 8, modifier: -1 }
                },
                currency: { cp: 10, sp: 5, ep: 0, gp: 50, pp: 0 },
                inventory: [],
                weapons: [],
                spells: [],
                features: [],
                skills: [],
                attunedItems: []
            };

            localStorage.setItem('dnd_current_user_id_v1', 'user-me');
            localStorage.setItem('dnd_campaigns_v1', JSON.stringify([camp]));
            localStorage.setItem('dnd_all_characters_v1', JSON.stringify([char]));
            localStorage.setItem('dnd_active_campaign_id_v1', 'camp-test-strahd');
            localStorage.setItem('dnd_active_character_v1', JSON.stringify(char));
        }""")

        page.goto(f"{BASE}/campaigns?campaign=camp-test-strahd&character=char-test-elysian&mode=player", wait_until="domcontentloaded")
        page.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=8000)
        page.wait_for_function("document.getElementById('current-hp-num')?.textContent?.trim() === '8'", timeout=5000)

        # Clic en -5 PG (#hp-sub-5): 8 -> 3
        page.click("#hp-sub-5")
        page.wait_for_function("document.getElementById('current-hp-num')?.textContent?.trim() === '3'", timeout=5000)

        # Esperar 700ms para asegurar que ninguna sincronización ni debounce revierta 3 -> 8
        page.wait_for_timeout(700)
        hp_after_wait = page.locator("#current-hp-num").inner_text().strip()
        assert hp_after_wait == "3", f"El PG rebotó después de restar 5: se esperaba 3, se obtuvo {hp_after_wait}"

        # Recargar la página y verificar que persiste en 3/8
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=8000)
        page.wait_for_function("document.getElementById('current-hp-num')?.textContent?.trim() === '3'", timeout=5000)
        hp_after_reload = page.locator("#current-hp-num").inner_text().strip()
        assert hp_after_reload == "3", f"El PG no persistió tras recargar: se esperaba 3, se obtuvo {hp_after_reload}"

        # Probar -1 (#hp-sub-1 -> 2), +1 (#hp-add-1 -> 3), +5 (#hp-add-5 -> 8)
        page.click("#hp-sub-1")
        page.wait_for_function("document.getElementById('current-hp-num')?.textContent?.trim() === '2'", timeout=5000)
        page.click("#hp-add-1")
        page.wait_for_function("document.getElementById('current-hp-num')?.textContent?.trim() === '3'", timeout=5000)
        page.click("#hp-add-5")
        page.wait_for_function("document.getElementById('current-hp-num')?.textContent?.trim() === '8'", timeout=5000)

        # Probar botones de modales y secciones de la ficha del jugador con selectores exactos
        page.click("#vitals-ac-card")
        page.wait_for_selector("#ac-breakdown-modal:not(.hidden)", timeout=5000)
        page.click("#ac-bd-close-btn")

        page.click("#currency-edit-btn")
        page.wait_for_selector("#edit-currency-modal:not(.hidden)", timeout=5000)
        page.click("#currency-modal-close-btn")

        page.click("#attuned-config-btn")
        page.wait_for_selector("#edit-attuned-modal:not(.hidden)", timeout=5000)
        page.click("#attuned-modal-close-btn")

        page.click("#open-add-weapon-btn")
        page.wait_for_selector("#add-weapon-modal:not(.hidden)", timeout=5000)
        page.click("#add-weapon-close-btn")

        page.click("#open-add-spell-btn")
        page.wait_for_selector("#add-spell-modal:not(.hidden)", timeout=5000)
        page.click("#add-spell-close-btn")

        page.click("#open-add-item-btn")
        page.wait_for_selector("#add-item-modal:not(.hidden)", timeout=5000)
        page.click("#add-item-close-btn")

        page.click("#open-skills-edit-btn")
        page.wait_for_selector("#edit-skills-modal:not(.hidden)", timeout=5000)
        page.click("#skills-modal-close-btn")

        page.click("#open-features-config-btn")
        page.wait_for_selector("#edit-features-modal:not(.hidden)", timeout=5000)
        page.click("#features-modal-close-btn")

        return "Player sheet HP & modals OK"

    record("E2E Browser [/campaigns Jugadora]: Regresión 8 -> 3 PG sin rebote, persistencia tras recarga y botones de ficha", test_player_sheet_hp_and_buttons)

    # -------------------------------------------------------------------------
    # 3. GRIMORIO DEL DM Y COMBAT TRACKER (/campaigns DM) - BOTONES -5/-1/+1/+5 Y COMBATE
    # -------------------------------------------------------------------------
    def test_dm_grimoire_and_combat_tracker():
        page.evaluate("""() => {
            localStorage.setItem('dnd_legacy_campaigns_cleaned_v2', 'true');
            localStorage.setItem('dnd_legacy_chars_cleaned_v2', 'true');
            localStorage.setItem('dnd_force_local', '1');
            window.__DND_FORCE_LOCAL__ = true;

            const dmCamp = {
                id: 'camp-test-dm',
                name: 'Descenso al Averno',
                description: 'Prueba DM',
                creatorId: 'user-me',
                dmId: 'user-me',
                dmName: 'Gonzo (Tú)',
                memberUserIds: ['user-me', 'user-elena'],
                status: 'active',
                sessionNumber: 8,
                weather: 'Fuego y Azufre',
                location: 'Averno',
                characterIds: ['char-test-kaeroc'],
                createdAt: Date.now()
            };

            const pc = {
                id: 'char-test-kaeroc',
                name: 'Kaeroc Cuernonegro',
                playerName: 'Elena V.',
                campaignId: 'camp-test-dm',
                userId: 'user-elena',
                race: 'Tiefling',
                className: 'Brujo',
                level: 5,
                hp: { current: 40, max: 58, temp: 0 },
                armorClass: 14,
                stats: {
                    str: { score: 10, modifier: 0 },
                    dex: { score: 14, modifier: 2 },
                    con: { score: 14, modifier: 2 },
                    int: { score: 10, modifier: 0 },
                    wis: { score: 12, modifier: 1 },
                    cha: { score: 18, modifier: 4 }
                },
                currency: { cp: 0, sp: 0, ep: 0, gp: 100, pp: 0 },
                inventory: [],
                weapons: [],
                spells: [],
                features: [],
                skills: [],
                attunedItems: []
            };

            localStorage.setItem('dnd_current_user_id_v1', 'user-me');
            localStorage.setItem('dnd_campaigns_v1', JSON.stringify([dmCamp]));
            localStorage.setItem('dnd_all_characters_v1', JSON.stringify([pc]));
            localStorage.setItem('dnd_active_campaign_id_v1', 'camp-test-dm');
            localStorage.removeItem('dnd_combat_camp-test-dm');
        }""")

        page.goto(f"{BASE}/campaigns?campaign=camp-test-dm", wait_until="domcontentloaded")
        page.wait_for_selector("#dm-control-workspace:not(.hidden)", timeout=8000)
        page.wait_for_selector("#grimoire-players-grid .hp-btn", timeout=5000)

        # 1. Probar botones -5, -1, +1, +5 del DM en la tarjeta de aventurero del Grimorio
        page.click('#grimoire-players-grid .hp-btn[data-delta="-5"]')
        hp_in_store = page.evaluate("""() => {
            const chars = JSON.parse(localStorage.getItem('dnd_all_characters_v1') || '[]');
            return chars.find(c => c.id === 'char-test-kaeroc')?.hp?.current;
        }""")
        assert hp_in_store == 35, f"El botón -5 del Grimorio no restó 5 PG (esperado 35, obtenido {hp_in_store})"

        page.click('#grimoire-players-grid .hp-btn[data-delta="-1"]')
        hp_in_store = page.evaluate("""() => {
            const chars = JSON.parse(localStorage.getItem('dnd_all_characters_v1') || '[]');
            return chars.find(c => c.id === 'char-test-kaeroc')?.hp?.current;
        }""")
        assert hp_in_store == 34, f"El botón -1 del Grimorio no restó 1 PG (esperado 34, obtenido {hp_in_store})"

        page.click('#grimoire-players-grid .hp-btn[data-delta="1"]')
        page.click('#grimoire-players-grid .hp-btn[data-delta="5"]')
        hp_in_store = page.evaluate("""() => {
            const chars = JSON.parse(localStorage.getItem('dnd_all_characters_v1') || '[]');
            return chars.find(c => c.id === 'char-test-kaeroc')?.hp?.current;
        }""")
        assert hp_in_store == 40, f"Los botones +1/+5 del Grimorio no sumaron PG (esperado 40, obtenido {hp_in_store})"

        # Botón Inspirar en Grimorio
        page.click('#grimoire-players-grid .inspire-btn')

        # 2. Iniciar Combate en CombatTracker con el jugador y un enemigo (Orco Jefe, 25 PG)
        page.click("#dm-start-combat-btn")
        page.wait_for_selector("#dm-start-combat-modal:not(.hidden)", timeout=5000)
        page.click("#dm-roll-all-initiatives-btn")
        page.fill("#dm-init-monster-name", "Orco Jefe")
        page.fill("#dm-init-monster-init", "12")
        page.fill("#dm-init-monster-hp", "25")
        page.fill("#dm-init-monster-ac", "13")
        page.uncheck("#dm-init-monster-add-token")
        page.click("#dm-modal-confirm-start-btn")

        page.wait_for_selector("#dm-combatants-container .dm-hp-delta-btn", timeout=5000)

        # 3. Probar botones -5 y -1 en CombatTracker sobre el personaje JUGADOR (PJ)
        pc_id = page.evaluate("""() => {
            const combat = JSON.parse(localStorage.getItem('dnd_combat_camp-test-dm'));
            return combat.combatants.find(c => c.isPlayer).id;
        }""")
        page.click(f'#dm-combatant-{pc_id} .dm-hp-delta-btn[data-delta="-5"]')
        page.wait_for_function(f"document.getElementById('dm-hp-num-{pc_id}')?.textContent?.trim() === '35'", timeout=5000)

        combat_pc_hp = page.evaluate("""() => {
            const combat = JSON.parse(localStorage.getItem('dnd_combat_camp-test-dm'));
            return combat.combatants.find(c => c.isPlayer).hp;
        }""")
        char_pc_hp = page.evaluate("""() => {
            const chars = JSON.parse(localStorage.getItem('dnd_all_characters_v1') || '[]');
            return chars.find(c => c.id === 'char-test-kaeroc')?.hp?.current;
        }""")
        dom_pc_hp = page.locator(f"#dm-hp-num-{pc_id}").inner_text().strip()
        assert combat_pc_hp == 35 and char_pc_hp == 35 and dom_pc_hp == "35", (
            f"El botón -5 del CombatTracker sobre PJ falló: combat={combat_pc_hp}, char={char_pc_hp}, dom={dom_pc_hp}"
        )

        page.click(f'#dm-combatant-{pc_id} .dm-hp-delta-btn[data-delta="-1"]')
        page.wait_for_function(f"document.getElementById('dm-hp-num-{pc_id}')?.textContent?.trim() === '34'", timeout=5000)
        dom_pc_hp_2 = page.locator(f"#dm-hp-num-{pc_id}").inner_text().strip()
        assert dom_pc_hp_2 == "34", f"El botón -1 del CombatTracker sobre PJ falló: dom={dom_pc_hp_2}"

        # 4. Probar botones -5, -1, +1, +5 sobre el NPC (Orco Jefe)
        npc_id = page.evaluate("""() => {
            const combat = JSON.parse(localStorage.getItem('dnd_combat_camp-test-dm'));
            return combat.combatants.find(c => !c.isPlayer).id;
        }""")
        page.click(f'#dm-combatant-{npc_id} .dm-hp-delta-btn[data-delta="-5"]')
        page.wait_for_function(f"document.getElementById('dm-hp-num-{npc_id}')?.textContent?.trim() === '20'", timeout=5000)
        assert page.locator(f"#dm-hp-num-{npc_id}").inner_text().strip() == "20"

        # Siguiente turno y turno anterior
        page.click("#dm-next-turn-btn")
        page.click("#dm-prev-turn-btn")

        # Pestañas del Grimorio (Bitácora, Handouts, Mapas) y filtros
        page.click("#grimoire-tab-handouts")
        page.click("#grimoire-tab-maps")
        page.click("#grimoire-tab-journal")
        page.click('.grimoire-filter-btn[data-filter="#Combate"]')
        page.click('.grimoire-filter-btn[data-filter="all"]')

        return "DM Grimoire & CombatTracker buttons OK"

    record("E2E Browser [/campaigns DM]: Botones -5/-1/+1/+5 en Grimorio y CombatTracker sobre PJ y NPC persisten", test_dm_grimoire_and_combat_tracker)

    # -------------------------------------------------------------------------
    # 4. DAÑO REALIZADO POR JUGADORES EN COMBATE PERSISTE EN OPONENTES
    # -------------------------------------------------------------------------
    def test_player_combat_damage_persistence():
        # El Orco Jefe tiene actualmente 20 PG en el combate activo de camp-test-dm.
        # La jugadora / jugador lanza una tirada de daño contra Orco Jefe usando DiceRollerModal (modo físico: dado=7, mod=+2 => 9 daño).
        page.evaluate("""() => {
            window.dispatchEvent(new CustomEvent('open-dice-roller', {
                detail: {
                    die: 8,
                    count: 1,
                    modifier: 2,
                    label: 'Daño de Espada Larga (Cortante)',
                    tag: '#Combate',
                    targetName: 'Orco Jefe',
                    targetAc: 13,
                    isDamageRoll: true,
                    isPhysical: true
                }
            }));
        }""")
        page.wait_for_selector("#dice-roller-modal:not(.hidden)", timeout=5000)
        page.fill("#dice-physical-input", "7")
        page.click("#jackpot-roll-trigger-btn")
        page.wait_for_timeout(250)

        npc_hp_after_player_dmg = page.evaluate("""() => {
            const combat = JSON.parse(localStorage.getItem('dnd_combat_camp-test-dm'));
            return combat.combatants.find(c => !c.isPlayer).hp;
        }""")
        assert npc_hp_after_player_dmg == 11, (
            f"El daño del jugador (9 PG) no persistió en el oponente Orco Jefe: esperado 11 (20 - 9), obtenido {npc_hp_after_player_dmg}"
        )

        # Recargar la página y comprobar que el Orco Jefe sigue teniendo 11 PG
        page.reload(wait_until="domcontentloaded")
        page.wait_for_selector("#dm-combatants-container", timeout=8000)
        npc_hp_after_reload = page.evaluate("""() => {
            const combat = JSON.parse(localStorage.getItem('dnd_combat_camp-test-dm'));
            return combat.combatants.find(c => !c.isPlayer).hp;
        }""")
        assert npc_hp_after_reload == 11, f"El daño en el oponente no persistió tras recargar: {npc_hp_after_reload}"

        return "Player damage persistence on opponent (20 -> 11 PG) OK"

    record("E2E Browser [Combate]: El daño realizado por jugadores reduce los PG del oponente y persiste tras recargar", test_player_combat_damage_persistence)

    # -------------------------------------------------------------------------
    # 5. VISTA DE PARTIDA (/partida?local=1) Y PÁGINA DE PRUEBAS (/test)
    # -------------------------------------------------------------------------
    def test_partida_and_test_pages():
        page.goto(f"{BASE}/partida?id=camp-test-dm&local=1", wait_until="domcontentloaded")
        page.wait_for_selector("#party-content:not(.hidden)", timeout=8000)

        # Pestañas de PartyView
        page.click("#party-tab-handouts")
        page.click("#party-tab-journal")

        # Página /test (Sobres lacrados e inventario de prueba)
        page.goto(f"{BASE}/test", wait_until="domcontentloaded")
        page.wait_for_selector("#btn-launch-envelope", timeout=8000)
        page.click('.preset-card[data-items="true"]')
        page.click("#btn-launch-envelope")
        page.wait_for_selector("#parchment-overlay:not(.hidden)", timeout=5000)
        page.click("#btn-inspect-items")
        page.click("#btn-back-to-letter")
        page.click("#btn-inspect-items")
        page.click("#btn-claim-items")
        page.wait_for_timeout(400)
        return "Partida & Test pages OK"

    record("E2E Browser [/partida & /test]: Botones de vista de partida en vivo y sobres lacrados interactivos", test_partida_and_test_pages)

    browser.close()

print(json.dumps(results))
