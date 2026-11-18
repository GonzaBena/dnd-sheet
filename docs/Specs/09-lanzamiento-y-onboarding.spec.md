# Spec 09: Lanzamiento, Onboarding y Blindaje Legal — dnd.gonzabena.com.ar

Nov 16, 2026 · @Gonzalo Benavente · **Estado: Cerrada**

Etapa M1 del [roadmap](../ROADMAP.md). Prepara el proyecto para recibir usuarios reales, marketing y difusión pública sin fricción de entrada ni riesgos legales.

---

## Objetivo y Alcance

Permitir que cualquier visitante que llegue a la aplicación desde redes sociales, foros o recomendaciones:
1. **Entienda el valor del producto en menos de 10 segundos** a través de una portada (Landing) clara, visual y atractiva.
2. **Pueda probar la herramienta de inmediato ("Modo Demo / Playground")** sin registrarse ni poner su correo de entrada, interactuando con una ficha real, dados y el compendio en español.
3. **Cuenten con blindaje legal completo:** Atribución requerida por Wizards of the Coast (SRD 5.1 CC-BY-4.0) y páginas de Privacidad/Términos para habilitar la verificación de Google OAuth.
4. **Disponga de un canal directo de feedback y métricas de conversión** para aprender del comportamiento de los primeros usuarios.

### Dentro del Alcance (v1)

- **Landing Page en `/` para usuarios no autenticados:**
  - Hero banner con propuesta de valor clara: *"Tu mesa de D&D 5e en tiempo real, 100% en español"*.
  - Demostración visual de los pilares: torre de dados animada, sincronización móvil/PC, VTT táctico integrado y compendio oficial SRD traducido.
  - Botones de acción directos: *"Probar Demo sin Registro"* (primario) e *"Iniciar Sesión / Crear Cuenta"* (secundario).
- **Modo Demo interactivo:**
  - Acceso directo a una ficha de personaje de prueba y una campaña local de demostración.
  - No requiere conexión obligatoria a Firebase; opera en almacenamiento local (`localStorage`).
  - Banner discreto y no invasivo que indica el modo demo y ofrece crear una cuenta para guardar en la nube.
- **AuthGate bajo demanda:**
  - El modal de login ya no cubre la pantalla de forma obligatoria e inmediata en la raíz.
  - Se abre fluidamente cuando el visitante hace clic en *"Iniciar Sesión"*, *"Crear Cuenta"*, *"Guardar en la Nube"* o al intentar unirse a una campaña online.
- **Blindaje Legal (Wizards of the Coast + OAuth):**
  - Footer responsivo con la declaración oficial de atribución del SRD 5.1 bajo licencia Creative Commons CC-BY-4.0.
  - Páginas públicas `/privacidad` (Política de Privacidad) y `/terminos` (Términos de Uso), redactadas para cumplir con los requisitos de verificación de Google Cloud Identity.
- **Canal de Feedback & Soporte:**
  - Enlace / botón de *"Sugerencias y Reportes"* accesible desde el pie o menú hacia canal comunitario (Discord / formulario).
- **Métricas de Embudo y Open Graph:**
  - Metadatos enriquecidos de OpenGraph y Twitter Card para previsualizaciones impactantes al compartir el enlace en WhatsApp, Discord, Telegram o X.
  - Registro de eventos clave de embudo (visita a landing, clic en demo, apertura de auth, login exitoso).

### Fuera del Alcance (v1)

- Pasarela de pagos o planes de suscripción (el proyecto arranca como herramienta comunitaria gratuita).
- Internacionalización a otros idiomas (el foco diferenciador es el público hispanohablante).
- Tutorial guiado paso a paso con "tours" interactivos (tooltips invasivos); la interfaz debe ser autoexplicativa.

---

## Usuarios y Beneficios

| Rol | Qué gana |
| --- | --- |
| **Visitante / Curioso** | Entiende qué hace la app sin leer manuales, prueba la hoja y tira dados con un clic sin entregar sus datos privados. |
| **Dungeon Master** | Puede invitar a sus jugadores compartiendo un link directo sin que estos se quejen de tener que crearse cuentas complejas antes de ver su ficha. |
| **Desarrollador / Creador** | Seguridad jurídica (respeto de propiedad intelectual de WotC), verificación de Google OAuth sin pantallas rojas de advertencia, y métricas para saber qué convierte. |

---

## Estado Actual del Repo (Punto de Partida)

