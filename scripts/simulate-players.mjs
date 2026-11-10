// scripts/simulate-players.mjs
// Simula 3 jugadores conectados al emulador moviendo sus tokens en tiempo real (T-36).
// Uso: node scripts/simulate-players.mjs --campaign <cid> --map <mid> [--rogue] [--once]

import { initializeApp } from 'firebase/app';
import {
  getAuth,
  connectAuthEmulator,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
} from 'firebase/auth';
import {
  getFirestore,
  connectFirestoreEmulator,
  doc,
  getDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  getDatabase,
  connectDatabaseEmulator,
  ref,
  set,
  remove,
} from 'firebase/database';

// Parsear argumentos CLI
const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && idx + 1 < args.length) return args[idx + 1];
  return null;
}
const hasFlag = (name) => args.includes(name);

const campaignId = getArg('--campaign') || process.env.CAMPAIGN_ID;
const mapId = getArg('--map') || process.env.MAP_ID;
const isRogue = hasFlag('--rogue');
const runOnce = hasFlag('--once');

const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
const firestoreHost = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const databaseHost = (process.env.FIREBASE_DATABASE_EMULATOR_HOST || '127.0.0.1:9000').split(':');

const firebaseConfig = {
  apiKey: 'demo-api-key',
  projectId: 'demo-dnd-sheet',
  databaseURL: `http://${databaseHost[0]}:${databaseHost[1]}?ns=demo-dnd-sheet-default-rtdb`,
};

const SIM_PLAYERS = [
  { email: 'sim-1@dnd.local', password: 'password123', name: 'Sim 1 (Guerrero)' },
  { email: 'sim-2@dnd.local', password: 'password123', name: 'Sim 2 (Pícaro)' },
  { email: 'sim-3@dnd.local', password: 'password123', name: 'Sim 3 (Maga)' },
];

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function createPlayerSession(config, index) {
  const app = initializeApp(config, `sim-player-${index}`);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });

  const fs = getFirestore(app);
  connectFirestoreEmulator(fs, firestoreHost[0], Number(firestoreHost[1]));

  const rtdb = getDatabase(app);
  connectDatabaseEmulator(rtdb, databaseHost[0], Number(databaseHost[1]));

  const { email, password, name } = SIM_PLAYERS[index];
  let user;

  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    user = cred.user;
  } catch (err) {
    if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      user = cred.user;
    } else {
      throw err;
    }
  }

  return { app, auth, fs, rtdb, user, name };
}

