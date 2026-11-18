"""
tests/e2e/harness.py
Infraestructura compartida para las suites E2E (Playwright + Brave headless).

- Sirve el build estático `dist/` bajo el host ficticio http://local.app (sin servidor real).
- Fuerza el modo local (`__DND_FORCE_LOCAL__`) salvo que la suite pida modo nube (emuladores).
- Expone `Suite`, que registra cada escenario y emite al final una línea JSON con los resultados
  (formato consumido por tests/e2e_*.test.mjs).
- Captura errores JS no controlados (`pageerror`) por escenario: un escenario falla si la página
  lanzó una excepción aunque las aserciones visibles hayan pasado.
"""
from __future__ import annotations

import base64
import functools
import http.server
import json
import os
import threading
import time
import traceback
import urllib.parse
from typing import Any, Callable

from playwright.sync_api import Browser, BrowserContext, Page, Route, sync_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DIST_DIR = os.environ.get("E2E_DIST") or os.path.join(ROOT, "dist")
BRAVE_BIN = os.environ.get("BRAVE_BIN", "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser")
# Origen desde el que se sirve dist/ (interceptado por Playwright, sin servidor real). La suite de nube
# usa un origen 127.0.0.1 para que Chrome no bloquee (Private Network Access) las llamadas a los emuladores.
BASE = os.environ.get("E2E_BASE", "http://local.app")
BASE_NETLOC = urllib.parse.urlparse(BASE).netloc
# E2E_REAL_SERVER=1: dist/ se sirve con un servidor HTTP real en 127.0.0.1 (necesario para que Chrome
# permita las llamadas del navegador a los emuladores: Private Network Access).
REAL_SERVER = os.environ.get("E2E_REAL_SERVER") == "1"


class _QuietHandler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, ".avif": "image/avif", ".mjs": "application/javascript"}

    def log_message(self, *args):  # noqa: D401
        pass


def start_static_server() -> http.server.ThreadingHTTPServer:
    parsed = urllib.parse.urlparse(BASE)
    handler = functools.partial(_QuietHandler, directory=DIST_DIR)
    server = http.server.ThreadingHTTPServer((parsed.hostname, parsed.port or 80), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    return server
HEADLESS = os.environ.get("E2E_HEADED") != "1"
ONLY = os.environ.get("E2E_ONLY")  # filtro por subcadena del nombre del escenario

CONTENT_TYPES = {
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
    ".ico": "image/x-icon",
}

# Errores JS de terceros / ruido de entorno que no son bugs de la app.
IGNORED_PAGE_ERRORS = (
    "ResizeObserver loop",
    "Failed to fetch",
    "NetworkError",
    "Load failed",
)


# PNG 1x1 válido para responder a imágenes externas (mapas con URL https en la suite de nube).
TINY_PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
)


def serve_dist(route: Route) -> None:
    url = route.request.url
    parsed = urllib.parse.urlparse(url)
    if REAL_SERVER and parsed.netloc == BASE_NETLOC:
        route.continue_()
        return
    if parsed.netloc != BASE_NETLOC and parsed.hostname in ("127.0.0.1", "localhost") and parsed.port in (9099, 8080, 9000):
        # Tráfico hacia la Firebase Emulator Suite (suites en modo nube).
        route.continue_()
        return
    if parsed.netloc != BASE_NETLOC:
        # Cualquier recurso externo (fuentes, CDN, APIs) se responde vacío: tests herméticos.
        if os.path.splitext(parsed.path)[1].lower() in (".png", ".jpg", ".jpeg", ".webp", ".avif"):
            route.fulfill(status=200, content_type="image/png", body=TINY_PNG)
            return
        route.fulfill(status=200, body=b"")
        return
    path_part = urllib.parse.unquote(parsed.path)
    rel = path_part.lstrip("/")
    if rel == "":
        file_path = os.path.join(DIST_DIR, "index.html")
    elif os.path.isfile(os.path.join(DIST_DIR, rel, "index.html")):
        file_path = os.path.join(DIST_DIR, rel, "index.html")
    else:
        file_path = os.path.join(DIST_DIR, rel)
    if os.path.isfile(file_path):
        ext = os.path.splitext(file_path)[1].lower()
        with open(file_path, "rb") as f:
            route.fulfill(status=200, content_type=CONTENT_TYPES.get(ext, "application/octet-stream"), body=f.read())
    else:
        route.fulfill(status=404, body=b"Not found")


CLOUD_INIT_SCRIPT = """
try {
  localStorage.setItem('dnd_legacy_campaigns_cleaned_v2', 'true');
  localStorage.setItem('dnd_legacy_chars_cleaned_v2', 'true');
} catch (e) {}
"""

