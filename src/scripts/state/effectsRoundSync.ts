// src/scripts/state/effectsRoundSync.ts
// Descuenta rondas de los efectos activos según el combate de la campaña activa (Spec 07, Fase B, FB-2).
// Corre en el cliente del dueño del personaje: el DM no escribe el documento del jugador.
import { campaignStore } from './campaignStore.ts';
import { characterStore } from './characterStore.ts';
import { subscribeCombat } from '../data/combatService.ts';
import { normalizeStatus, canPerform } from '../vtt/sessionStatus.ts';
import type { Combat } from '../models/combat.ts';

let started = false;
let unsubscribe: (() => void) | null = null;
let subscribedCid: string | null = null;

function handleSnapshot(cid: string, combat: Combat | null) {
  // Sin combate, o partida pausada/terminada: no se toca nada (los efectos `rounds` conservan lo que quedaba).
  if (!combat || !combat.active) return;
  const status = normalizeStatus(campaignStore.getCampaign(cid)?.status);
  if (!canPerform('dmPlay', 'dm', status)) return;
  // Si el usuario es el DM de esa campaña, no hace nada.
  if (campaignStore.isCurrentUserDm(cid)) return;
  // Una sola escritura por snapshot (tick + marca). El store aplica la regla de "no descontar si la ronda retrocede".
  characterStore.syncEffectsRound(cid, combat.round);
}

function resubscribe() {
  const cid = campaignStore.getActiveCampaignId();
  if (cid === subscribedCid) return;
  unsubscribe?.();
  unsubscribe = null;
  subscribedCid = cid;
  if (!cid) return;
  // subscribeCombat comparte el único listener de Firestore por campaña.
  unsubscribe = subscribeCombat(cid, (combat) => handleSnapshot(cid, combat));
}

/** Inicia la sincronización una sola vez. */
export function startEffectsRoundSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('active-campaign-changed', resubscribe);
  resubscribe();
}