async function main() {
  console.log('=== Simulación de Jugadores en Vivo (VTT T-36) ===');
  console.log(`Auth Emulator: ${authHost}`);
  console.log(`Firestore Emulator: ${firestoreHost.join(':')}`);
  console.log(`RTDB Emulator: ${databaseHost.join(':')}\n`);

  if (!campaignId || !mapId) {
    console.log('⚠️ Argumentos requeridos: --campaign <cid> --map <mid>');
    console.log('Primero autenticando usuarios de prueba para imprimir sus UIDs...\n');
  }

  // 1. Iniciar sesión de los 3 jugadores simulados
  const players = [];
  for (let i = 0; i < SIM_PLAYERS.length; i++) {
    const p = await createPlayerSession(firebaseConfig, i);
    players.push(p);
    console.log(`[Player ${i + 1}] Conectado: ${p.name} | UID: ${p.user.uid}`);
  }

  if (!campaignId || !mapId) {
    console.log('\n💡 Instrucciones:');
    console.log('1. Añade estos UIDs como miembros en tu campaña desde la UI.');
    console.log('2. Crea un token en tu mapa táctico asignado a cada uno.');
    console.log('3. Ejecuta de nuevo:');
    console.log(`   node scripts/simulate-players.mjs --campaign <TU_CID> --map <TU_MID>\n`);
    process.exit(0);
  }

  // 2. Obtener datos de la campaña y sala RTDB
  const mainPlayer = players[0];
  const campSnap = await getDoc(doc(mainPlayer.fs, 'campaigns', campaignId));
  if (!campSnap.exists()) {
    console.error(`❌ No se encontró la campaña "${campaignId}" en Firestore.`);
    process.exit(1);
  }
  const camp = campSnap.data();
  const roomId = camp.liveRoomId;
  if (!roomId) {
    console.error(`❌ La campaña "${campaignId}" no tiene un liveRoomId configurado en Firestore.`);
    process.exit(1);
  }
  console.log(`\nSala RTDB vinculada: ${roomId}`);

  // 3. Obtener tokens asignados en el mapa
  const mapSnap = await getDoc(doc(mainPlayer.fs, 'campaigns', campaignId, 'maps', mapId));
  if (!mapSnap.exists()) {
    console.error(`❌ No se encontró el mapa "${mapId}" en Firestore.`);
    process.exit(1);
  }
  const mapData = mapSnap.data();
  const tokens = mapData.tokens || {};

  const assigned = [];
  for (const player of players) {
    const foundEntry = Object.entries(tokens).find(
      ([_, tok]) => tok.ownerUid === player.user.uid
    );
    if (foundEntry) {
      assigned.push({ player, tid: foundEntry[0], initialToken: foundEntry[1] });
      console.log(`✓ ${player.name} controla el token "${foundEntry[1].name}" (${foundEntry[0]})`);
    } else {
      console.warn(`⚠️ ${player.name} (UID: ${player.user.uid}) no tiene token asignado en el mapa.`);
    }
  }

  if (assigned.length === 0) {
    console.error('❌ Ninguno de los jugadores simulados tiene token asignado en este mapa.');
    process.exit(1);
  }

  // 4. Si se especifica --rogue, probar movimiento no autorizado
  if (isRogue && assigned.length > 0) {
    console.log('\n--- Modo Rogue: comprobando rechazo de token ajeno ---');
    const rogue = assigned[0].player;
    const targetTid = assigned.length > 1 ? assigned[1].tid : 't-unauthorized';

    try {
      await set(ref(rogue.rtdb, `rooms/${roomId}/live/${mapId}/${targetTid}`), {
        x: 999,
        y: 999,
        by: rogue.user.uid,
      });
      console.error('❌ ERROR: RTDB permitió a un jugador escribir en live de un token ajeno!');
    } catch (err) {
      console.log('✓ RTDB rechazó movimiento de token ajeno (PERMISSION_DENIED esperado).');
    }

    try {
      await updateDoc(doc(rogue.fs, 'campaigns', campaignId, 'maps', mapId), {
        [`tokens.${targetTid}.x`]: 999,
        [`tokens.${targetTid}.y`]: 999,
        lastMove: { tokenId: targetTid, by: rogue.user.uid, at: Date.now() },
        updatedAt: Date.now(),
      });
      console.error('❌ ERROR: Firestore permitió a un jugador mover un token ajeno!');
    } catch (err) {
      console.log('✓ Firestore rechazó movimiento de token ajeno (PERMISSION_DENIED esperado).');
    }
    console.log('-----------------------------------------------------\n');
  }

  // 5. Simular movimiento circular fluido
  console.log(`Iniciando simulación de arrastre para ${assigned.length} jugador(es)...`);
  let round = 1;

  async function moveCircle(playerInfo, baseAngleOffset) {
    const { player, tid, initialToken } = playerInfo;
    const centerX = initialToken.x || 200;
    const centerY = initialToken.y || 200;
    const radius = 60;
    const steps = 40; // 40 pasos * 50ms = 2000ms
    const liveRef = ref(player.rtdb, `rooms/${roomId}/live/${mapId}/${tid}`);

    let endX = centerX;
    let endY = centerY;

    for (let step = 0; step < steps; step++) {
      const angle = baseAngleOffset + (step / steps) * (2 * Math.PI);
      endX = Math.round(centerX + radius * Math.cos(angle));
      endY = Math.round(centerY + radius * Math.sin(angle));

      // RTDB live position
      await set(liveRef, {
        x: endX,
        y: endY,
        by: player.user.uid,
      });
      await sleep(50);
    }

    // 1. Firestore commit al soltar (T-34)
    await updateDoc(doc(player.fs, 'campaigns', campaignId, 'maps', mapId), {
      [`tokens.${tid}.x`]: endX,
      [`tokens.${tid}.y`]: endY,
      lastMove: { tokenId: tid, by: player.user.uid, at: Date.now() },
      updatedAt: Date.now(),
    });

    // 2. Limpieza de nodo live (T-34)
    await remove(liveRef);
  }

  do {
    console.log(`[Ronda ${round}] Arrastrando tokens durante 2s...`);
    const promises = assigned.map((info, idx) => moveCircle(info, (idx * 2 * Math.PI) / 3));
    await Promise.all(promises);
    console.log(`[Ronda ${round}] Tokens soltados y guardados en Firestore.`);

    if (runOnce) break;

    console.log('Esperando 5s para siguiente ciclo...\n');
    await sleep(5000);
    round++;
  } while (round <= 5);

  console.log('\n✓ Simulación finalizada con éxito.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Error fatal en la simulación:', err);
  process.exit(1);
});