LOCAL_INIT_SCRIPT = """
window.__DND_FORCE_LOCAL__ = true;
try {
  localStorage.setItem('dnd_force_local', '1');
  localStorage.setItem('dnd_legacy_campaigns_cleaned_v2', 'true');
  localStorage.setItem('dnd_legacy_chars_cleaned_v2', 'true');
} catch (e) {}
"""


class DialogQueue:
    """Responde a window.prompt/confirm/alert nativos con valores encolados.

    - `answer("5")` encola una respuesta para el próximo prompt.
    - `dismiss_next()` hace que el próximo diálogo se cancele (Cancelar / Esc).
    - Sin respuestas encoladas: confirm/alert se aceptan; prompt se acepta con `default`.
    """

    def __init__(self) -> None:
        self.queue: list[Any] = []
        self.default: str = "1"
        self.log: list[tuple[str, str]] = []

    def answer(self, *values: Any) -> None:
        self.queue.extend(values)

    def dismiss_next(self) -> None:
        self.queue.append(None)

    def handle(self, dialog) -> None:
        self.log.append((dialog.type, dialog.message))
        try:
            value = self.queue.pop(0) if self.queue else self.default
            if value is None:
                dialog.dismiss()
            elif dialog.type == "prompt":
                dialog.accept(str(value))
            else:
                dialog.accept()
        except Exception:
            pass


class Suite:
    def __init__(self, name: str) -> None:
        self.name = name
        self.results: list[dict[str, Any]] = []
        self._pw = None
        self.browser: Browser | None = None
        self.page_errors: list[str] = []

    # ------------------------------------------------------------------ browser
    def __enter__(self) -> "Suite":
        self._server = start_static_server() if REAL_SERVER else None
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch(
            executable_path=BRAVE_BIN,
            headless=HEADLESS,
            args=["--no-sandbox", "--disable-gpu"],
        )
        return self

    def __exit__(self, *exc) -> None:
        try:
            if self.browser:
                self.browser.close()
        finally:
            if self._pw:
                self._pw.stop()
            if self._server:
                self._server.shutdown()
        print(json.dumps(self.results), flush=True)

    def new_context(self, *, local: bool = True, viewport=(1440, 900), init_script: str | None = None) -> BrowserContext:
        assert self.browser is not None
        ctx = self.browser.new_context(viewport={"width": viewport[0], "height": viewport[1]})
        ctx.route("**/*", serve_dist)
        ctx.add_init_script(LOCAL_INIT_SCRIPT if local else CLOUD_INIT_SCRIPT)
        if init_script:
            ctx.add_init_script(init_script)
        return ctx

    def new_page(self, ctx: BrowserContext) -> tuple[Page, DialogQueue]:
        page = ctx.new_page()
        page.set_default_timeout(int(os.environ.get("E2E_TIMEOUT", "5000")))
        dialogs = DialogQueue()
        page.on("dialog", dialogs.handle)
        page.on("pageerror", lambda err: self._on_page_error(err))
        return page, dialogs

    def _on_page_error(self, err) -> None:
        msg = str(err)
        if any(token in msg for token in IGNORED_PAGE_ERRORS):
            return
        self.page_errors.append(msg)

    # ------------------------------------------------------------------ registro
    def case(self, name: str, *, known_bug: str | None = None):
        """Decorador: registra y ejecuta un escenario.

        `known_bug`: si el escenario documenta un bug conocido todavía no corregido, se marca
        como `xfail`. Si falla, no rompe la suite; si pasa, se reporta como XPASS (bug arreglado).
        """

        def decorator(fn: Callable[[], Any]):
            full = f"[{self.name}] {name}"
            if ONLY and ONLY.lower() not in full.lower():
                return fn
            print(f"--> {full}", flush=True)
            self.page_errors.clear()
            t0 = time.time()
            entry: dict[str, Any] = {"name": full}
            try:
                info = fn()
                if self.page_errors:
                    raise AssertionError("Errores JS no controlados en la página:\n  - " + "\n  - ".join(self.page_errors[:5]))
                entry.update(passed=True, info=info or "")
                if known_bug:
                    entry.update(xpass=True, info=f"XPASS (¿bug corregido?): {known_bug}")
                    print(f"    XPASS {full}", flush=True)
                else:
                    print(f"    PASSED {full}", flush=True)
            except Exception as e:  # noqa: BLE001
                tb = traceback.format_exc(limit=3)
                if self.page_errors:
                    e = AssertionError(f"{e}\n    [errores JS de la página: {' | '.join(self.page_errors[:3])}]")
                if known_bug:
                    entry.update(passed=True, xfail=True, info=f"XFAIL bug conocido: {known_bug} | {e}")
                    print(f"    XFAIL {full}: {e}", flush=True)
                else:
                    entry.update(passed=False, error=f"{e}\n{tb}")
                    print(f"    FAILED {full}: {e}\n{tb}", flush=True)
            entry["ms"] = int((time.time() - t0) * 1000)
            self.results.append(entry)
            return fn

        return decorator


