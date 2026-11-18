# Plan de Implementación — Fase A: Landing Page y Portada

Parte de la [Spec 09](../../Specs/09-lanzamiento-y-onboarding.spec.md).

---

## Objetivo

Diseñar e implementar la **Landing Page** para visitantes en `src/pages/index.astro`, permitiendo que cualquier persona que llegue por primera vez comprenda inmediatamente la propuesta de valor de la plataforma antes de cualquier inicio de sesión, con un diseño oscuro pulido, llamadas a la acción claras y conmutación reactiva según el estado de la sesión.

---

## Tareas

- [x] **T-270** Crear `src/components/landing/LandingHero.astro` y `src/components/landing/LandingFeatures.astro`:
  - **Hero:**
    - Título: *"Crónicas del Aventurero — Tu Mesa de D&D 5e en Tiempo Real, 100% en Español"*.
    - Subtítulo: *"Fichas interactivas con cálculo automático de CA y modificadores, torre de dados animada con detección de críticos y pifias, grimorio táctico para Dungeon Masters y mesa virtual sincronizada entre celular y PC."*
    - Botones CTA:
      - Principal: *"Probar Demo sin Registro"* (botón dorado con brillo animado, dispara navegación a `/campaigns?demo=1`).
      - Secundario: *"Iniciar Sesión / Crear Cuenta"* (botón con borde sutil, dispara evento `open-auth-modal`).
  - **Sección de Características (Features Grid):**
    1. *Ficha Viva e Inteligente:* Modificadores automáticos, slots de inventario, sintonización de objetos y desglose de CA.
    2. *Torre de Dados Épica:* Lanzamiento animado con detección instantánea de críticos y pifias, con opción de tiradas secretas tras la pantalla.
    3. *Grimorio del Dungeon Master:* Vista táctica de todos los aventureros, control de iniciativa, eventos y combate en vivo.
    4. *Compendio Oficial Traducido:* Más de 300 hechizos, armas, armaduras y dotes del SRD 5e traducidos al español.
    5. *Multiplataforma y Tiempo Real:* Los jugadores juegan desde su móvil mientras el DM gestiona la mesa desde su laptop sin lag.

- [x] **T-271** Adaptar `src/pages/index.astro`:
  - Contenedor `#landing-view` (visible por defecto para visitantes sin sesión).
  - Contenedor `#campaigns-dashboard-view` (el contenido actual de campañas y mesas, oculto si no hay sesión iniciada).
  - Script en `index.astro` que escucha `cloud-session-changed`:
    - Si el estado es `'ready'`, muestra `#campaigns-dashboard-view` y oculta `#landing-view`.
    - Si el estado es `'signed-out'` o `'local'`, muestra `#landing-view` sin bloquear la pantalla con modales.

---

## Verificación

1. Ejecutar `pnpm build` y verificar que compile sin errores.
2. Abrir la página en incógnito (o sin sesión) y constatar que se muestra la Landing Page de forma limpia.
3. Iniciar sesión y comprobar que se visualiza el dashboard habitual con las campañas del usuario.
