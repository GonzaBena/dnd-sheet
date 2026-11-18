"""
tests/e2e/emulator.py
Cliente mínimo de la Firebase Emulator Suite (auth 9099, firestore 8080, database 9000) para las
suites E2E en modo nube. Solo habla con 127.0.0.1 y con el proyecto demo: nunca toca Firebase real.

- reset(): borra usuarios, documentos y RTDB del proyecto demo.
- sign_up(): crea un usuario email/contraseña y devuelve su uid.
- set_doc()/get_doc(): escriben/leen documentos con privilegios de administrador (token "owner"),
  saltando las reglas — solo para sembrar y verificar, nunca para el flujo bajo prueba.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from typing import Any

PROJECT = "demo-dnd-sheet"
API_KEY = "fake-api-key"
HOST = "127.0.0.1"
AUTH = f"http://{HOST}:9099"
FS = f"http://{HOST}:8080"
RTDB = f"http://{HOST}:9000"
DOCS = f"{FS}/v1/projects/{PROJECT}/databases/(default)/documents"
OWNER = {"Authorization": "Bearer owner"}


def _req(method: str, url: str, body: Any = None, headers: dict | None = None) -> Any:
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers={"Content-Type": "application/json", **(headers or {})})
    try:
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return None
        raise RuntimeError(f"{method} {url} → {e.code}: {e.read()[:300]!r}") from None


def available() -> bool:
    try:
        urllib.request.urlopen(f"{AUTH}/", timeout=2)
        urllib.request.urlopen(f"{FS}/", timeout=2)
        return True
    except Exception:
        return False


def reset() -> None:
    _req("DELETE", f"{FS}/emulator/v1/projects/{PROJECT}/databases/(default)/documents")
    _req("DELETE", f"{AUTH}/emulator/v1/projects/{PROJECT}/accounts")
    _req("PUT", f"{RTDB}/.json?ns={PROJECT}", {}, OWNER)


def sign_up(email: str, password: str, name: str) -> str:
    res = _req(
        "POST",
        f"{AUTH}/identitytoolkit.googleapis.com/v1/accounts:signUp?key={API_KEY}",
        {"email": email, "password": password, "displayName": name, "returnSecureToken": True},
    )
    return res["localId"]


# ---------------------------------------------------------------------------- conversión Firestore
def _to_value(v: Any) -> dict:
    if v is None:
        return {"nullValue": None}
    if isinstance(v, bool):
        return {"booleanValue": v}
    if isinstance(v, int):
        return {"integerValue": str(v)}
    if isinstance(v, float):
        return {"doubleValue": v}
    if isinstance(v, str):
        return {"stringValue": v}
    if isinstance(v, list):
        return {"arrayValue": {"values": [_to_value(x) for x in v]}}
    if isinstance(v, dict):
        return {"mapValue": {"fields": {k: _to_value(x) for k, x in v.items()}}}
    raise TypeError(f"Tipo no soportado: {type(v)}")


def _from_value(v: dict) -> Any:
    (kind, val), = v.items()
    if kind == "nullValue":
        return None
    if kind == "integerValue":
        return int(val)
    if kind in ("doubleValue", "booleanValue", "stringValue", "timestampValue", "referenceValue"):
        return val
    if kind == "arrayValue":
        return [_from_value(x) for x in val.get("values", [])]
    if kind == "mapValue":
        return {k: _from_value(x) for k, x in val.get("fields", {}).items()}
    return val


def set_doc(path: str, data: dict) -> None:
    _req("PATCH", f"{DOCS}/{path}", {"fields": {k: _to_value(v) for k, v in data.items()}}, OWNER)


def get_doc(path: str) -> dict | None:
    res = _req("GET", f"{DOCS}/{path}", headers=OWNER)
    if not res:
        return None
    return {k: _from_value(v) for k, v in res.get("fields", {}).items()}
