# Spec: Crecimiento — dnd.gonzabena.com.ar

Nov 9, 2026 · @Gonzalo Benavente

> **Borrador.** Define objetivo, requisitos y fases a grandes rasgos. Se completa cuando llegue su etapa. Es independiente de las Specs 03 y 04: se puede adelantar si aparece un grupo nuevo para probar.

Etapa 4 del [roadmap](../ROADMAP-vtt.md). Ideas I-03, I-41 e I-40 de [`IDEAS.md`](../IDEAS.md).

## Objetivo y alcance

Que lleguen **grupos nuevos** y que quien nunca jugó no se pierda: la app tiene que ser cómoda en el celular durante la partida, explicar lo que hace falta y estar en un español natural de punta a punta.

**Dentro del alcance**

- Modo mesa: vista compacta de la hoja para la partida (I-03). La pantalla siempre encendida ya se hizo en la Spec 02.
- Onboarding para jugadores nuevos: glosario, ayudas en la hoja y primer recorrido (I-41).
- Español nativo: términos consistentes y contenido del SRD traducido (I-40).

**Fuera del alcance**

- Otros idiomas.
- Otros sistemas de juego (Pathfinder, etc.).

## 1. Modo mesa (I-03)

- Vista compacta de la hoja, pensada para tener el celular apoyado: PG (con botones rápidos de daño y curación), CA, slots de conjuro, inspiración, condiciones activas y un botón de tirada.
- Se activa con un botón en la hoja; la elección se recuerda por dispositivo.
- Si hay combate activo, muestra arriba el turno actual y el botón "Terminar turno" (Spec 02).
- Todo lo demás de la hoja queda a un toque ("Ver hoja completa").

## 2. Onboarding (I-41)

- **Glosario** en español: tirada de salvación, ventaja, CA, concentración, acción adicional, etc. Un archivo de datos, no una base de datos.
- **Ayudas en la hoja:** un ícono "?" junto a cada concepto abre su definición del glosario. Se pueden ocultar ("Ya sé jugar").
- **Primer recorrido:** al entrar por primera vez a la hoja, 4 a 6 pasos que muestran qué es cada sección. Se puede saltear y repetir.
- **Para el DM:** un recorrido corto del panel (iniciar partida, combate, susurros).

## 3. Español nativo (I-40)

- **Auditoría de términos:** unificar la traducción de cada concepto de 5e en toda la app (ampliar `src/scripts/dnd/dndTranslations.ts`, 226 líneas hoy).
- **Contenido del SRD:** hoy el compendio consulta `https://www.dnd5eapi.co/api`, que está en inglés. Hay que decidir de dónde sale el contenido en español (ver *Preguntas abiertas*).
- Es un trabajo continuo: cada spec nueva respeta el glosario de términos.

## Requisitos (borrador)

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-170 | La hoja tiene un modo mesa compacto con PG, CA, slots, inspiración, condiciones y tirada. | M |
| RF-171 | En modo mesa con combate activo se ven el turno y "Terminar turno". | S |
| RF-180 | Existe un glosario de términos de 5e en español. | M |
| RF-181 | Los conceptos de la hoja tienen ayuda contextual que se puede ocultar. | M |
| RF-182 | Primer recorrido de la hoja para jugadores nuevos, salteable y repetible. | S |
| RF-183 | Recorrido corto del panel del DM. | S |
| RF-190 | Los términos de 5e son consistentes en toda la app. | M |
| RF-191 | El compendio muestra contenido del SRD en español. | S |

## Fases (borrador)

- **Fase A — Glosario y ayudas:** archivo de glosario, íconos "?" en la hoja.
- **Fase B — Modo mesa.**
- **Fase C — Recorridos** de jugador y DM.
- **Fase D — SRD en español:** según la decisión de la fuente.

## Preguntas abiertas

- [ ] **Fuente del SRD en español.** Opciones: traducir y guardar como archivos estáticos el SRD 5.1 (licencia CC-BY-4.0, permite traducir citando la fuente), usar una traducción comunitaria existente si la licencia lo permite, o mantener el compendio en inglés con los nombres traducidos. Hay que verificar licencias antes de elegir.
- [ ] **Voseo.** La app ya usa voseo ("Pegá el código"). ¿Se mantiene como identidad, o se ofrece una opción neutra (tú) para el resto de Latinoamérica y España?
- [ ] **Modo mesa por defecto.** ¿Se activa solo cuando la partida está en curso, o siempre lo elige el jugador?
