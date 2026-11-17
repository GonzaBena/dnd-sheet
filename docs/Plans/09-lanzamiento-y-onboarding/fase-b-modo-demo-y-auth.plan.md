# Plan de Implementación — Fase B: Modo Demo y Auth Bajo Demanda

Parte de la [Spec 09](../../Specs/09-lanzamiento-y-onboarding.spec.md).

---

## Objetivo

Permitir que un usuario explore la hoja de personaje y la campaña de ejemplo en modo local sin crearse una cuenta ni conectarse a Firebase de forma obligatoria, transformando el `AuthGate` en un modal bajo demanda con botón de cierre.

---

## Tareas

- [x] **T-272** Implementar el soporte de "Modo Demo" en la capa de datos:
  - En `src/scripts/data/cloudSync.ts`, contemplar un estado `'demo'` o respetar la bandera `localStorage.getItem('dnd_demo_mode') === '1'` o el parámetro en URL `?demo=1`.
  - Cuando el usuario entra en Modo Demo, inicializar una campaña local prehecha y una ficha de demostración (ej. un guerrero o mago de nivel 3 con armas, armaduras y equipo ya equipado).
  - Asegurar que `characterStore` y `campaignStore` no intenten sincronizar con Firestore en este modo, evitando advertencias de permisos o desconexiones en consola.

- [x] **T-273** Crear componente `src/components/ui/DemoNoticeBanner.astro`:
  - Ubicado en la parte superior fija de la pantalla en `/campaigns` cuando esté activo el modo demo.
  - Diseño: fondo degradado ámbar/carbón, borde dorado sutil, texto claro:
    *"Estás explorando en Modo Demo (los cambios se guardan solo en este navegador). Creá tu cuenta gratis para jugar en vivo y guardar tus personajes en la nube."*
  - Botón: *"Guardar en la Nube / Crear Cuenta"* que emite el evento global `window.dispatchEvent(new CustomEvent('open-auth-modal', { detail: { mode: 'signup' } }))`.
  - Botón para cerrar o atenuar el banner si el usuario desea pantalla completa.

- [x] **T-274** Modificar `src/components/auth/AuthGate.astro`:
  - Agregar botón de cierre `(✕)` en la esquina superior derecha del modal.
  - Escuchar eventos personalizados `window.addEventListener('open-auth-modal', (e) => ...)` para abrir el modal cuando el usuario lo solicite explícitamente desde cualquier botón de la interfaz.
  - En la carga inicial de la aplicación, **no mostrar automáticamente** el modal bloqueante si el usuario está en la página principal `/` o en `/campaigns?demo=1`.
  - Solo mostrarlo de forma obligatoria si el usuario navega a una sala de partida online privada que exija UID de jugador.

---

## Verificación

1. Hacer clic en *"Probar Demo sin Registro"* desde la Landing Page.
2. Confirmar que se carga la hoja de personaje en `/campaigns` con datos jugables, tiradas de dados operativas y el banner superior de aviso.
3. Hacer clic en *"Crear Cuenta"* desde el banner y comprobar que el modal de autenticación se abre correctamente.
4. Hacer clic en el botón de cierre `(✕)` del modal de autenticación y verificar que se regresa a la hoja sin bloqueos.
