# Plan de Implementación — Fase D: Tests, Verificación y Cierre

Parte de la [Spec 09](../../Specs/09-lanzamiento-y-onboarding.spec.md).

---

## Objetivo

Garantizar que todas las piezas nuevas (Landing, Modo Demo, Auth bajo demanda, Páginas legales y Footer) funcionen sin fisuras, no introduzcan regresiones en la suite de pruebas automatizadas y cumplan los criterios de cierre para habilitar la difusión y el marketing del proyecto.

---

## Tareas

- [x] **T-278** Escribir tests automatizados en `tests/landing_and_demo.test.mjs`:
  - Verificar que el HTML generado de `/index.html` contenga los elementos esenciales de la Landing Page (título, botones CTA, atribución legal de WotC).
  - Verificar que las páginas `/privacidad/index.html` y `/terminos/index.html` existan en el directorio de salida `dist/`.
  - Probar que `isFirebaseConfigured` o el flujo de modo demo inicialice correctamente el estado sin arrojar excepciones no capturadas.

- [x] **T-279** Verificación integral del sistema:
  - Ejecutar `ASTRO_TELEMETRY_DISABLED=1 pnpm build` y verificar que las nuevas rutas (`/privacidad`, `/terminos`) se generen limpiamente.
  - Ejecutar la suite de tests unitarios: `node --test tests/*.test.mjs` (asegurar 100% de tests pasando).
  - Checklist de prueba manual de conversión:
    1. Entrada anónima en ventana de incógnito: Landing visible, sin modales bloqueantes.
    2. Clic en *"Probar Demo"*: acceso instantáneo a la hoja con banner de modo demo.
    3. Clic en *"Iniciar Sesión"*: apertura fluida del modal `AuthGate`.
    4. Cierre del modal con botón `(✕)`: retorno sin recarga ni fallos de interfaz.
    5. Footer visible con enlaces legales operativos y texto de WotC SRD 5.1.

---

## Criterio de Cierre de la Etapa M1

Una vez completadas y verificadas todas las tareas de este plan, la Spec 09 se marcará como **Cerrada** en el roadmap y el proyecto estará oficialmente listo para recibir difusión, tráfico de marketing y usuarios en producción.
