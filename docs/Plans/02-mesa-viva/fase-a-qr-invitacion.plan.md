# Plan Fase A — QR de invitación (T-60, T-61)

Spec: `docs/Specs/02-mesa-viva.spec.md`, sección *4. Invitación con QR* y RF-90 a RF-92.

## 1. Contexto y objetivo

El link de invitación ya existe: el roster tiene "Copiar link", que copia `${origin}/?join=CODIGO`, y `/` (`src/pages/index.astro`) une al usuario al abrirlo. Falta:

1. **Que el código no se pierda si quien abre el link no inició sesión** (T-60). Hoy es probable que se pierda (ver diagnóstico en la sección 6).
2. **Un QR del link** para mostrar en la mesa (T-61).

Al terminar:
- Escanear el QR con un celular sin sesión → login → queda unido a la campaña, sin volver a pedir el código.
- El roster tiene "Mostrar QR" junto a "Copiar link".

Es independiente del resto de la Spec 02 y de la Etapa 0: se puede ejecutar en cualquier momento.

## 2. Prerrequisitos verificables

| Debe existir | Cómo comprobarlo |
| --- | --- |
| `cloudSession.joinByInvite(code)` | `grep -n "joinByInvite" src/scripts/data/cloudSync.ts` (línea ~622) |
| Handler de `/?join=` | `grep -n "Link de invitación" src/pages/index.astro` (líneas ~669-700, función `joinWithCode`) |
| Caja de invitación del roster | `CampaignRosterModal.astro`: `#roster-invite-box`, `#roster-invite-code`, `#roster-invite-copy-btn` (~392), `#roster-invite-regenerate-btn` |
| Regenerar código | `campaignStore.regenerateInviteCode(campaignId)` (`campaignStore.ts:1185`) |
| Evento de estado de sesión | `cloud-session-changed` con `detail.state` (`cloudSync.ts:217`) |

## 3. Decisiones vigentes

- **D1/D4/D11/D12** (ver README).
- **M2** `sessionStorage` dentro de `try/catch`.

Decisiones propias:

- **FA-1** El código pendiente se guarda en `sessionStorage` con la clave `pendingJoinCode`. `sessionStorage` y no `localStorage`: si el usuario cierra la pestaña sin loguearse, no queda un "unirse" colgado para otro día.
- **FA-2** El QR se dibuja como **SVG** (escala sin pixelarse) sobre **fondo blanco** con margen, aunque la app sea oscura: los lectores de QR fallan con colores invertidos.
- **FA-3** Nivel de corrección de errores `M` y versión automática (`typeNumber = 0`).
- **FA-4** La lógica de armar y leer el link pasa a una función pura compartida, para no duplicar la regex que hoy está en `index.astro`.

## 4. Modelo de datos

Sin cambios en Firestore ni en reglas.

```ts
// src/scripts/utils/invite.ts (nuevo, puro)
export function buildInviteLink(origin: string, code: string): string;   // `${origin}/?join=${encodeURIComponent(code)}`
export function extractJoinCode(input: string): string | null;           // acepta el código suelto o el link completo
```

## 5. Archivos

**Crear**
- `src/scripts/utils/invite.ts`
- `src/scripts/ui/qr.ts`: `renderQrSvg(text: string): Promise<string>` con `import('qrcode-generator')` dinámico.
- `tests/invite.test.mjs`

**Modificar**
- `package.json`: `pnpm add qrcode-generator`.
- `src/pages/index.astro`: unión pendiente tras el login (T-60) y uso de `extractJoinCode`.
- `src/components/campaigns/CampaignRosterModal.astro`: botón "Mostrar QR" y modal; uso de `buildInviteLink` en "Copiar link".

## 6. Pasos por tarea

### T-60 — El código sobrevive al login (RF-91)

**Diagnóstico (verificarlo primero).** Hoy `index.astro` hace:

```ts
cloudSession.ready().then(() => {
  const joinCode = new URLSearchParams(window.location.search).get('join');
  if (joinCode && cloudSession.isCloud()) {
    window.history.replaceState({}, document.title, window.location.pathname);
    joinWithCode(joinCode);
  }
});
```

Sin sesión, `ready()` se resuelve con estado `signed-out` (o por el timeout de 5 s), se borra `?join` de la URL y `joinByInvite` falla porque no hay `uid`. El login con Google es por popup (no recarga la página), así que nada vuelve a intentarlo. Reproducir: ventana privada → `/?join=CODIGO` → login → comprobar que **no** se unió.

