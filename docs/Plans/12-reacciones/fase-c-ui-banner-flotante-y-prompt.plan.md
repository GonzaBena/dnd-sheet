# Fase C — UI de Decisión en Vivo y Banner Flotante

Parte de la implementación de la [Spec 12: Reacciones en Vivo](../../Specs/12-reacciones.spec.md).

---

## Objetivo

Diseñar e implementar la experiencia de usuario para reaccionar en tiempo real fuera de turno. Cuando ocurre un evento detonante en el combate (daño o impacto declarado), la hoja del jugador muestra un banner flotante contextual (`ReactionPromptBanner.astro`) no bloqueante que permite al jugador evaluar sus opciones de reacción, seleccionar el nivel de ranura deseado si corresponde, y ejecutar la reacción o descartar el aviso con un solo clic.

---

## Requisitos que Cubre

- **RF-343:** Banner Flotante de Decisión en tiempo real (`ReactionPromptBanner`), interacción fluida y registro de combate.

---

## Tareas

### T-348: Interceptor de Eventos en Vivo (`src/scripts/ui/reactionPrompt.ts`)
- Crear `src/scripts/ui/reactionPrompt.ts` para suscribirse a los eventos del cliente:
  * Evento `character-hp-changed` o llamadas de daño en `characterStore`: si la salud disminuye y el personaje tiene reacción disponible, genera un payload `damage_taken`.
  * Evento global `reaction-opportunity`: evento disparado cuando el VTT o el DM reporta un ataque dirigido a la criatura con una tirada que impacta la CA.
- Llama a `findAvailableReactions(character, trigger)`. Si se encuentran reacciones viables (`canExecute: true`), emite el evento `'show-reaction-prompt'` con la lista de opciones y el contexto del detonante.

### T-349: Componente Visual `ReactionPromptBanner.astro`
- Crear `src/components/combat/ReactionPromptBanner.astro`:
  * Posicionamiento fijo/flotante en la zona inferior de la pantalla (accesible tanto en móvil como en escritorio).
  * Estilo pergamino oscuro acorde a la interfaz (`#121721`, bordes ámbar, animación suave de entrada/salida).
  * Encabezado con icono de relámpago `⚡` y texto del detonante: *"¡Ataque recibido! Tirada 16 impacta tu CA 14"*.
  * Botones de acción rápida para las reacciones disponibles:
    - Botón primario: ej. *"Lanzar Escudo (+5 CA) [Nivel 1]"*
    - Botón secundario si hay múltiples opciones: ej. *"Esquiva Asombrosa (Mitad de daño)"*
    - Botón de cierre / descarte rápido: *"Omitir (No reaccionar)"*.
  * Si la reacción requiere conjuro con opciones de escalado: desplegable compacto o selector de nivel de ranura.

### T-350: Ejecución desde la UI y Feedback Inmediato
- Al pulsar un botón de reacción:
  * Llama a `characterStore.executeReaction(reactionId, options)`.
  * Cierra el banner con animación de salida.
  * Muestra un toast de confirmación (`showParchmentToast` o `cloud-toast`).
  * Emite el evento a la bitácora pública de la mesa (`partyLog.ts` y `journalStore.log`) con etiqueta `#Combate` y `#Reacción`:
    *"🛡️ Gonzalo usó su Reacción para lanzar Escudo (+5 CA hasta su próximo turno). La CA aumentó a 19."*

### T-351: Integración en la Hoja de Personaje (`src/pages/campaigns.astro`)
- Incluir `ReactionPromptBanner.astro` en la plantilla de la hoja en `src/pages/campaigns.astro`.
- Asegurar que el banner respete las preferencias de alerta y no interfiera con otros modales abiertos (`DiceRollerModal`, etc.).

---

## Verificación

- Simular la recepción de un impacto o daño con reacción disponible en el navegador y comprobar que el banner aparezca de inmediato, permita lanzar *Escudo* o mitigación, descuente los recursos y se oculte tras interactuar.
