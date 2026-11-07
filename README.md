# D&D 5e Character Sheet & Campaign Tracker 🎲⚔️

Aplicación web moderna y reactiva para hojas de personaje de D&D 5e y gestión de campañas en mesa en tiempo real. Construida con [Astro](https://astro.build/), [Tailwind CSS](https://tailwindcss.com/), [Anime.js](https://animejs.com/) y [Firebase Firestore](https://firebase.google.com/docs/firestore).

---

## 🌟 Características Principales

- **Ficha de Personaje Interactiva (D&D 5e):**
  - Estadísticas, modificadores automáticos, tiros de salvación y competencias.
  - Gestión dinámica de puntos de golpe (PG actuales, máximos y temporales con animaciones fluidas).
  - Pestañas adaptables por clase (Combate, Habilidades, Magia con espacios de conjuro, Forma Salvaje, Mochila e Inventario).
  - Descansos cortos y largos con recuperación de dados de golpe y recursos.

- **Torre de Dados con Ruleta Jackpot y Tiradas Secretas:**
  - Simulador de dados animado estilo ruleta jackpot con detección de críticos (20 natural) y pifias (1 natural).
  - **Tiradas Secretas para Usuarios:** Opción para realizar tiradas privadas y ocultas al resto de la mesa, registradas exclusivamente en la bitácora personal del jugador. Atajos rápidos mediante `Shift + Clic` o `Clic Derecho`.

- **Grimorio del Control (Panel de Dungeon Master):**
  - Vista táctica centralizada de todos los aventureros de la campaña (PG en vivo, CA, Percepción Pasiva, Inspiración).
  - Lanzamiento de dados rápidos de DM (públicos y ocultos tras la pantalla).
  - Celebración de hitos épicos y otorgamiento de descansos grupales.

- **Bitácora de Sesión Compartida:**
  - Cronología de eventos, rumores, pistas, botín y tiradas registradas con etiquetas (#Combate, #Hito, #Botín, #Privado).
  - Aislamiento de privacidad: notas y tiradas privadas visibles solo para su autor.

- **Sincronización en la Nube (Multi-dispositivo y Multi-jugador):**
  - Conexión en vivo mediante Firebase Firestore sin necesidad de backend propio.
  - Soporte para variables de entorno para preconfigurar el proyecto sin que los jugadores tengan que ingresar credenciales manualmente.

---

## 🚀 Instalación y Uso Local

### Prerrequisitos
- Node.js (v18 o superior)
- pnpm / npm

### Instalación de dependencias
```bash
pnpm install
# o con npm
npm install
```

### Configuración del Puerto y Variables de Entorno
Copia el archivo `.env.example` a `.env`:
```bash
cp .env.example .env
```

Contenido del `.env`:
```env
# Puerto del servidor (leído automáticamente por process.env.PORT)
PORT=4321

# Credenciales de Firebase (opcionales para preconfigurar a todos los jugadores)
PUBLIC_FIREBASE_PROJECT_ID=tu-proyecto-firebase
PUBLIC_FIREBASE_API_KEY=AIzaSy...
```

### Iniciar servidor de desarrollo
```bash
npm run dev
```

El servidor leerá el puerto configurado en `process.env.PORT` (por defecto `4321`).

### Compilar para Producción
```bash
npm run build
npm run preview
```

---

## ☁️ Despliegue en la Nube (Render, Railway, Heroku, Vercel, etc.)

Esta aplicación está adaptada para leer automáticamente el puerto desde `process.env.PORT` asignado por proveedores de hosting como Render, Railway, Fly.io, Heroku o Google Cloud Run.

Basta con configurar las siguientes variables de entorno en el panel de tu hosting:
- `PORT` (usualmente inyectado por el proveedor).
- `PUBLIC_FIREBASE_PROJECT_ID` (el ID de tu proyecto en Firebase).
- `PUBLIC_FIREBASE_API_KEY` (la Web API Key pública de Firebase).

---

## 🧪 Pruebas Automatizadas

El proyecto cuenta con suites de pruebas unitarias con Node.js:
```bash
node tests/secret_dice_rolls.test.mjs
node tests/calculations.test.mjs
node tests/journal_privacy.test.mjs
node tests/dm_control_grimoire.test.mjs
```