# ---------------------------------------------------------------------------- utilidades
def text(page: Page, selector: str) -> str:
    """textContent normalizado (sin el text-transform del CSS, espacios colapsados)."""
    return " ".join((page.locator(selector).first.text_content() or "").split())


def wait_text(page: Page, selector: str, expected: str, timeout: int = 5000) -> None:
    """Espera a que el texto (trim) del primer match sea exactamente `expected`."""
    page.wait_for_function(
        "([s, v]) => { const el = document.querySelector(s); return !!el && el.textContent.trim() === v; }",
        arg=[selector, expected],
        timeout=timeout,
    )


def wait_contains(page: Page, selector: str, expected: str, timeout: int = 5000) -> None:
    page.wait_for_function(
        "([s, v]) => { const el = document.querySelector(s); return !!el && el.textContent.includes(v); }",
        arg=[selector, expected],
        timeout=timeout,
    )


def is_visible(page: Page, selector: str) -> bool:
    loc = page.locator(selector)
    return loc.count() > 0 and loc.first.is_visible()


def wait_hidden(page: Page, selector: str, timeout: int = 5000) -> None:
    page.wait_for_function(
        "s => { const el = document.querySelector(s); return !el || el.classList.contains('hidden') || el.offsetParent === null; }",
        arg=selector,
        timeout=timeout,
    )


def ls_get(page: Page, key: str) -> Any:
    return page.evaluate("k => { const v = localStorage.getItem(k); try { return JSON.parse(v); } catch { return v; } }", key)


def stored_char(page: Page, char_id: str) -> dict | None:
    return page.evaluate(
        "id => (JSON.parse(localStorage.getItem('dnd_all_characters_v1') || '[]')).find(c => c.id === id) || null",
        char_id,
    )


def expect(cond: bool, msg: str) -> None:
    if not cond:
        raise AssertionError(msg)


def expect_eq(actual: Any, expected: Any, what: str) -> None:
    if actual != expected:
        raise AssertionError(f"{what}: se esperaba {expected!r}, se obtuvo {actual!r}")


# ---------------------------------------------------------------------------- diálogo propio (notify.ts)
def app_dialog(page: Page, timeout: int = 5000) -> dict:
    """Espera el diálogo #app-dialog visible y devuelve {title, message}."""
    page.wait_for_selector("#app-dialog:not(.hidden) .app-dialog-card", timeout=timeout)
    page.wait_for_timeout(60)
    return page.evaluate(
        """() => ({
            title: document.getElementById('app-dialog-title')?.textContent?.trim() || '',
            message: document.getElementById('app-dialog-message')?.textContent?.trim() || '',
        })"""
    )


def app_dialog_fill(page: Page, name: str, value: str) -> None:
    sel = f"#app-dialog [name='{name}']"
    tag = page.eval_on_selector(sel, "e => e.tagName")
    if tag == "SELECT":
        page.select_option(sel, value)
    else:
        page.fill(sel, value)


def app_dialog_click(page: Page, label: str) -> None:
    """Pulsa el botón del pie del diálogo cuyo texto coincide (p.ej. 'Aceptar', 'Cancelar')."""
    card = page.locator("#app-dialog .app-dialog-card").first.element_handle()
    page.locator("#app-dialog .app-dialog-card > div:last-child button", has_text=label).first.click()
    _wait_detached(page, card)


def app_dialog_primary(page: Page) -> None:
    """Pulsa el último botón del pie (el principal en todos los diálogos de notify.ts)."""
    card = page.locator("#app-dialog .app-dialog-card").first.element_handle()
    page.locator("#app-dialog .app-dialog-card > div:last-child button").last.click()
    _wait_detached(page, card)


def wait_app_dialog_closed(page: Page, timeout: int = 3000) -> None:
    page.wait_for_function(
        "() => { const r = document.getElementById('app-dialog'); return !r || r.classList.contains('hidden') || !r.querySelector('.app-dialog-card'); }",
        timeout=timeout,
    )


def _wait_detached(page: Page, handle, timeout: int = 3000) -> None:
    """Espera a que ESE diálogo concreto se cierre (aunque se abra otro encolado después)."""
    page.wait_for_function("el => !el.isConnected", arg=handle, timeout=timeout)
