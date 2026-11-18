# Plan de Implementación — Fase C: Blindaje Legal, Footer y Redes

Parte de la [Spec 09](../../Specs/09-lanzamiento-y-onboarding.spec.md).

---

## Objetivo

Añadir la atribución legal obligatoria del SRD 5.1 (Wizards of the Coast), crear las páginas estáticas de Privacidad y Términos para habilitar la verificación de Google OAuth, y configurar las metaetiquetas OpenGraph para compartir en redes sociales y Discord.

---

## Tareas

- [x] **T-275** Crear componente `src/components/layout/SiteFooter.astro`:
  - Enlaces de navegación rápida: *Inicio*, *Compendio SRD*, *Términos de Uso*, *Política de Privacidad*.
  - Enlace de comunidad / feedback: *"Sugerir una idea o reportar un error"* con ícono de mensaje (apunta a Discord o formulario de contacto).
  - Bloque legal de Wizards of the Coast:
    > *"Este proyecto incluye material extraído del System Reference Document 5.1 (“SRD 5.1”) de Wizards of the Coast LLC, disponible bajo la licencia Creative Commons Attribution 4.0 International (CC-BY-4.0). Dungeons & Dragons y D&D son marcas registradas de Wizards of the Coast LLC. Esta aplicación no está respaldada ni afiliada con Wizards of the Coast."*
  - Incluir el componente en `src/layouts/BaseLayout.astro`.

- [x] **T-276** Crear páginas estáticas legales:
  - `src/pages/privacidad.astro`:
    - Explica de forma transparente qué datos se recolectan (email, identificador de Google, nombre de usuario público y datos de fichas/campañas).
    - Declara que no se comparten ni venden datos a terceros ni se utilizan con fines publicitarios.
    - Indica el uso de Firebase Authentication y Cloud Firestore.
    - Datos de contacto del responsable.
  - `src/pages/terminos.astro`:
    - Alcance del servicio como plataforma gratuita para entusiastas del rol.
    - Propiedad de los contenidos creados por los jugadores.
    - Limitación de responsabilidad y disponibilidad del servicio.

- [x] **T-277** Configurar OpenGraph y Twitter Cards:
  - En `src/layouts/BaseLayout.astro`:
    - `<meta property="og:type" content="website" />`
    - `<meta property="og:title" content="Crónicas del Aventurero — Gestor de Campañas D&D 5e" />`
    - `<meta property="og:description" content="Hoja de personaje en vivo, torre de dados animada, grimorio de Dungeon Master y compendio oficial 100% en español." />`
    - `<meta property="og:image" content="https://dnd.gonzabena.com.ar/og-preview.png" />`
    - `<meta name="twitter:card" content="summary_large_image" />`
  - Asegurar la presencia de una imagen de previsualización adecuada en `public/og-preview.png`.

---

## Verificación

1. Navegar a `/privacidad` y `/terminos`: comprobar formato, legibilidad y que compilen estáticamente.
2. Comprobar que el footer se renderice adecuadamente tanto en versión móvil como de escritorio.
3. Validar con un inspector de etiquetas HTML que los tags `og:*` y `twitter:*` estén presentes en el `<head>`.
