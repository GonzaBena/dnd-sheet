# Roadmap · VTT, memoria y relato (anterior)

Nov 9, 2026 · @Gonzalo Benavente

Orden de implementación de las ideas de [`IDEAS.md`](IDEAS.md). Cada etapa se convierte en **una spec** (`docs/Specs/NN-*.spec.md`) y en **planes por fase** (`docs/Plans/NN-*/`), igual que la Spec 01.

## Reglas

1. **Una etapa grande a la vez.** No se abre la spec de una etapa hasta cerrar la anterior (tests verdes y prueba manual con DM + jugador).
2. **Victorias rápidas intercalables.** Las ideas de tamaño **S** marcadas como ⚡ se pueden meter entre fases de otra etapa si no tocan los mismos archivos.
3. **Primero los cimientos.** Nada del bloque "memoria" (estadísticas, crónica, previously on) arranca sin el registro de eventos (I-10).
4. **Cada etapa termina en algo que se puede jugar.** Al cerrarla, el grupo tiene que notar la diferencia en la próxima sesión.

## Vista general

```
Etapa 0  VTT mínimo (Spec 01, fases 2–3)
   │
Etapa 1  Mesa viva ──────────────── Spec 02
   │
Etapa 2  Memoria: cimiento ──────── Spec 03   (I-10 es la base de todo lo que sigue)
   │
   ├──► Etapa 3  Personajes vivos ── Spec 04
   │
   └──► Etapa 4  Crecimiento ─────── Spec 05   (independiente; se puede adelantar)
           │
Etapa 5  El relato ──────────────── Spec 06   (crónica + "Previously on…", lo último)

En paralelo, cuando haga falta: Spec 01 fases 4 (niebla) y 5 (extras).
```

## Etapa 0 — VTT mínimo · *en curso*

**Objetivo:** que se pueda jugar online con un mapa y tokens, para que nadie se vaya por no tenerlo.

| Incluye | Ya está |
| --- | --- |
| Spec 01, Fase 2 (mapa estático) y Fase 3 (tokens en vivo) | Fases 0, 0B y 1 (base, estado de partida, combate) |

**Criterio de cierre:** el DM sube un mapa y los jugadores mueven sus tokens en vivo desde otro navegador.

La Fase 4 (niebla) y la Fase 5 (extras: notas, ping, regla de medición, handouts…) **no bloquean** las etapas siguientes: se hacen cuando un grupo real las pida.

## Etapa 1 — Mesa viva · [Spec 02](Specs/02-mesa-viva.spec.md)

**Objetivo:** que la app se sienta hecha para la mesa física. Aprovecha el combate, que ya está hecho.

| Idea | Tamaño | Nota |
| --- | --- | --- |
| I-02 Aviso de turno | S ⚡ | Lo primero: es barato y se nota enseguida. Incluye "pantalla siempre encendida", adelantada de I-03 |
| I-42 Invitación por link y QR | S ⚡ | El link ya existe; falta el QR. Independiente: se puede hacer incluso durante la Etapa 0 |
| I-06 Terminar mi turno desde el celular | S | Requiere una regla nueva sobre `combat/current` |
| I-30 Susurros del DM a un jugador | S ⚡ | También en pausa. Revisar el solapamiento con los handouts (Spec 01, T-52) |

**Criterio de cierre:** en una sesión, los jugadores reciben el aviso de su turno, terminan su turno y reciben los susurros del DM desde el celular, y un jugador nuevo entra escaneando el QR.

## Etapa 2 — Memoria: cimiento · [Spec 03](Specs/03-memoria-cimiento.spec.md)

**Objetivo:** que la partida empiece a "recordar" sola. Es la etapa más importante en arquitectura.

| Idea | Tamaño | Nota |
| --- | --- | --- |
| I-10 Registro de eventos estructurado | L | Primero. Define el modelo `events` y quién lo escribe (dados, combate, hitos) |
| I-24 Sesiones como episodios | S | Botón "Sesión nueva" (solo en pausa) y recordatorio a las 12 h. Título **opcional** por sesión, editable en cualquier momento (incluso con la partida terminada); tarjeta al iniciar |
| I-20 Escenas en momentos clave | M | Crítico, pifia, KO, muerte, subida de nivel, emitidos a todos |
| I-11 Momentos épicos | M | Detección automática + "marcar como momento" del DM |
| Salvaciones contra la muerte | M | Agregadas a la hoja; generan los eventos de estabilizado, muerte y "vuelve en sí" |

