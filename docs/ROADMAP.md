# Roadmap · Camino a Lanzamiento y Hoja Viva

Nov 16, 2026 · @Gonzalo Benavente

Orden estratégico de implementación: combina las etapas mecánicas de la hoja de personaje con los pilares indispensables de **onboarding, blindaje legal, modo demo y preparación para marketing público**. Cada etapa se documenta en **una spec** (`docs/Specs/NN-*.spec.md`) y en **planes por fase** (`docs/Plans/NN-*/`).

---

## Reglas del Proyecto

1. **Una etapa a la vez.** No se abre la spec de una etapa hasta cerrar la anterior (tests verdes, build estático limpio y prueba manual).
2. **Cero fricción de entrada (Regla de Oro de Marketing).** Ningún usuario nuevo debe toparse con un muro de registro obligatorio sin antes haber visto la propuesta de valor y probado la herramienta.
3. **La hoja avisa, no bloquea.** Las incompatibilidades (armaduras sin competencia, conjuros sin componentes) se señalan y aplican sus penalizaciones, pero el DM siempre puede arbitrar.
4. **Catálogo base + entradas propias.** Objetos, hechizos y dotes se cargan del catálogo SRD o se crean a mano con el mismo esquema.
5. **Cuidar la cuota de Firestore.** Toda la arquitectura debe ser eficiente en lecturas/escrituras para operar de forma económica y escalable en producción.
6. **Cada etapa termina en algo que se puede jugar y mostrar.**

---

## Vista General

```
[H1] Cimientos (Hecha) ───► [H2] Equipo y CA (Cerrada)
                                     │
   ┌─────────────────────────────────┴─────────────────────────────────┐
   ▼                                                                   ▼
[M1] Spec 09: Lanzamiento (Cerrada)                     [H3] Spec 10: Descansos y Recursos (Cerrada)
  ├─ Landing Page y propuesta de valor                    ├─ Descanso corto con dados de golpe y CON
  ├─ Modo Demo / Playground sin login                     ├─ Descanso largo y reposición de recursos
  ├─ Blindaje legal (SRD 5.1 CC-BY-4.0 + ToS/Privacy)     ├─ Dados guardados (Portento)
  ├─ Canal de feedback y métricas de embudo               └─ Resumen interactivo
  └─ Verificación de cuotas y producción (Google OAuth)                │
                                                                       ▼
                                                        [H4] Spec 11: Combate en la Hoja (Siguiente)
                                                          ├─ Consumo 1 vez por turno
                                                          ├─ Validación de espacios y conjuros
                                                          ├─ Concentración automática y salvaciones
                                                          └─ Ventaja/desventaja explicadas
                                                                       │
                                                        [H5] Spec 12: Reacciones en vivo
                                                                       │
                                                        [H6] Spec 13: Alcance y Tokens
                                                                       │
                                                        [H7] Spec 14: Layouts DM / Jugador
```

---

## Estado y Detalle de las Etapas

### H1 · Cimientos *(Cerrada)*
* **Objetivo:** Motor unificado de recursos, efectos activos con duración y catálogo base SRD.
* **Spec:** [`docs/Specs/07-cimientos-de-la-hoja.spec.md`](Specs/07-cimientos-de-la-hoja.spec.md).

### H2 · Equipo y CA Derivada *(Cerrada)*
* **Objetivo:** Slots de inventario, sintonización (máx 3), armaduras estructuradas, desglose de CA y compatibilidad de competencias.
* **Spec:** [`docs/Specs/08-equipo.spec.md`](Specs/08-equipo.spec.md).

---

### M1 · Lanzamiento, Onboarding y Blindaje Legal · *(Cerrada)*
* **Objetivo:** Convertir el proyecto en un producto listo para recibir tráfico de marketing, redes sociales y comunidades de rol sin fricción de entrada ni riesgos legales.
* **Spec:** [`docs/Specs/09-lanzamiento-y-onboarding.spec.md`](Specs/09-lanzamiento-y-onboarding.spec.md).

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Landing Page para visitantes** (Hero, showcase visual de características, diferenciales 100% en español, torre de dados animada, VTT integrado) | M | Se muestra a usuarios no autenticados en `/` en lugar del AuthGate bloqueante |
| **Modo Demo / Playground interactivo sin registro** | M | Botón "Probar demo" que abre una ficha/campaña de ejemplo local para explorar y tirar dados sin cuenta |
| **Blindaje Legal (SRD 5.1 CC-BY-4.0)** | S ⚡ | Atribución oficial de Wizards of the Coast en footer/modal, necesaria para distribuir contenido D&D |
| **Términos de Servicio y Política de Privacidad** | S ⚡ | Rutas `/privacidad` y `/terminos`, requeridas por Google Cloud para verificar la app OAuth y quitar avisos rojos |
| **Canal de Feedback y Detección de Bugs** | S ⚡ | Botón flotante o menú para enviar reporte/sugerencia directo a Discord/formulario |
| **Analítica ligera y métricas de embudo** | S | Medir visitas a la landing, clics en demo, registros y creación de partidas para optimizar conversión |
| **Verificación de Producción y Cuotas** | S | Alertas de presupuesto en Firebase, variables de entorno completas (`PUBLIC_FIREBASE_DATABASE_URL`) |

