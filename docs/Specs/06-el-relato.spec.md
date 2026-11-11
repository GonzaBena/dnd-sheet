# Spec: El relato — dnd.gonzabena.com.ar

Nov 9, 2026 · @Gonzalo Benavente

> **Borrador.** Define objetivo, requisitos y fases a grandes rasgos. Se completa cuando las Specs 03 y 04 estén implementadas, porque se arma con sus datos.

Etapa 5 del [roadmap](../ROADMAP-vtt.md). Ideas I-13 e I-14 de [`IDEAS.md`](../IDEAS.md).

## Objetivo y alcance

Cerrar el círculo: **la campaña se cuenta sola**. Con los episodios, los momentos y las estadísticas de las etapas anteriores, la app arma el resumen de "lo que pasó" al volver a jugar y una crónica para guardar o compartir.

**Dentro del alcance**

- "Previously on…" al reanudar o iniciar una sesión (I-14). Es lo último en agregarse.
- Crónica de la campaña o de un arco: página tipo libro, imprimible como PDF (I-13).

**Fuera del alcance (v1)**

- Resumen escrito con IA: queda como v2 (ver *Preguntas abiertas*).
- Narración con voz, video o música.

**Depende de:** Spec 03 (eventos, momentos, sesiones con título). La Spec 04 (premios, retratos por etapa) la enriquece, pero no es obligatoria.

## 1. "Previously on…" (I-14)

**Cuándo aparece**

- Al **reanudar** una partida pausada (`paused` → `active`, opción "continuar" de la Spec 03): resume lo último de la sesión en curso.
- Al **empezar una sesión nueva** (opción "empezar"): resume la sesión anterior, y se muestra después de la tarjeta de episodio.
- Lo ven todos los miembros conectados. Se puede saltear, y volver a abrir desde `/partida`.

**Qué muestra (v1, sin IA)**

Una secuencia breve, tipo "anteriormente en…":

1. Título del episodio anterior (o "Sesión N").
2. Los momentos destacados de esa sesión (de 3 a 5), con retrato y título.
3. Hitos registrados.
4. La última entrada `party` de la bitácora, como "dónde quedamos".
5. Premios de la sesión, si existe la Spec 04.

El DM puede revisarla y editar el texto de "dónde quedamos" antes de mostrarla (S).

## 2. Crónica (I-13)

- Página `/cronica?id=<cid>`, accesible a los miembros: portada con la campaña y el grupo, un capítulo por episodio (título, fecha, momentos, hitos y entradas `party` elegidas por el DM) y un cierre con estadísticas y premios (si existe la Spec 04).
- **Arcos:** el DM puede agrupar episodios en arcos ("Arco 1: La Mano Roja") y generar la crónica de un arco o de toda la campaña.
- **PDF:** con estilos de impresión (`@media print`) y "Imprimir → Guardar como PDF" del navegador. Sin librerías de PDF.
- El DM elige qué entradas de la bitácora entran en la crónica; las privadas nunca entran.

## Requisitos (borrador)

| ID | Requisito | Prio |
| --- | --- | --- |
| RF-200 | Al reanudar o empezar una sesión, todos ven el "Previously on…" de la sesión correspondiente. | M |
| RF-201 | El resumen v1 se arma con título, momentos, hitos y la última entrada `party`, sin IA. | M |
| RF-202 | Se puede saltear y volver a abrir desde `/partida`. | M |
| RF-203 | El DM revisa y edita el "dónde quedamos" antes de mostrarlo. | S |
| RF-210 | Existe la página de crónica con portada, un capítulo por episodio y cierre. | M |
| RF-211 | El DM agrupa episodios en arcos y genera la crónica de un arco. | S |
| RF-212 | La crónica se imprime como PDF con buen formato. | M |
| RF-213 | El DM elige qué entradas de la bitácora entran; las privadas nunca. | M |

## Fases (borrador)

- **Fase A — Crónica:** página, capítulos por episodio, estilos de impresión.
- **Fase B — Arcos y selección de entradas.**
- **Fase C — "Previously on…" v1** (sin IA). Va último, como se decidió.
- **Fase D (v2, opcional) — Resumen con IA.**

## Preguntas abiertas

- [ ] **IA para el resumen (v2).** Hace falta un backend que guarde la API key. Hostinger (hosting web) suele permitir PHP: un endpoint PHP mínimo podría llamar a la API sin VPS. Hay que ver costo por uso, límites y si vale la pena frente a la v1.
- [ ] **Crónica pública.** ¿Se puede compartir con un link a gente fuera de la campaña? Requiere publicar una copia de solo lectura, porque las reglas actuales solo dejan leer a los miembros.
- [ ] **Quién ve el "Previously on…".** ¿Todos los conectados a la vez (lo dispara el DM), o cada uno al entrar?