**Criterio de cierre:** después de una sesión, la campaña muestra un timeline con sus momentos, sin que nadie los haya escrito a mano.

**Riesgo:** cuota de Firestore. Hay que definir en la spec qué se guarda como evento y qué no (no cada tirada de habilidad).

## Etapa 3 — Personajes vivos · [Spec 04](Specs/04-personajes-vivos.spec.md) *(borrador)*

**Objetivo:** apego al personaje.

| Idea | Tamaño | Nota |
| --- | --- | --- |
| I-12 Estadísticas de personaje y de grupo | M | Incluye los premios de fin de sesión |
| I-21 Evolución del personaje | M | Usa los retratos (I-23) y los eventos |
| I-22 Relaciones entre personajes | M | No depende de I-10; se puede mover |

## Etapa 4 — Crecimiento · [Spec 05](Specs/05-crecimiento.spec.md) *(borrador)*

**Objetivo:** que lleguen grupos nuevos y que los novatos no se pierdan. Es independiente de las Etapas 2 y 3; se puede adelantar si aparece un grupo nuevo para probar.

| Idea | Tamaño | Nota |
| --- | --- | --- |
| I-03 Modo mesa (celular minimalista) | M | |
| I-41 Onboarding para jugadores nuevos | M | |
| I-40 Español nativo | continuo | Se trabaja en cada etapa, no tiene cierre propio |

## Etapa 5 — El relato · [Spec 06](Specs/06-el-relato.spec.md) *(borrador)*

**Objetivo:** cerrar el círculo: la campaña se cuenta sola.

| Idea | Tamaño | Nota |
| --- | --- | --- |
| I-13 Crónica exportable | L | Página tipo libro + PDF |
| I-14 "Previously on…" | M | Al reanudar una partida pausada o al iniciar una sesión nueva. v1 sin IA |

**Pregunta abierta:** si se quiere un resumen con IA, hace falta backend (Cloud Function o similar) y un costo por uso. Decidirlo al escribir la Spec 06.

## Fuera del roadmap

| Idea | Estado | Motivo |
| --- | --- | --- |
| I-05 Escaneo de dados con la cámara | ❌ | Se usan dados propios con carga manual o dados digitales |
| I-31 Preparar la sesión en 10 minutos | ❌ por ahora | Complejidad alta para el valor actual |
| I-32 Calendario y asistencia | ⏳ | WhatsApp lo resuelve hoy |
| I-01 Pantalla de mesa (tablet / TV) | ⏳ | Fuera del MVP: online ya se ve todo en `/partida`, y en persona los grupos usan tablero físico, no TV ni proyector |

## Estado de las specs

| Spec | Etapa | Estado |
| --- | --- | --- |
| [01 — VTT y panel de DM](Specs/01-dm-panel.spec.md) | 0 | Fases 0, 0B y 1 hechas; 2–5 pendientes |
| [02 — Mesa viva](Specs/02-mesa-viva.spec.md) | 1 | Completa, con [planes](Plans/02-mesa-viva/README.md) listos |
| [03 — Memoria: cimiento](Specs/03-memoria-cimiento.spec.md) | 2 | Completa, con preguntas abiertas |
| [04 — Personajes vivos](Specs/04-personajes-vivos.spec.md) | 3 | Borrador: se completa al cerrar la Spec 03 |
| [05 — Crecimiento](Specs/05-crecimiento.spec.md) | 4 | Borrador: independiente |
| [06 — El relato](Specs/06-el-relato.spec.md) | 5 | Borrador: se completa al cerrar las Specs 03 y 04 |

Numeración de IDs: cada spec usa su propio rango (Spec 02: RF/T-60…99; Spec 03: 100…139; Spec 04: 140…169; Spec 05: 170…199; Spec 06: 200…).

## Próximo paso

Terminar la Etapa 0 (planes de la Spec 01, Fases 2 y 3). Después, ejecutar los planes de la Spec 02 (`docs/Plans/02-mesa-viva/`); su Fase A (QR) se puede hacer antes.
