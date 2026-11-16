# Carrera de PG entre DM y jugadora (reproducción con dos navegadores)

Reproduce los cambios de PG simultáneos con dos navegadores reales (DM y jugadora, en contextos aislados) contra los emuladores de Firebase. Registra:

- el PG visible en cada pantalla, muestreado cada 100 ms;
- el estado interno de `cloudSync` (escrituras pendientes y en vuelo);
- cada escritura que cada cliente envía a Firestore, con los campos que toca;
- cada valor que confirma el servidor, visto por un observador independiente;
- los toasts de error y la consola.

No modifica código de la app: la instrumentación importa los mismos módulos que carga la página (Vite dev).

## Pasos

```sh
# 1. Emuladores
pnpm emulators

# 2. App apuntando a los emuladores (proyecto demo, no toca producción)
PUBLIC_USE_EMULATORS=true PUBLIC_FIREBASE_PROJECT_ID=demo-dnd-sheet PUBLIC_FIREBASE_API_KEY=demo-key \
PUBLIC_FIREBASE_AUTH_DOMAIN=localhost PUBLIC_EMULATOR_HOST=127.0.0.1 \
PUBLIC_FIREBASE_DATABASE_URL="http://127.0.0.1:9000?ns=demo-dnd-sheet-default-rtdb" \
pnpm exec astro dev --port 4400 --host 127.0.0.1

# 3. Datos: DM, jugadora, campaña en vivo y ficha "Lyra" con 20/30 PG
node tests/hp_concurrency/harness.mjs seed

# 4. Correr (LATENCY_MS simula latencia de red en ambos navegadores)
LATENCY_MS=200 python3 tests/hp_concurrency/run_hp_race.py --out /tmp/trace.json
python3 tests/hp_concurrency/summarize.py /tmp/trace.json
```

Escenarios: S1 jugadora −5 · S2 jugadora −1 · S3a/S3b jugadora −1, −1 (0.25 s / 1.5 s) · S4 DM −1 · S5 DM +1 · S6 jugadora −1 ×3 y DM +1 casi a la vez · S7 DM −1 sin conexión (la escritura no puede confirmarse) · recarga de ambas pantallas.

Al terminar, el script verifica los criterios de aceptación y sale con código 1 si alguno falla:

- el servidor y las dos pantallas terminan cada escenario con la suma exacta de los cambios, y siguen así tras recargar;
- en los escenarios donde todos los cambios van en la misma dirección, el valor visible nunca vuelve a uno anterior;
- un cambio único llega a la otra pantalla en menos de 2 s;
- en S7 la UI del DM vuelve al valor anterior, aparece el aviso y la jugadora nunca ve el valor rechazado;
- la bitácora tiene exactamente una entrada por cada cambio de PG.

Nota: con dos clientes escribiendo a la vez, el emulador a veces rechaza la transacción del DM con `PERMISSION_DENIED` ("evaluation error"). `runHpTransaction` lo reintenta (ver `src/scripts/data/hpTransaction.ts`), así que en la consola puede aparecer un 403 aislado sin que falle nada.
