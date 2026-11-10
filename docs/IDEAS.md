# Ideas — qué nos distingue de Roll20 y compañía

Nov 9, 2026 · @Gonzalo Benavente

Catálogo de ideas surgido del brainstorming. **No es una spec**: cada idea se baja a una spec cuando entra en el roadmap ([`ROADMAP.md`](ROADMAP-vtt.md)).

## Posicionamiento

> **La app que acompaña la partida y la convierte en recuerdo.**
> Pensada primero para la mesa física (dados reales, celular al lado), con un VTT simple para jugar online.

- **El mapa con tokens es paridad, no diferencial.** Existe para que nadie se vaya por no tenerlo (Spec 01). No se persigue competir con Roll20 o Foundry en iluminación, línea de visión, módulos, etc.
- **El diferencial es lo que pasa alrededor del mapa:** la mesa física, la memoria de la campaña y personajes que se sienten vivos, "como ver una serie o un anime".
- **En español de verdad**, para gente que recién empieza también.

## Estados

| Estado | Significado |
| --- | --- |
| ✅ Hecho | Ya existe en el repo |
| 🟢 Aprobada | Entra al roadmap |
| ⏳ Futuro | Buena idea, pero no ahora |
| ❌ Descartada | Decidido no hacerla |

Tamaño: **S** (días), **M** (1–2 semanas), **L** (más de 2 semanas).

---

## A. La mesa física como protagonista

| ID | Idea | Tamaño | Estado | Depende de |
| --- | --- | --- | --- | --- |
| I-01 | Pantalla de mesa (tablet / TV) | M | ⏳ | Combate (Spec 01, Fase 1) |
| I-02 | Aviso de turno en el celular | S | 🟢 | Combate (Spec 01, Fase 1) |
| I-03 | Modo mesa: celular minimalista | M | 🟢 | — |
| I-04 | Dados físicos con resultado manual, o dados digitales | — | ✅ | — |
| I-05 | Escaneo de dados con la cámara | — | ❌ | — |
| I-06 | Terminar mi turno desde el celular | S | 🟢 | Combate (Spec 01, Fase 1) |

**I-01 — Pantalla de mesa.** Vista de solo lectura a pantalla completa, para una tablet en el centro de la mesa o una TV: iniciativa en grande, turno actual y el siguiente, ronda, y el estado de los enemigos por umbral ("ileso", "herido", "malherido", "al borde") sin mostrar PG exactos (respeta `hiddenHp`). Opcionalmente, el mapa activo.

*Futuro, fuera del MVP:* online, `/partida` ya muestra mapa, combate y turnos a todos; en persona, los grupos suelen usar un tablero físico y no una TV o un proyector. Se retoma si aparece un grupo que juegue con pantalla compartida.

**I-02 — Aviso de turno.** Cuando el turno pasa a tu personaje: banner, vibración (`navigator.vibrate`) y sonido opcional. Aviso suave de "sos el siguiente". En v1 funciona con la app abierta; las notificaciones push (FCM) quedan para después.

**I-03 — Modo mesa.** Vista compacta para tener el celular apoyado sin que se coma la atención: PG, slots de conjuro, inspiración, condiciones y un botón de tirada. Pantalla siempre encendida (Wake Lock API): esta parte se adelantó a la Spec 02 (RF-66); el resto queda para la Etapa 4.

**I-06 — Terminar mi turno.** El jugador pasa su propio turno desde el celular, como una acción más ("terminé"), sin depender de que el DM avance. Solo el dueño del combatiente actual, y solo un lugar; el DM puede deshacerlo con "turno anterior". Especificada en la Spec 02.

**I-05 — Descartada.** Los jugadores usan sus dados y cargan el resultado (como hoy) o usan los digitales.

## B. La campaña como memoria

| ID | Idea | Tamaño | Estado | Depende de |
| --- | --- | --- | --- | --- |
| I-10 | Registro de eventos estructurado (cimiento) | L | 🟢 | — |
| I-11 | Momentos épicos | M | 🟢 | I-10 |
| I-12 | Estadísticas de personaje y de grupo | M | 🟢 | I-10 |
| I-13 | Crónica exportable | L | 🟢 | I-10, I-11 (I-24 si existe) |
| I-14 | "Previously on…" | M | 🟢 (último) | I-10, I-11 (I-24 si existe) |

**I-10 — Registro de eventos estructurado.** Es la base de casi todo este bloque. Hoy la bitácora (`campaigns/{cid}/journal`) es texto libre con un `diceRoll` opcional: sirve para leer, pero no para calcular estadísticas ni detectar momentos. Se agrega un registro de eventos tipados, generado **automáticamente** por las tiradas y el combate: crítico, pifia, golpe que deja KO, muerte, salvación contra la muerte, subida de nivel, hito, curación, etc. Cada evento lleva actor, objetivo, sesión, ronda y valores. Hay que vigilar la cuota gratuita de Firestore (escrituras por tirada).

**I-11 — Momentos épicos.** Detección automática a partir de I-10 ("Nat 20 de Lyra contra el dragón, sesión 7") y un botón para que el DM marque cualquier evento como momento. Timeline por campaña y por personaje.