| Área | Estado Actual | Ubicación |
| --- | --- | --- |
| Ruta raíz `/` | Carga el gestor de campañas (`index.astro`). Si no hay sesión, `AuthGate` cubre toda la pantalla con un modal obligatorio. | `src/pages/index.astro`, `src/components/auth/AuthGate.astro` |
| Modo local | `isFirebaseConfigured()` comprueba credenciales, pero si están configuradas en `.env`, el flujo asume nube y bloquea sin sesión. | `src/scripts/firebase/client.ts`, `src/scripts/data/cloudSync.ts` |
| Personajes demo | Existen personajes prehechos en `premadeCharacters.ts` y en `campaignStore.ts`, pero se usan solo dentro de modales internos. | `src/scripts/data/premadeCharacters.ts` |
| Avisos legales | No hay mención a Wizards of the Coast, SRD 5.1 ni CC-BY-4.0 en el sitio. | Ninguna |
| Políticas | No existen rutas de privacidad ni términos de servicio. | Ninguna |
| OpenGraph | Metadatos básicos en `BaseLayout.astro`, sin imagen de preview optimizada para redes sociales. | `src/layouts/BaseLayout.astro` |

---

## Requisitos Funcionales

### RF-290: Landing Page para Visitantes
* Cuando un usuario no autenticado entra a `/`, visualiza una presentación del producto antes de cualquier formulario.
* Secciones mínimas:
  1. **Hero Banner:** Título evocador, subtítulo con beneficios claros, botones de acción (*Probar Demo* / *Entrar*).
  2. **Características Destacadas:**
     - Ficha de personaje viva y automatizada (CA calculada, modificadores, slots).
     - Torre de dados animada con tiradas secretas y detección de críticos.
     - Grimorio y pantalla de Dungeon Master con vista táctica en vivo.
     - Mesa virtual (VTT) liviana y presencia en tiempo real en celular y PC.
     - Compendio oficial SRD 5e completamente traducido al español.
  3. **Demostración Rápida:** Captura interactiva o mockup animado del diseño oscuro.
  4. **Llamado a la acción final (CTA):** Invitación a probar la demo o registrarse gratis.

### RF-291: Visualización Condicional en `/`
* Si el usuario **ya inició sesión**, `/` presenta directamente su panel de campañas y personajes activos (comportamiento actual).
* Si el usuario **no está logueado**, `/` muestra la Landing Page con la opción de abrir el panel de login mediante botón explícito.

### RF-292: Modo Demo sin Autenticación
* El botón *"Probar Demo"* activa un personaje jugable (ej. guerrero prearmado con inventario y armas) en `/campaigns` utilizando el almacenamiento local (`localStorage`).
* No intenta autenticar contra Firebase ni dispara errores en consola por falta de usuario.
* El usuario puede tirar dados, equipar armas, marcar espacios de conjuro y consultar el compendio.

### RF-293: Banner Persistente en Modo Demo
* Al estar en Modo Demo, un banner superior o flotante discreto indica:
  *"Estás probando la app en Modo Demo (sin cuenta). Creá tu cuenta gratis para sincronizar con tu mesa y guardar tus partidas en la nube."*
* Incluye un botón *"Crear cuenta gratis"* que abre `AuthGate` en modo registro.

### RF-294: AuthGate Bajo Demanda
* `AuthGate` no se despliega automáticamente bloqueando la vista de un visitante anónimo en la portada.
* Se despliega al pulsar:
  - Botón *"Iniciar sesión"* o *"Crear cuenta"* en el Header / Landing.
  - Botón *"Guardar en la nube"* del Banner de Modo Demo.
  - Al intentar unirse a una campaña compartida que requiera identidad de jugador.
* Incorpora un botón de cierre `(✕)` para volver a la navegación pública si el usuario se arrepiente.

### RF-295: Atribución Legal SRD 5.1 (Wizards of the Coast)
* En el pie de página de la aplicación y en un diálogo/página legal accesible, se debe incluir el texto oficial:
  > *"Este proyecto incluye material extraído del System Reference Document 5.1 (“SRD 5.1”) de Wizards of the Coast LLC, disponible bajo la licencia Creative Commons Attribution 4.0 International (CC-BY-4.0). D&D y Dungeons & Dragons son marcas registradas de Wizards of the Coast LLC."*

### RF-296: Páginas de Privacidad y Términos
* Creación de páginas estáticas:
  - `/privacidad`: Detalla qué datos se guardan (Google UID, nombre público elegido, email, campañas y fichas creadas), aclarando que no se comercializan datos ni se comparten con terceros.
  - `/terminos`: Condiciones de uso de la plataforma y respeto a los derechos de propiedad intelectual.
* Ambas páginas deben ser accesibles desde el footer y contar con URLs fijas para vincularlas a la consola de Google Cloud OAuth.

### RF-297: Canal de Feedback para Usuarios
* Inclusión de un enlace o botón accesible (ej. en el footer o en el menú de usuario):
  - *"Sugerir una idea o reportar un error"*.
  - Dirige a un canal comunitario (servidor de Discord o formulario web simple).

