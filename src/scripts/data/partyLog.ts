// src/scripts/data/partyLog.ts
// Bitácora automática de acciones relevantes del DM (RF-43): una línea visible para todo el grupo.
//
// DECISION (F5-18): solo escribe con la partida 'active' (las reglas de journal exigen canPlay()).
// En 'paused' no escribe y no falla: lo que el DM prepara en pausa no queda en la crónica.
// DECISION (F5-19): lo escribe únicamente el DM; los servicios que lo llaman ya son acciones de DM.
// Los descansos y el inicio/fin de combate ya registran su propia entrada: no se duplican aquí.

import { campaignStore } from '../state/campaignStore.ts';
import { journalStore } from '../state/journalStore.ts';
import { normalizeStatus, canPerform } from '../vtt/sessionStatus.ts';

/**
 * Agrega una entrada pública (`party`) a la bitácora de la campaña.
 * Devuelve true si se escribió, false si se omitió (no es el DM, la campaña no existe o no está activa).
 */
export function logPartyEvent(cid: string, title: string, content: string, tags: string[] = []): boolean {
  const campaign = campaignStore.getCampaign(cid);
  if (!campaign) return false;
  if (!campaignStore.isCurrentUserDm(cid)) return false;
  if (!canPerform('dmPlay', 'dm', normalizeStatus(campaign.status))) return false;

  try {
    journalStore.addEntry({
      title,
      content,
      tags,
      sessionNumber: campaign.sessionNumber || 1,
      campaignId: cid,
      authorName: campaign.dmName || 'Dungeon Master',
      isDmOnly: false,
    });
    return true;
  } catch (err) {
    // La bitácora nunca debe romper la acción principal (revelar un token, cambiar de mapa).
    console.warn('[partyLog] No se pudo registrar el evento:', err);
    return false;
  }
}
