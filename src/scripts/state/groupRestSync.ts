// src/scripts/state/groupRestSync.ts
// Descanso de grupo del DM: el DM emite un evento y cada hoja lo aplica a su propio personaje
// (recursos y efectos). El DM no puede escribir `activeEffects` de los jugadores (reglas de Firestore).
import { campaignStore } from './campaignStore.ts';
import { characterStore } from './characterStore.ts';
import { userStore } from './userStore.ts';
import type { DmEvent } from '../models/campaign.ts';

/** Lo llama el DM tras un descanso de grupo. */
export function broadcastGroupRest(cid: string, rest: 'short' | 'long') {
  campaignStore.sendDmEvent(cid, {
    campaignId: cid,
    type: 'group_rest',
    dmName: campaignStore.getCampaign(cid)?.dmName || 'Dungeon Master',
    payload: { rest },
  });
}

const handled = new Set<string>();
let started = false;

function onEvent(e: Event) {
  const event = (e as CustomEvent<DmEvent>).detail;
  if (!event || event.type !== 'group_rest') return;
  const rest = event.payload?.rest;
  if (rest !== 'short' && rest !== 'long') return;
  if (event.id) {
    if (handled.has(event.id)) return;
    handled.add(event.id);
  }
  // El DM ya aplicó lo suyo.
  if (campaignStore.isCurrentUserDm(event.campaignId)) return;
  const me = userStore.getCurrentUser();
  const camp = campaignStore.getCampaign(event.campaignId);
  if (!camp?.memberUserIds?.includes(me.id)) return;
  // Solo si la hoja abierta es el personaje de esa campaña.
  const char = characterStore.get();
  if (!char || char.campaignId !== event.campaignId) return;
  characterStore.applyGroupRest(rest);
}

/** Inicia la escucha una sola vez. */
export function startGroupRestSync() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('dm-event-received', onEvent);
}
