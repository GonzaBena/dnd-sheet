# Spec: Personajes vivos — dnd.gonzabena.com.ar

Nov 9, 2026 · @Gonzalo Benavente

> **Borrador.** Define objetivo, requisitos y fases a grandes rasgos. Se completa (modelo de datos, reglas exactas, cuotas, criterios) cuando la Spec 03 esté implementada, porque depende de su modelo de eventos y sesiones.

Etapa 3 del [roadmap](../ROADMAP-vtt.md). Ideas I-12, I-21 e I-22 de [`IDEAS.md`](../IDEAS.md).

## Objetivo y alcance

Generar **apego al personaje**: que cada jugador sienta que su personaje tiene historia, números propios y vínculos, como el protagonista de una serie.

**Dentro del alcance**

- Estadísticas de personaje y de grupo, y premios de fin de sesión (I-12).
- Evolución del personaje: línea de tiempo y retratos por etapa (I-21).
- Relaciones entre personajes y PNJs (I-22).

**Fuera del alcance**

- Compartir estadísticas fuera de la app (imagen para redes): candidato a una versión posterior.
- Salvaciones contra la muerte: ya están en la Spec 03 (Fase E).

**Depende de:** Spec 03 (eventos, `diceRoll` estructurado, sesiones). Las relaciones (I-22) no dependen de nada y pueden adelantarse.

## 1. Estadísticas (I-12)

**De dónde salen**

- Las tiradas, de la bitácora con `diceRoll` estructurado (Spec 03, RF-105).
- Los caídos, críticos, subidas de nivel, etc., de `events`.

**Cómo se calculan (propuesta)**

Recalcular todo leyendo la bitácora cada vez sería caro. Propuesta: al **cerrar una sesión** (pausa larga o sesión nueva), el cliente del DM calcula los números de esa sesión una sola vez y los guarda en `sessions/{n}.stats`. Los totales de campaña y de personaje son la suma de las sesiones. Hay que definir un recálculo manual por si se corrige algo después.

**Estadísticas por personaje (v1)**

- Críticos y pifias (y "dado maldito" / "dado bendito": promedio del d20 natural contra 10,5).
- Mayor daño en una tirada.
- Ataques que impactaron sobre el total.
- Veces que cayó, que fue estabilizado y salvaciones superadas.
- Enemigos derrotados en su turno (aproximado).
- Sesiones jugadas.

**Premios de fin de sesión**

Al cerrar la sesión: "MVP" (más daño), "El más castigado" (más daño recibido o caídas), "Bendecido por los dados", "Maldito por los dados". Se muestran como una escena (motor de la Spec 03) y quedan en el episodio.

## 2. Evolución del personaje (I-21)

- Línea de tiempo en la hoja: niveles (desde `level_up`), momentos (Spec 03), objetos importantes y cicatrices.
- **Retratos por etapa:** al cambiar el avatar, el anterior se conserva con su nivel y episodio. La línea de tiempo muestra cómo cambió el personaje.
- **Objetos importantes y cicatrices:** eventos nuevos registrados a mano (por el jugador o el DM), por ejemplo "Obtuvo la Espada de Valdris" o "Perdió un ojo contra el dragón".

## 3. Relaciones (I-22)

- Vínculos entre PJs y con PNJs: aliado, rival, deuda, mentor, amor, enemigo, o uno libre.
- Hoy no existe un modelo de PNJ: hace falta uno mínimo (nombre, retrato opcional, nota, visible u oculto para los jugadores).
- Cada jugador edita los vínculos de su personaje; el DM, los de todos y los PNJs.
- Vista: lista por personaje y un grafo simple de la campaña.

## Requisitos (borrador)

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-140 | Al cerrar una sesión se calculan y guardan las estadísticas de esa sesión. | M |
| RF-141 | La hoja muestra las estadísticas del personaje (campaña y sesión). | M |
| RF-142 | `/partida` muestra las estadísticas del grupo. | S |
| RF-143 | Al cerrar la sesión se otorgan y muestran los premios. | M |
| RF-150 | La hoja muestra la línea de tiempo del personaje. | M |
| RF-151 | Los retratos anteriores se conservan con su nivel y episodio. | S |
| RF-152 | Jugador y DM registran objetos importantes y cicatrices. | S |
| RF-160 | Existe un modelo mínimo de PNJ gestionado por el DM. | M |
| RF-161 | Jugadores y DM crean vínculos con tipo y nota. | M |
| RF-162 | Grafo de relaciones de la campaña. | S |

## Fases (borrador)

- **Fase A — Estadísticas:** cálculo al cerrar sesión, vistas de personaje y grupo.
- **Fase B — Premios:** reglas de premios con tests, escena de premios.
- **Fase C — Evolución:** línea de tiempo, historial de retratos, objetos y cicatrices.
- **Fase D — Relaciones:** modelo de PNJ, vínculos, lista y grafo. Independiente: se puede hacer antes.

## Preguntas abiertas

- [ ] **Cálculo de estadísticas.** ¿Al cerrar la sesión (propuesta) o en vivo durante la sesión? En vivo es más vistoso pero suma escrituras por tirada.
- [ ] **Premios.** ¿Los cuatro propuestos? ¿Querés que el DM pueda otorgar un premio propio ("Mejor actuación")?
- [ ] **Visibilidad de estadísticas.** ¿Cada jugador ve las de todos, o solo las suyas y las del grupo?
- [ ] **PNJs.** ¿Alcanza con nombre, retrato y nota, o querés fichas de PNJ más completas (lo que se acercaría a la "preparación de sesión" descartada)?
- [ ] **Vínculos privados.** ¿Un jugador puede tener vínculos que solo ven él y el DM?