**Arreglo.**
1. Al cargar `index.astro`, **antes** de esperar `ready()`: si hay `?join`, guardarlo con `sessionStorage.setItem('pendingJoinCode', code)` y limpiar la URL.
2. Función `tryPendingJoin()`: si `cloudSession.getUid()` existe y hay `pendingJoinCode`, lo borra del storage **primero** (para no reintentar en bucle) y llama a `joinWithCode(code)`.
3. Llamar a `tryPendingJoin()` después de `cloudSession.ready()` y en cada `cloud-session-changed` con `detail.state === 'ready'`.
4. Si el usuario está deslogueado y hay código pendiente, mostrar en el `AuthGate` un aviso: "Iniciá sesión para unirte a la campaña". Opcional: si es simple, con un `CustomEvent('auth-gate-hint', { detail: { message } })` que el `AuthGate` muestre en `#auth-info`.
5. El botón "Unirse" (`showPrompt`) pasa a usar `extractJoinCode`.

**Caso a cubrir:** si el link se abre en `/campaigns` u otra página, no hace falta soportarlo: el link siempre apunta a `/`.

### T-61 — Modal de QR (RF-90, RF-92)

1. `pnpm add qrcode-generator`. Comprobar que trae tipos (`node_modules/qrcode-generator/qrcode.d.ts`); si no, declarar un `declare module 'qrcode-generator'` mínimo en `src/env.d.ts` (`// DECISION:`).
2. `qr.ts`:
   ```ts
   export async function renderQrSvg(text: string): Promise<string> {
     const { default: qrcode } = await import('qrcode-generator');
     const qr = qrcode(0, 'M');
     qr.addData(text);
     qr.make();
     return qr.createSvgTag({ cellSize: 6, margin: 4, scalable: true });
   }
   ```
   El SVG lo genera la librería a partir del link (no hay entrada del usuario sin escapar), así que se puede insertar con `innerHTML`.
3. En `CampaignRosterModal`, junto a "Copiar link", botón `#roster-invite-qr-btn` "Mostrar QR" (ícono `qr_code_2`).
4. Modal `#invite-qr-modal`:
   - Contenedor blanco (`bg-white p-4 rounded-2xl`) con el SVG a `min(80vw, 320px)` de ancho.
   - Debajo, el código en grande (mismo estilo que `#roster-invite-code`) y el link en letra chica con botón copiar.
   - Texto: "Escaneá con la cámara del celular para unirte a {nombre de la campaña}".
   - Se cierra con la ✕, con Escape y tocando el fondo. Animación con las utilidades de `modalAnimations.ts`.
5. **Regenerar (RF-92):** después de `regenerateInviteCode`, si el modal está abierto, volver a renderizar con el código nuevo.
6. "Copiar link" pasa a usar `buildInviteLink(window.location.origin, code)`.
7. **Producción (Hostinger):** `pnpm build`, subir `dist/`, abrir el roster en el sitio real, mostrar el QR y escanearlo con un celular. Confirmar en la pestaña Network que el chunk de `qrcode-generator` se sirve con `200` desde el mismo dominio.

## 7. Tests

**`tests/invite.test.mjs`**:
- `buildInviteLink('https://x.com', 'ABC2345')` → `https://x.com/?join=ABC2345`; caracteres especiales escapados.
- `extractJoinCode`: código suelto (con espacios alrededor), link completo, link con más parámetros (`?a=1&join=XYZ`), texto sin código → `null`.

No hay reglas nuevas.

## 8. Verificación

1. `pnpm test` y `pnpm build`.
2. Manual:
   1. Ventana privada → `/?join=CODIGO` → login con email → queda unido y ve el toast "¡Te uniste…!".
   2. Lo mismo con Google (popup).
   3. Abrir el link estando ya logueado: se une directo (comportamiento actual, no se rompe).
   4. Código inválido: toast de error, y el código pendiente no queda en `sessionStorage`.
   5. DM: roster → "Mostrar QR" → escanear con un celular → abre `/?join=…`.
   6. Con el modal abierto, "Regenerar": el QR cambia y el código viejo deja de funcionar.
3. Producción: paso 7 de T-61.

## 9. Fuera de alcance

- Mostrar el QR en otras pantallas (la pantalla de mesa pasó a futuro).
- Invitaciones con vencimiento o de un solo uso.

## 10. Checklist de cierre

- [ ] T-60 y T-61 marcadas en la spec.
- [ ] `// DECISION:` para FA-1 y, si aplica, los tipos de `qrcode-generator`.
- [ ] Tests verdes, build OK y QR probado en producción.
