# Suites E2E (Playwright + Brave)

Pruebas de navegador real (Brave headless) sobre la app compilada. Cubren caminos felices, caminos
tristes y flujos de "cambio y vuelvo a cambiar", verificando lo que se **ve** (DOM y lienzo Konva) y lo
que se **guarda** (localStorage o Firestore).

| Suite | Qué cubre |
| --- | --- |
| `test_companions.py` | Compañeros/familiares: alta, edición, PG, ritual *Encontrar Familiar*, despliegue y retiro del mapa, validaciones, XSS |
| `test_tactical_map.py` | Panel de tokens del DM: aventureros, compañeros, `+ Enemigo`, editar/ocultar/borrar tokens, lienzo Konva, partida terminada, sync entre pestañas |
| `test_player_sheet.py` | Ficha de jugador: PG (temporales, topes), monedas, inspiración, atributos y valores derivados, armas, mochila, conjuros, descansos, vista móvil |
| `test_dm_tools.py` | Grimorio, bitácora, estado de sesión, CombatTracker (iniciativa, turnos, rondas, PG, quitar/terminar) y sync DM ↔ jugador entre pestañas |
| `test_cloud_sync.py` | Modo nube contra la Firebase Emulator Suite: login real por `AuthGate` y sync en vivo entre **dos usuarios** (DM y jugadora) |

## Requisitos

- Brave en `/Applications/Brave Browser.app` (o `BRAVE_BIN=...`).
- Python con `playwright` (por defecto `/Library/Frameworks/Python.framework/Versions/3.14/bin/python3`, o `PYTHON_BIN=...`).

## Ejecutar

```bash
pnpm build                      # compila dist/
pnpm test:e2e                   # suites locales (~6 min)

# Suite de nube (opcional)
pnpm emulators                  # en otra terminal: auth 9099, firestore 8080, database 9000
pnpm build:e2e-cloud            # build apuntando a los emuladores (proyecto demo-dnd-sheet) → dist-e2e-cloud/
pnpm test:e2e:cloud
```

Ejecutar una suite o un caso concreto:

```bash
python3 tests/e2e/test_companions.py
E2E_ONLY="Invocar Familiar" python3 tests/e2e/test_companions.py
E2E_HEADED=1 python3 tests/e2e/test_player_sheet.py      # con ventana visible
python3 tests/e2e/run_all.py --cloud                     # todo + resumen
```

Variables: `E2E_DIST` (carpeta del build), `E2E_TIMEOUT` (ms por acción, 5000 por defecto),
`E2E_ONLY` (filtro por nombre), `E2E_HEADED=1`.

## Cómo funciona

- `harness.py`: lanza Brave, sirve `dist/` interceptando las peticiones (`http://local.app`) y responde
  vacío a cualquier recurso externo (tests herméticos). Cada caso falla también si la página lanzó una
  excepción JS no controlada. La suite de nube usa un servidor estático real en `127.0.0.1:4321` porque
  Chrome bloquea (Private Network Access) las llamadas desde un origen ficticio hacia los emuladores.
- `fixtures.py`: personajes, campañas y mapas semilla (modo local).
- `emulator.py` / `cloud_helpers.py`: crean usuarios y documentos en los emuladores con privilegios de
  administrador **solo para sembrar y verificar**; el flujo bajo prueba pasa siempre por la UI y las reglas.
  Solo hablan con `127.0.0.1` y el proyecto `demo-dnd-sheet`: nunca tocan Firebase real.

## Bugs conocidos (`known_bug`)

Un caso marcado con `known_bug="..."` documenta un bug real todavía sin corregir:

- **XFAIL**: el bug sigue presente; no rompe la suite.
- **XPASS**: el caso ya pasa → el bug se corrigió; quitá el `known_bug` para que vuelva a ser una prueba normal.
