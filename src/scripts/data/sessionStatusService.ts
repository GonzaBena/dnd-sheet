// src/scripts/data/sessionStatusService.ts
// Gestión del estado de la sesión de partida (active / paused / ended) en Firestore y RTDB.

import type { SessionStatus, Campaign } from '../models/campaign.ts';
import { canTransition, normalizeStatus, statusLabel } from '../vtt/sessionStatus.ts';
import { campaignStore } from '../state/campaignStore.ts';
import { journalStore } from '../state/journalStore.ts';
import { ensureRoom } from './roomService.ts';
import { getFirebase, isFirebaseConfigured } from '../firebase/client.ts';

/**
 * Cambia el estado de la sesión de una campaña:
 * 1. Valida canTransition y que el usuario sea el DM.
 * 2. Actualiza la campaña en campaignStore (Firestore via cloudSync).
 * 3. Espeja el estado en RTDB (/rooms/{roomId}/status).
 * 4. Agrega un evento de sistema en la bitácora pública (F0B-2).
 * 5. Emite 'session-status-changed'.
 */
export async function setSessionStatus(cid: string, next: SessionStatus): Promise<void> {
  const campaign = campaignStore.getCampaign(cid);
  if (!campaign) throw new Error('Campaña no encontrada.');
  if (!campaignStore.isCurrentUserDm(cid)) {
    throw new Error('Solo el Dungeon Master puede cambiar el estado de la partida.');
  }

  const current = normalizeStatus(campaign.status);
  if (!canTransition(current, next)) {
    throw new Error(`Transición de estado inválida: de ${current} a ${next}.`);
  }

  // 1. Actualizar estado en Firestore
  campaignStore.updateCampaign(cid, {
    status: next,
    statusChangedAt: Date.now(),
  });

  // 2. Espejar en RTDB
  if (isFirebaseConfigured()) {
    try {
      const roomId = await ensureRoom(campaign);
      const { rtdb } = await getFirebase();
      const db = await import('firebase/database');
      await db.set(db.ref(rtdb, `rooms/${roomId}/status`), next);
    } catch (err) {
      console.warn('[SessionStatusService] No se pudo espejar el status en RTDB', err);
    }
  }

  // 3. Registrar entrada de sistema en la bitácora
  const now = new Date();
  const dateStr = now.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const timeStr = now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  journalStore.addEntry({
    title: statusLabel(next),
    content: `Estado de la partida actualizado a "${statusLabel(next)}" el ${dateStr} a las ${timeStr}.`,
    tags: ['#Configuración'],
    sessionNumber: campaign.sessionNumber || 1,
    campaignId: cid,
    authorName: campaign.dmName || 'Dungeon Master',
    systemEvent: 'status',
  });

  // 4. Disparar evento para componentes UI
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('session-status-changed', {
      detail: { campaignId: cid, status: next }
    }));
  }
}

/**
 * Reconcilia el estado en RTDB con la fuente de verdad (Firestore).
 * Si difieren, corrige RTDB.
 */
export async function reconcileStatusMirror(campaign: Campaign): Promise<void> {
  if (!isFirebaseConfigured() || !campaign.liveRoomId) return;
  const targetStatus = normalizeStatus(campaign.status);

  try {
    const { rtdb } = await getFirebase();
    const db = await import('firebase/database');
    const statusRef = db.ref(rtdb, `rooms/${campaign.liveRoomId}/status`);
    const snap = await db.get(statusRef);
    if (snap.val() !== targetStatus) {
      await db.set(statusRef, targetStatus);
    }
  } catch (err) {
    console.warn(`[SessionStatusService] No se pudo reconciliar status en RTDB para ${campaign.id}`, err);
  }
}