### RF-298: Metadatos OpenGraph y Compartir en Redes
* Configuración de tags `<meta property="og:title">`, `<meta property="og:description">`, `<meta property="og:image">` en `BaseLayout.astro`.
* Creación o asignación de una imagen representativa en `public/og-preview.png` (1200x630) con diseño oscuro, logo y dado d20.

---

## Requisitos No Funcionales

* **RNF-290 (Rendimiento):** La landing page debe ser estática, compilada por Astro, con un impacto inferior a 50 KB de JS adicional.
* **RNF-291 (No Regresión):** Las 70+ suites de tests unitarios y de integración deben seguir pasando al 100% (`pnpm test`).
* **RNF-292 (Seguridad):** Ningún usuario no autenticado en modo demo puede escribir en documentos de campañas existentes en Firestore.

---

## Lista de Tareas

- [x] **T-270** Crear componente `LandingHero.astro` y secciones de características destacadas para visitantes (RF-290)
- [x] **T-271** Adaptar `src/pages/index.astro` para alternar fluidamente entre la Landing pública y el panel de campañas según el estado de autenticación (RF-291)
- [x] **T-272** Implementar el flujo de "Modo Demo" en `cloudSync.ts` y `client.ts` para permitir navegación y guardado local sin credenciales (RF-292)
- [x] **T-273** Crear el componente `DemoNoticeBanner.astro` que informa al usuario que está en modo de prueba local (RF-293)
- [x] **T-274** Modificar `AuthGate.astro` para soportar cierre opcional `(✕)` y apertura por evento (`open-auth-modal`) (RF-294)
- [x] **T-275** Crear componente `SiteFooter.astro` con enlaces de navegación, atribución legal de WotC y botón de feedback (RF-295, RF-297)
- [x] **T-276** Crear páginas estáticas `src/pages/privacidad.astro` y `src/pages/terminos.astro` (RF-296)
- [x] **T-277** Configurar metaetiquetas OpenGraph y tarjeta de Twitter en `BaseLayout.astro` con asset visual para compartir en redes (RF-298)
- [x] **T-278** Escribir tests automatizados para validar que la landing compila, el modo demo inicializa correctamente y los avisos legales están presentes (RNF-291)
- [x] **T-279** Verificación integral del build estático (`astro build`) y suite completa de pruebas (RNF-290, RNF-291)

---

## Criterio de Cierre

La spec se considera cumplida cuando:
1. Al ingresar a `/` sin sesión activa, se despliega la Landing Page limpia y sin modales invasivos.
2. Al pulsar *"Probar Demo"*, la aplicación abre una hoja de personaje interactiva funcional en modo local, con el banner de advertencia para registrarse.
3. Al pulsar *"Iniciar Sesión"*, el modal de autenticación se abre y puede cerrarse libremente.
4. Las páginas `/privacidad` y `/terminos` están disponibles y enlazadas en el pie junto a la atribución de WotC SRD 5.1 CC-BY-4.0.
5. `pnpm test` y `astro build` pasan al 100% sin errores.

---

## Gestión de Cuenta y Auth (GDPR & Recuperación de Acceso) · Implementado

Se implementaron y verificaron formalmente los siguientes ítems de autenticación y cumplimiento legal:
- [x] **Borrado definitivo de cuenta (Derecho al Olvido / GDPR / Google Cloud OAuth):**
  - Implementado `DeleteAccountModal.astro` con modal de confirmación por palabra clave ("BORRAR").
  - Botón "Eliminar cuenta" en el menú de usuario de la hoja de juego ([Header.astro](file:///Users/gonzo/Documents/workspace/dnd_sheet/src/components/layout/Header.astro)), en el drawer móvil y en el header desktop de [index.astro](file:///Users/gonzo/Documents/workspace/dnd_sheet/src/pages/index.astro).
  - Regla de seguridad en [firestore.rules](file:///Users/gonzo/Documents/workspace/dnd_sheet/firestore.rules) (`allow delete: if signedIn() && uid() == userId;`), borrado en [cloudSync.ts](file:///Users/gonzo/Documents/workspace/dnd_sheet/src/scripts/data/cloudSync.ts), llamada a `deleteCurrentUser()` en Firebase Auth y purga de caché local.
  - Manejo de reautenticación por seguridad (`auth/requires-recent-login`).
- [x] **Flujo dedicado y guiado de "Olvidé mi contraseña":**
  - Sub-vista dedicada en [AuthGate.astro](file:///Users/gonzo/Documents/workspace/dnd_sheet/src/components/auth/AuthGate.astro) (`mode: 'forgot'`) con copy claro, campo exclusivo de correo, botón "Enviar enlace de recuperación" y botón de retorno "← Volver a iniciar sesión".
  - Disparo de `sendPasswordReset()` en [authService.ts](file:///Users/gonzo/Documents/workspace/dnd_sheet/src/scripts/firebase/authService.ts) y alertas visuales de confirmación de despacho.