> [!NOTE]
> **Gestión de Cuentas de Usuario (Auth & Privacidad — Completado):**
> 1. **Borrado de Cuenta (Derecho al Olvido / GDPR / Google Cloud):** Función para que el usuario pueda eliminar su cuenta permanentemente desde la app (`deleteUser`), borrando su perfil en Firestore (`users/{uid}` con `allow delete`), cerrando sesión y purgando caché local, con modal de confirmación por palabra clave ("BORRAR") y manejo de reautenticación por seguridad.
> 2. **Flujo dedicado de 'Olvidé mi contraseña':** Sub-vista en el modal `AuthGate` con instrucciones para ingresar el correo, envío del enlace vía `sendPasswordResetEmail`, botón de retorno a login y feedback visual.

* **Criterio de cierre:** Un usuario anónimo puede entrar a la URL, entender qué ofrece el producto en 10 segundos, probar una ficha interactiva y tirar dados sin registrarse; si decide crear cuenta con Google, no aparecen advertencias de app no verificada; y el pie de página incluye la atribución legal de WotC.

---

### H3 · Descansos y Recursos *(Cerrada)*
* **Objetivo:** Automatizar la recuperación de salud y recursos diarios según las reglas oficiales 5e.
* **Spec:** [`docs/Specs/10-descansos-y-recursos.spec.md`](Specs/10-descansos-y-recursos.spec.md).
* **Planes por fase:** [`docs/Plans/10-descansos-y-recursos/`](Plans/10-descansos-y-recursos/).

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Descanso corto con dados de golpe** | M | Selección de cantidad a gastar, tirada por dado sumando CON, soporte multiclase |
| **Descanso largo automático** | M | Repone mitad de dados de golpe, reinicia espacios de conjuro y recursos "hasta descanso" |
| **Dados guardados** (Portento y similares) | S | Tirada en descanso largo, gasto para sustituir tiradas |
| **Resumen interactivo del descanso** | S ⚡ | Notificación de PG recuperados, slots y facultades restauradas |

---

### H4 · Combate en la Hoja *(Cerrada)*
* **Objetivo:** Que atacar y lanzar conjuros respete las reglas oficiales sin cálculos manuales.
* **Spec:** [`docs/Specs/11-combate-en-la-hoja.spec.md`](Specs/11-combate-en-la-hoja.spec.md).
* **Planes por fase:** [`docs/Plans/11-combate-en-la-hoja/`](Plans/11-combate-en-la-hoja/).

| Pieza | Tamaño | Nota |
| --- | --- | --- |
| **Selector de modificadores al impacto** y consumo "1 vez por turno" | L | Si el ataque falla, el efecto no se gasta |
| **Validación de conjuros y descuento de espacios** | L | Validación de nivel, componentes V/S/M y rituales |
| **Concentración activa y salvación al daño** | M | Aviso de reemplazo y tirada de salvación automática con CD calculada al recibir daño |
| **Ventaja y desventaja explicadas** | M | Justificación visible en la tirada según efectos y armadura |

---

### H5 · Reacciones en Vivo
* **Objetivo:** Ofrecer reacciones en tiempo real durante el turno del adversario (Escudo, etc.).
* **Spec:** `docs/Specs/12-reacciones.spec.md` *(por escribir)*.

---

### H6 · Alcance y Tokens Propios
* **Objetivo:** Reconocimiento de distancias tácticas y control de tokens de invocaciones / compañeros.
* **Spec:** `docs/Specs/13-alcance-y-tokens.spec.md` *(por escribir)*.

---

### H7 · Layouts Especializados
* **Objetivo:** Vistas optimizadas para DM, Jugador en mesa física (celular) y modo sin mapa (teatro de la mente).
* **Spec:** `docs/Specs/14-layouts.spec.md` *(por escribir)*.

---

## Tabla de Estado de Specs

| Spec | Etapa | Archivo | Estado |
| --- | --- | --- | --- |
| 07 | H1 | [`Specs/07-cimientos-de-la-hoja.spec.md`](Specs/07-cimientos-de-la-hoja.spec.md) | Hecha (H1 cerrada) |
| 08 | H2 | [`Specs/08-equipo.spec.md`](Specs/08-equipo.spec.md) | Cerrada (H2 cerrada) |
| 09 | M1 | [`Specs/09-lanzamiento-y-onboarding.spec.md`](Specs/09-lanzamiento-y-onboarding.spec.md) | Cerrada (M1 cerrada) |
| 10 | H3 | [`Specs/10-descansos-y-recursos.spec.md`](Specs/10-descansos-y-recursos.spec.md) | Cerrada (H3 cerrada) |
| 11 | H4 | [`Specs/11-combate-en-la-hoja.spec.md`](Specs/11-combate-en-la-hoja.spec.md) | Cerrada (H4 cerrada) |
| 12 | H5 | `Specs/12-reacciones.spec.md` | **Siguiente** (por escribir) |
| 13 | H6 | `Specs/13-alcance-y-tokens.spec.md` | Por escribir |
| 14 | H7 | `Specs/14-layouts.spec.md` | Por escribir |

---

## Próximo Paso Inmediato

Iniciar la **Spec 12 (H5 · Reacciones en Vivo)**:
1. Redactar la spec técnica en `docs/Specs/12-reacciones.spec.md`.
2. Crear los planes por fase (`docs/Plans/12-reacciones/`).
3. Detección y ofrecimiento de reacciones en tiempo real durante el turno del adversario (ej. conjuro *Escudo*, *Absorber Elementos*, *Ataque de Oportunidad*, *Interposición de Escudo*).
4. Integración reactiva con el tracker de combate del DM y consumo del recurso "Reacción" del personaje por ronda.
