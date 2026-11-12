# Roadmap · Hoja viva

Nov 10, 2026 · @Gonzalo Benavente

Orden de implementación de las mejoras de la hoja de personaje. Parten de [`NOTAS.notas.md`](NOTAS.notas.md) y de la conversación de ideas del 10/11. Cada etapa se convierte en **una spec** (`docs/Specs/NN-*.spec.md`) y en **planes por fase** (`docs/Plans/NN-*/`).

## Reglas

1. **Una etapa a la vez.** No se abre la spec de una etapa hasta cerrar la anterior (tests verdes y prueba manual con DM + jugador).
2. **Primero los cimientos.** Nada de armas, conjuros, dotes o reacciones arranca sin el motor de efectos y recursos (H1).
3. **La hoja avisa, no bloquea.** Las incompatibilidades (armadura sin competencia, conjuro sin componentes) se señalan y aplican sus penalizaciones, pero el DM siempre puede decidir otra cosa.
4. **Catálogo base + entradas propias.** Objetos, hechizos y dotes se cargan de un catálogo o se crean a mano, con el mismo esquema. No hay edición del catálogo por campaña por ahora.
5. **Cuidar la cuota de Firestore.** Todo lo posible se escribe en el documento del personaje y no en eventos sueltos; lo que necesite tiempo real se diseña con pocas escrituras.
6. **Cada etapa termina en algo que se puede jugar.**

## Vista general

```
H1  Cimientos ──────── motor de efectos + catálogo + modales
 │
 ├─► H2  Equipo ────── armaduras, armas, CA, compatibilidad
 │
 ├─► H3  Descansos y recursos
 │
 └─► H4  Combate en la hoja ── ataque, conjuros, ventaja, dotes
        │
        ├─► H5  Reacciones ───── aviso en vivo
        │
        └─► H6  Alcance y tokens propios ── depende del mapa y los tokens (Spec 01)

H7  Layouts DM / jugador / sin mapa   (al final; necesita cuota y decisiones previas)
```

H2 y H3 solo dependen de H1 y se pueden hacer en cualquier orden entre sí. H4 conviene después de H2 (necesita armas estructuradas) y de H3 (necesita recursos con reinicio).

## H1 · Cimientos

**Objetivo:** que la hoja entienda qué efectos están activos y de dónde vienen. Todo lo demás cuelga de esto.

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| Modelo de **efecto activo** (origen, duración, modificadores, usos, disparador) | L | Define el contrato del que dependen las demás etapas |
| Modelo de **recurso** (usos máximos y cuándo se reinicia: turno, descanso corto o largo) | M | Inspiración Bárdica, dados guardados del mago, Furia, etc. |
| **Catálogo base + entradas propias** de objetos, hechizos y dotes | L | Mismo esquema; las propias se marcan como tales |
| **Modal genérico de objeto** y **de hechizo** | M | Imagen arriba a la izquierda, título, descripción y datos. Sirve en inventario, botín y handouts |
| Panel **"Efectos activos"** con duración y botón para terminar | M | Primera pantalla visible del motor |

**Criterio de cierre:** se agrega un objeto propio y uno del catálogo, ambos se abren en el modal, y un efecto con duración aparece y expira en el panel.

## H2 · Equipo

**Objetivo:** que lo que el personaje lleva puesto afecte a sus números.

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Slots de equipo** y **sintonización** (máx. 3) | M | Cabeza, cuerpo, manos, cuello, 2 anillos, botas, capa |
| **Armaduras**: categoría, CA base, tope de DES, requisito de FUE, desventaja en Sigilo | M | Sus efectos entran al motor de H1 |
| **Compatibilidad** por competencias de clase, raza y dotes | M | Avisa y aplica penalizaciones; no bloquea |
| **Desglose de la CA** y elección de la mejor fórmula | M | Incluye Armadura sin Armadura y Armadura de Mago |
| **Armas estructuradas**: dado de daño, propiedades, alcance, bono mágico | M | Prepara H4 |

**Criterio de cierre:** al equipar una armadura pesada a un mago aparece el aviso con sus penalizaciones, y la CA queda desglosada y correcta.

## H3 · Descansos y recursos

**Objetivo:** que descansar reponga lo correcto y pida las tiradas que corresponden.

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Descanso corto** con dados de golpe: se elige cuántos gastar, se pide tirar cada dado y se suma CON | M | Soporta dados distintos por multiclase |
| **Descanso largo**: reinicia recursos y efectos "hasta el descanso", recupera la mitad de los dados | M | |
| **Dados guardados** (Portento y similares) como recurso con valores concretos | S | Se tiran en el descanso largo y se gastan para reemplazar una tirada |
| **Resumen** del descanso ("recuperaste 14 PG, 2 espacios de nivel 1…") | S ⚡ | |

**Criterio de cierre:** un descanso corto y uno largo reponen todo lo que corresponde y muestran el resumen.

## H4 · Combate en la hoja

