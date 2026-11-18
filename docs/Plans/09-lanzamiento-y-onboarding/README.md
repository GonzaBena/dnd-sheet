# Planes de Implementación — Spec 09: Lanzamiento, Onboarding y Blindaje Legal

Planes derivados de [`docs/Specs/09-lanzamiento-y-onboarding.spec.md`](../../Specs/09-lanzamiento-y-onboarding.spec.md). Cada plan es **autocontenido**: un desarrollador o agente de IA puede ejecutarlo leyendo únicamente ese archivo y el código del repositorio.

---

## Cuándo se Ejecuta

Esta es la etapa **M1** del [roadmap](../../ROADMAP.md). Se ejecuta inmediatamente tras cerrar H1 y H2 (Specs 07 y 08). Su objetivo es dejar la aplicación en un estado donde pueda recibir tráfico público, menciones en foros y campañas en redes sociales con un embudo de conversión optimizado y sin riesgos legales.

---

## Índice de Fases

| Plan | Tareas | Requisitos | Objetivo |
| --- | --- | --- | --- |
| [Fase A — Landing Page y Portada](fase-a-landing.plan.md) | T-270, T-271 | RF-290, RF-291 | Hero banner, vitrina visual de características, navegación para no autenticados y conmutación fluida en `/`. |
| [Fase B — Modo Demo y Auth Bajo Demanda](fase-b-modo-demo-y-auth.plan.md) | T-272, T-273, T-274 | RF-292, RF-293, RF-294 | Explorar ficha y campaña de ejemplo en local sin login; banner de aviso; `AuthGate` accesible bajo demanda con botón de cierre. |
| [Fase C — Blindaje Legal, Footer y Redes](fase-c-legal-y-footer.plan.md) | T-275, T-276, T-277 | RF-295, RF-296, RF-297, RF-298 | Atribución SRD 5.1 CC-BY-4.0, páginas `/privacidad` y `/terminos`, canal de feedback y OpenGraph para redes sociales. |
| [Fase D — Tests, Verificación y Cierre](fase-d-verificacion-y-cierre.plan.md) | T-278, T-279 | RNF-290, RNF-291, RNF-292 | Tests automatizados de landing y modo demo, verificación de build estático y prueba manual de conversión. |

---

## Secuencia de Ejecución

```
Fase A: Landing Page ──► Fase B: Modo Demo y Auth ──► Fase C: Legal y Redes ──► Fase D: Verificación y Cierre
```

---

## Mapa del Repositorio (Archivos Involucrados)

| Componente / Archivo | Función |
| --- | --- |
| `src/pages/index.astro` | Conmuta entre la Landing Page (visitantes) y el panel de campañas (usuarios autenticados). |
| `src/components/landing/LandingHero.astro` | Nuevo componente con el Hero y beneficios visuales del producto. |
| `src/components/landing/LandingFeatures.astro` | Demostración de características (ruleta de dados, sincronización, VTT, SRD en español). |
| `src/components/auth/AuthGate.astro` | Pasa de modal bloqueante automático a modal bajo demanda con botón de cierre. |
| `src/components/ui/DemoNoticeBanner.astro` | Banner superior/flotante que indica que se está en Modo Demo local e invita a registrarse. |
| `src/components/layout/SiteFooter.astro` | Pie de página con enlaces de navegación, atribución de WotC CC-BY-4.0 y link de feedback. |
| `src/pages/privacidad.astro` | Política de privacidad oficial (requisito para verificar app en Google Cloud OAuth). |
| `src/pages/terminos.astro` | Términos y condiciones del servicio. |
| `src/scripts/data/cloudSync.ts` | Soporte para sesión `demo` / `local` sin forzar estado `signed-out` invasivo. |
| `src/layouts/BaseLayout.astro` | Inclusión del Footer, metaetiquetas OpenGraph y tags de compartir. |

---

## Reglas de Arquitectura

1. **Mantener Astro estático:** Todo se compila en HTML/CSS/JS estático sin requerir backend propio en tiempo de ejecución.
2. **Respetar el diseño oscuro existente:** Fondo `#0a0d12`, tarjetas `#121721`, bordes `#222f42`, acentos dorados `amber-500` y tipografías *Literata* y *Nunito Sans*.
3. **No romper los tests existentes:** Todas las llamadas al store y la sincronización deben mantener total compatibilidad hacia atrás.
