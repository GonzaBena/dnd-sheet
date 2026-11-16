// src/scripts/ui/hpActions.ts
// Cambios de PG disparados desde la UI sobre cualquier personaje (Grimorio del DM, panel del DM,
// vista de grupo, dados). Pasa por campaignStore.mutateHp (atómico en la nube) y, cuando el
// servidor confirma, registra el cambio en la bitácora una sola vez y sincroniza el combate.
import { campaignStore, type HpMutation } from '../state/campaignStore.ts';
import { journalStore } from '../state/journalStore.ts';
import { syncCombatWithLiveCharacters } from '../data/combatService.ts';
import { describeHpChange, sameHp, type HpOp } from '../dnd/hp.ts';

export interface HpActionOptions {
  /** Quién hace el cambio: se refleja en la bitácora. */
  actor?: 'self' | 'dm';
  /** false si quien llama ya escribe su propia entrada (p. ej. descansos de grupo). */
  log?: boolean;
  /** Campaña cuyo combate se re-sincroniza con los PG confirmados. */
  campaignId?: string | null;
}

export function applyHpAction(characterId: string, op: HpOp, options: HpActionOptions = {}): HpMutation {
  const name = campaignStore.getCharacter(characterId)?.name || 'Personaje';
  const mutation = campaignStore.mutateHp(characterId, op);
  void mutation.done.then(change => {
    if (!change) return;
    if (options.log !== false && !sameHp(change.before, change.after)) {
      const entry = describeHpChange(name, op, change, options.actor || 'self');
      journalStore.log(entry.title, entry.content, ['#Combate']);
    }
    if (options.campaignId) void syncCombatWithLiveCharacters(options.campaignId).catch(() => {});
  });
  return mutation;
}