**Objetivo:** que atacar y lanzar conjuros respete las reglas sin que el jugador lleve la cuenta a mano.

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Selector de modificadores** al atacar (qué efectos aplicar al impacto) y consumo de "1 vez por turno" | L | Si el primer ataque falla, el efecto sigue disponible para el segundo |
| **Validación de conjuros**: espacio del nivel adecuado, componentes V/S/M, estado del personaje, nivel superior, rituales | L | Descuenta el espacio al lanzar |
| **Concentración**: una a la vez, aviso al lanzar otra, salvación al recibir daño | M | |
| **Ventaja y desventaja explicadas**: la tirada muestra por qué | M | Se calcula con condiciones, efectos y armadura |
| **Dotes** con efectos pasivos y condicionales | L | Precisión Élfica solo hace efecto con ventaja |
| **Rasgos** clasificados como activo, reacción, pasivo o condicional, con búsqueda | M | |
| **Efectos de toque y de hablar**: exigir poder tocar al objetivo o poder hablar | S | Se apoya en las condiciones del personaje |

**Criterio de cierre:** un ataque múltiple con un efecto de una vez por turno lo consume una sola vez, y un conjuro sin espacio del nivel adecuado no se puede lanzar.

## H5 · Reacciones

**Objetivo:** que las reacciones se ofrezcan en el momento justo, aunque el turno sea de otro.

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Disparadores** declarados por el DM y aviso al jugador con una reacción compatible | L | Reusa el aviso de turno ya hecho |
| **Una reacción por ronda**, con recuperación al inicio del turno | M | Las demás quedan atenuadas |
| **Tiempo límite opcional** por campaña, con "no usar" por defecto | S | |
| Reacciones de ejemplo: Escudo, desviar estados de miedo, Capa de Desplazamiento | M | |

**Riesgo:** es lo que más cuota consume. Hay que definir en la spec un solo documento de "disparador activo" por mesa.

**Criterio de cierre:** el DM declara un ataque, el jugador con Escudo ve el aviso, lo acepta y la CA sube solo para ese ataque.

## H6 · Alcance y tokens propios

**Objetivo:** que la hoja sepa dónde está cada quien. Depende del mapa y los tokens de la Spec 01 (Fases 2 y 3).

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Filtro por distancia**: el botón de atacar solo aparece en objetivos que se alcanzan, y al elegir uno se ve solo lo usable a esa distancia | L | Incluye aliados, para boosts y curaciones |
| **Desventaja a distancia** con enemigos adyacentes y alcance largo | S | |
| **Tokens controlados por el jugador** (ilusiones, no muertos, compañeros) con dueño | M | Solo el creador y el DM los mueven; si termina la concentración, desaparecen |
| **Celdas de movimiento** según la velocidad y las ya gastadas en el turno | M | Terreno difícil y velocidades alternativas |
| Aviso de **ataque de oportunidad** al salir del alcance | S | |

**Criterio de cierre:** un personaje con alcance de 30 pies no puede atacar a un enemigo a 120, y el mapa resalta hasta dónde puede moverse.

## H7 · Layouts de DM, jugador y modo sin mapa

**Objetivo:** que cada rol vea lo que necesita y que la campaña funcione sin mapa.

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Layout de DM**: mapa, iniciativa, monstruos, efectos de todos, bitácora y botín | L | |
| **Layout de jugador**: hoja y acciones en primer plano, mapa como apoyo | L | |
| **Ajuste de campaña "sin mapa"** (teatro de la mente) | M | Cambia el layout y quita el mapa |
| **Rangos abstractos** (cuerpo a cuerpo, cerca, lejos, muy lejos) como alternativa a las coordenadas | M | El filtro de H6 debe aceptar ambos modelos |

**Antes de arrancar:** decidir que el motor de alcance de H6 se diseñe ya para aceptar rangos abstractos, para no rehacerlo aquí.

**Criterio de cierre:** una campaña sin mapa se juega entera, y el DM y los jugadores ven layouts distintos.

## Ideas sueltas (sin etapa)

Se asignan a una etapa cuando haga falta:

- Historial de tiradas con filtro y reroll con recurso (Suerte, Inspiración).
- Inventario con peso, capacidad de carga y objetos con cargas (varitas, pociones).
- Selector de condiciones que aplique sus efectos mecánicos (Aturdido, Hechizado, Agotamiento por niveles).
- Indicador de lo que queda en el turno: acción, adicional, reacción, movimiento, interacción con objeto.
- Modo "turno rápido" para móvil, con lo que se hace ahora arriba y el resto plegado.
- Tiempos de ponerse y quitarse la armadura.
- Oferta "Crear ataque" en la UI al equipar un arma de la mochila (la lógica ya existe: `characterStore.createAttackFromWeapon`); hoy la mochila no equipa armas.

## Estado de las specs

| Spec | Etapa | Estado |
| --- | --- | --- |
| [07 — Cimientos de la hoja](Specs/07-cimientos-de-la-hoja.spec.md) | H1 | Hecha (H1 cerrada) |
| [08 — Equipo](Specs/08-equipo.spec.md) | H2 | Cerrada (H2 cerrada; la UI de "Crear ataque" quedó diferida) |
| 09 — Descansos y recursos | H3 | Por escribir |
| 10 — Combate en la hoja | H4 | Por escribir |
| 11 — Reacciones | H5 | Por escribir |
| 12 — Alcance y tokens propios | H6 | Por escribir |
| 13 — Layouts y modo sin mapa | H7 | Por escribir |

Los rangos de IDs de cada spec nueva se asignan al abrirla, a partir del 230 (las anteriores llegan hasta RF-213 y T-116).

## Próximo paso

H1 y H2 cerradas (Specs 07 y 08 hechas). Siguiente: escribir la Spec 09 — Descansos y recursos (H3).
