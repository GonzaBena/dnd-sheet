"""
tests/e2e/fixtures.py
Datos semilla para las suites E2E en modo local (localStorage).

Convenciones de IDs:
  - Usuario actual: 'user-me'. Otro jugador: 'user-elena'. DM ajeno: 'user-raven'.
  - Campañas: 'camp-e2e-player' (yo jugadora) y 'camp-e2e-dm' (yo DM).
"""
from __future__ import annotations

import copy
import json
import time
from typing import Any

from playwright.sync_api import Page

from harness import BASE

ME = "user-me"
ELENA = "user-elena"
RAVEN = "user-raven"

# Mapa 1000x800 sin dependencias externas (SVG embebido).
MAP_IMAGE = (
    "data:image/svg+xml;utf8,"
    "<svg xmlns='http://www.w3.org/2000/svg' width='1000' height='800'>"
    "<rect width='1000' height='800' fill='%23334155'/></svg>"
)


def stat(score: int, prof: bool = False) -> dict:
    return {"score": score, "baseScore": score, "modifier": (score - 10) // 2, "savingProficient": prof}


def make_character(
    char_id: str,
    *,
    name: str,
    campaign_id: str | None,
    user_id: str = ME,
    player_name: str = "Gonzo (Tú)",
    class_name: str = "Mago",
    race: str = "Humano",
    level: int = 3,
    hp: tuple[int, int, int] | dict = (18, 18, 0),
    **extra: Any,
) -> dict:
    char = {
        "id": char_id,
        "campaignId": campaign_id,
        "userId": user_id,
        "playerName": player_name,
        "name": name,
        "title": "",
        "race": race,
        "alignment": "Neutral",
        "className": class_name,
        "subclass": "",
        "level": level,
        "proficiencyBonus": 2,
        "rulesEdition": "2024",
        "inspiration": False,
        "avatarUrl": "",
        "quote": "",
        "hp": dict(hp) if isinstance(hp, dict) else {"current": hp[0], "max": hp[1], "temp": hp[2]},
        "armorNote": "",
        "initiativeBonus": 2,
        "baseSpeedFt": 30,
        "speedFt": 30,
        "speedNote": "",
        "hitDice": {"total": level, "remaining": level, "die": "d6"},
        "stats": {
            "str": stat(8),
            "dex": stat(14),
            "con": stat(14),
            "int": stat(16, True),
            "wis": stat(12, True),
            "cha": stat(10),
        },
        "skills": [],
        "actions": [],
        "currency": {"cp": 10, "sp": 5, "ep": 0, "gp": 50, "pp": 0},
        "attunedItems": [],
        "inventory": [],
        "spellcasting": {
            "ability": "int",
            "saveDc": 13,
            "attackBonus": 5,
            "slots": {str(i): {"total": (4 if i == 1 else 2 if i == 2 else 0), "used": 0} for i in range(1, 10)},
            "spells": [],
        },
        "resources": [],
        "activeEffects": [],
        "features": [],
        "companions": [],
        "sessionContext": {
            "campaignName": "",  # se completa en seed_* con el nombre real de la campaña
            "sessionNumber": 3,
            "weather": "Despejado",
            "location": "Phandalin",
        },
    }
    char.update(extra)
    return char


def make_campaign(camp_id: str, *, name: str, dm_id: str, members: list[str], char_ids: list[str], **extra: Any) -> dict:
    camp = {
        "id": camp_id,
        "name": name,
        "description": "Campaña E2E",
        "creatorId": dm_id,
        "dmId": dm_id,
        "dmName": "Gonzo (Tú)" if dm_id == ME else "Lord Raven",
        "memberUserIds": members,
        "status": "active",
        "sessionNumber": 3,
        "weather": "Despejado",
        "location": "Phandalin",
        "characterIds": char_ids,
        "createdAt": int(time.time() * 1000),
    }
    camp.update(extra)
    return camp


def make_map(map_id: str, *, name: str = "Cripta E2E", tokens: dict | None = None) -> dict:
    return {
        "id": map_id,
        "name": name,
        "imageUrl": MAP_IMAGE,
        "imageWidth": 1000,
        "imageHeight": 800,
        "grid": {"type": "square", "size": 50, "offsetX": 0, "offsetY": 0, "visible": True},
        "tokens": tokens or {},
        "fogRevealed": [],
        "updatedAt": int(time.time() * 1000),
    }


def seed(
    page: Page,
    *,
    campaigns: list[dict],
    characters: list[dict],
    active_campaign: str | None = None,
    active_character: dict | None = None,
    maps: dict[str, list[dict]] | None = None,
    user: str = ME,
    extra: dict[str, Any] | None = None,
) -> None:
    """Limpia localStorage del origen y siembra el estado. Requiere estar en el origen local.app."""
    if not page.url.startswith(BASE):
        page.goto(f"{BASE}/privacidad", wait_until="domcontentloaded")
    payload = {
        "dnd_current_user_id_v1": user,
        "dnd_campaigns_v1": json.dumps(campaigns),
        "dnd_all_characters_v1": json.dumps(characters),
    }
    if active_campaign:
        payload["dnd_active_campaign_id_v1"] = active_campaign
    if active_character:
        payload["dnd_active_character_v1"] = json.dumps(active_character)
    for cid, mlist in (maps or {}).items():
        payload[f"dnd_maps_{cid}"] = json.dumps(mlist)
    for k, v in (extra or {}).items():
        payload[k] = v if isinstance(v, str) else json.dumps(v)
    page.evaluate(
        """p => {
            localStorage.clear();
            localStorage.setItem('dnd_force_local', '1');
            localStorage.setItem('dnd_legacy_campaigns_cleaned_v2', 'true');
            localStorage.setItem('dnd_legacy_chars_cleaned_v2', 'true');
            for (const [k, v] of Object.entries(p)) localStorage.setItem(k, v);
        }""",
        payload,
    )


# ---------------------------------------------------------------------------- escenarios comunes
PLAYER_CAMP = "camp-e2e-player"
PLAYER_CHAR = "char-e2e-mago"
DM_CAMP = "camp-e2e-dm"
DM_PC = "char-e2e-kaeroc"
MAP_ID = "map-e2e-cripta"


def seed_player(page: Page, *, with_map: bool = True, char_overrides: dict | None = None, camp_overrides: dict | None = None) -> dict:
    """Yo (user-me) soy jugadora en una campaña de Raven con un mapa activo opcional."""
    char = make_character(PLAYER_CHAR, name="Lyra Brasaviva", campaign_id=PLAYER_CAMP, **(char_overrides or {}))
    char["sessionContext"]["campaignName"] = "La Mina Perdida"
    camp = make_campaign(
        PLAYER_CAMP,
        name="La Mina Perdida",
        dm_id=RAVEN,
        members=[ME, RAVEN],
        char_ids=[PLAYER_CHAR],
        **({"activeMapId": MAP_ID} if with_map else {}),
        **(camp_overrides or {}),
    )
    seed(
        page,
        campaigns=[camp],
        characters=[char],
        active_campaign=PLAYER_CAMP,
        active_character=char,
        maps={PLAYER_CAMP: [make_map(MAP_ID)]} if with_map else None,
    )
    return copy.deepcopy(char)


def wait_app_ready(page: Page, timeout: int = 15000) -> None:
    """Espera a que se retire la pantalla de carga (Spec 16).

    Mientras está activa, `<main>` queda `inert`: Playwright no lo considera al verificar si un
    elemento es accionable, así que `fill`/`click` "funcionan" pero el navegador los ignora.
    """
    page.wait_for_function(
        "!document.documentElement.hasAttribute('data-booting') && !document.querySelector('main')?.inert",
        timeout=timeout,
    )


def open_player_sheet(page: Page) -> None:
    page.goto(
        f"{BASE}/campaigns?campaign={PLAYER_CAMP}&character={PLAYER_CHAR}&mode=player",
        wait_until="domcontentloaded",
    )
    page.wait_for_selector("#player-sheet-workspace:not(.hidden)", timeout=10000)
    wait_app_ready(page)


def seed_dm(page: Page, *, with_map: bool = True, pc_overrides: dict | None = None, camp_overrides: dict | None = None, tokens: dict | None = None) -> dict:
    """Yo (user-me) soy DM; Elena juega con Kaeroc."""
    kwargs: dict[str, Any] = dict(
        name="Kaeroc Cuernonegro",
        campaign_id=DM_CAMP,
        user_id=ELENA,
        player_name="Elena V.",
        class_name="Brujo",
        race="Tiefling",
        level=5,
        hp=(40, 58, 0),
        armorClass=14,
    )
    overrides = dict(pc_overrides or {})
    if "userId" in overrides:
        kwargs["user_id"] = overrides.pop("userId")
    if "playerName" in overrides:
        kwargs["player_name"] = overrides.pop("playerName")
    kwargs.update(overrides)
    pc = make_character(DM_PC, **kwargs)
    pc["sessionContext"]["campaignName"] = "Descenso al Averno"
    camp = make_campaign(
        DM_CAMP,
        name="Descenso al Averno",
        dm_id=ME,
        members=[ME, ELENA],
        char_ids=[DM_PC],
        **({"activeMapId": MAP_ID} if with_map else {}),
        **(camp_overrides or {}),
    )
    seed(
        page,
        campaigns=[camp],
        characters=[pc],
        active_campaign=DM_CAMP,
        maps={DM_CAMP: [make_map(MAP_ID, tokens=tokens)]} if with_map else None,
    )
    return copy.deepcopy(pc)


def open_dm(page: Page) -> None:
    page.goto(f"{BASE}/campaigns?campaign={DM_CAMP}", wait_until="domcontentloaded")
    page.wait_for_selector("#dm-control-workspace:not(.hidden)", timeout=10000)
    wait_app_ready(page)