**I-12 — Estadísticas.** Por personaje: mayor daño en un golpe, críticos y pifias, veces que cayó, "dado maldito". Por grupo: premios de fin de sesión (MVP, el más castigado, el más afortunado). Contenido pensado para compartir.

**I-13 — Crónica exportable.** Al cerrar un arco o la campaña, una página tipo libro (y PDF) con los episodios (I-24), los momentos (I-11) y los retratos.

**I-14 — "Previously on…".** Lo último en agregarse. Aparece al **reanudar una partida pausada** (`paused` → `active`) o al **iniciar una sesión nueva**. Primera versión sin IA: se arma con el título del episodio (si lo tiene), los hitos y los momentos de la sesión anterior. Una versión con IA requiere backend (hoy no hay servidor propio): pregunta abierta.

## C. Personajes vivos ("como una serie o un anime")

| ID | Idea | Tamaño | Estado | Depende de |
| --- | --- | --- | --- | --- |
| I-20 | Escenas en momentos clave (juice) | M | 🟢 | I-10 (ideal) |
| I-21 | Evolución del personaje | M | 🟢 | I-10 |
| I-22 | Relaciones entre personajes | M | 🟢 | — |
| I-23 | Retratos de personaje | — | 🔨 En curso | — |
| I-24 | Sesiones como episodios | S | 🟢 | Estado de partida (Spec 01, Fase 0B) |

**I-20 — Escenas en momentos clave.** Animaciones tipo "cutscene", transmitidas a toda la mesa: crítico, pifia, KO, muerte, estabilización, subida de nivel. Extiende lo que ya existe (`diceJackpotAnimation.ts`, `MilestoneCelebrationModal`). Es lo que genera el recuerdo.

**I-21 — Evolución del personaje.** Línea de tiempo con niveles, objetos legendarios, cicatrices y retratos por etapa.

**I-22 — Relaciones.** Vínculos entre PJs y PNJs (aliado, rival, deuda, amor…), editables por el jugador y el DM. Vista de grafo simple.

**I-23 — Retratos.** En curso (`characterAvatars.ts`, `public/characters/`).

**I-24 — Sesiones como episodios.** *(Idea nueva.)* El DM puede ponerle título a cada sesión. Al iniciarla, todos ven una tarjeta "Episodio 7: La caída de Valdris". Es barata, refuerza la sensación de serie y le da estructura a I-13 e I-14.

- **Opcional:** si no hay título, la tarjeta muestra solo "Sesión 7" (o directamente no aparece), y nada depende de que exista.
- **Editable en cualquier momento:** antes, durante o después de la sesión, incluso con la partida terminada. Así el DM puede bautizarla al final, cuando ya sabe qué pasó, o semanas después.
- I-13 e I-14 usan el título si existe y, si no, el número de sesión.

## D. Herramientas del DM

| ID | Idea | Tamaño | Estado | Depende de |
| --- | --- | --- | --- | --- |
| I-30 | Susurros del DM a un jugador | S | 🟢 | Bitácora |
| I-31 | Preparar la sesión en 10 minutos | L | ❌ por ahora | — |
| I-32 | Calendario y asistencia | M | ⏳ | — |

**I-30 — Susurros del DM.** Ya existe jugador → DM (`visibility: 'to_dm'`). Falta el camino inverso: el DM escribe a un jugador concreto ("Vos notás algo raro en el posadero…"), con aviso en el celular del destinatario. Requiere un destinatario en la entrada (por ejemplo `visibility: 'to_player'` + `recipientUid`) y su regla. Revisar el solapamiento con los handouts de la Spec 01 (Fase 5, T-52).

**I-31 — Descartada por ahora.** Es compleja para el valor que aporta hoy.

**I-32 — Futuro.** Hoy los grupos lo resuelven por WhatsApp y el DM maneja las ausencias en la ficción.

## E. Comunidad y crecimiento

| ID | Idea | Tamaño | Estado | Depende de |
| --- | --- | --- | --- | --- |
| I-40 | Español nativo de punta a punta | continuo | 🟢 | — |
| I-41 | Onboarding para jugadores nuevos | M | 🟢 | — |
| I-42 | Invitación por link y QR | S | 🟢 | — |

**I-40 — Español nativo.** Términos de 5e consistentes en castellano y SRD traducido (ampliar `dndTranslations.ts`). Es un trabajo continuo, no una entrega.

**I-41 — Onboarding.** Glosario y tooltips en la hoja ("¿Qué es una tirada de salvación?"), y un primer recorrido para quien nunca jugó.

**I-42 — Link y QR.** El link de invitación ya existe (`/?join=CODIGO`, botón "Copiar link" en `CampaignRosterModal`). Falta el QR de ese link para mostrar en la mesa, y verificar que el código no se pierda si quien lo abre todavía no inició sesión.

## F. VTT (paridad mínima)

Ya está especificado y planificado en [`Specs/01-dm-panel.spec.md`](Specs/01-dm-panel.spec.md) y [`Plans/01-dm-panel/`](Plans/01-dm-panel/README.md). Hechas: Fases 0, 0B y 1. Pendientes: Fases 2 (mapa), 3 (tokens en vivo), 4 (niebla) y 5 (extras).
