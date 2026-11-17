import type { CharacterData, SectionOrderConfig, CharacterCompanion } from '../models/character.ts';
import { defaultCharacter } from '../data/defaultCharacter.ts';
import { getRandomCharacterAvatar, isBrokenAvatarUrl } from '../data/characterAvatars.ts';
import { recalculateCharacter, calculateLevelUpHpGain } from '../dnd/calculations.ts';
import { spend, recover, resetOn, remaining } from '../dnd/resources.ts';
import { equipAcross, unequipItem, unequipAction, setActionHands, attuneItem, unattuneItem, validSlotsFor, ACTION_PREFIX, type EquipResult, type AcrossResult } from '../dnd/equipment.ts';
import type { EquipSlot, Proficiencies } from '../models/character.ts';
import type { Resource } from '../models/resource.ts';
import type { ActiveEffect } from '../models/effect.ts';
import { buildAttackFromWeapon, upsertAttack } from '../dnd/weaponAttack.ts';
import { getArmorClass } from '../dnd/ac.ts';
import { addEffect, removeEffect, tickRounds, expireOnRest, expireUntilNextTurn, roundDelta, type AddResult } from '../dnd/effects.ts';
import {
  executeShortRestLogic,
  executeLongRestLogic,
  consumeSavedDie,
  getHitDicePools,
} from '../dnd/rests.ts';
import type { HitDie } from '../models/character.ts';
import type { ShortRestResult, LongRestResult, LongRestOptions } from '../models/rest.ts';
import { journalStore } from './journalStore.ts';
import { campaignStore } from './campaignStore.ts';
import { userStore } from './userStore.ts';
import { generateCharacterSyncId } from '../utils/ids.ts';
import { applyHpOp, describeHpChange, normalizeHp, sameHp, type HitPoints, type HpOp } from '../dnd/hp.ts';
import { evaluateConcentrationOnDamage } from '../dnd/concentration.ts';
import { executeReaction, findAvailableReactions } from '../dnd/reactions.ts';
import type { ReactionExecutionResult, ReactionTriggerPayload } from '../models/reaction.ts';

const STORAGE_KEY = 'dnd_active_character_v1';

class CharacterStoreManager {
  private character: CharacterData;
  private channel: any = null;

  constructor() {
    this.character = this.loadFromStorage();
    this.initBroadcastChannel();
    if (typeof window === 'undefined') return;
    window.addEventListener('all-characters-updated', () => {
      if (campaignStore.isCloudMode()) return;
      if (!this.character?.id) return;
      const updated = campaignStore.getCharacter(this.character.id);
      if (!updated) return;
      const next = recalculateCharacter(JSON.parse(JSON.stringify(updated)));
      const strip = (c: any) => {
        const { updatedAt, layoutConfig, hpRev, ...rest } = c || {};
        return rest;
      };
      if (JSON.stringify(strip(next)) !== JSON.stringify(strip(this.character))) {
        this.loadCharacter(next, true);
      }
    });
    // PG confirmados por el servidor, cambios de otro cliente (DM) o reversión de un cambio rechazado.
    window.addEventListener('character-hp-changed', ((e: CustomEvent<{ id: string; hp: HitPoints }>) => {
      const { id, hp } = e.detail || ({} as any);
      if (!id || !hp || id !== this.character?.id) return;
      if (sameHp(this.character.hp, hp)) return;
      const prevCurrent = this.character.hp.current;
      this.character.hp = { ...hp };
      if (prevCurrent > hp.current) {
        const dmg = prevCurrent - hp.current;
        this.checkConcentrationOnDamage(dmg);
        this.checkReactionsOnDamage(dmg);
      }
      this.saveAndNotify(false, true);
    }) as EventListener);
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('character-updated', {
        detail: { character: this.character, fromHydration: true }
      }));
    }, 0);
  }

  private initBroadcastChannel() {
    if (typeof BroadcastChannel !== 'undefined') {
      try {
        this.channel = new BroadcastChannel('dnd_character_bus_v1');
        if (typeof (this.channel as any).unref === 'function') {
          (this.channel as any).unref();
        }
        this.channel.onmessage = (event: MessageEvent) => {
          if (event.data?.type === 'character-sync' && event.data.character) {
            const incoming = event.data.character;
            if (this.character && this.character.id === incoming.id) {
              this.character = recalculateCharacter(JSON.parse(JSON.stringify(incoming)));
              if (typeof window !== 'undefined') {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(this.character));
                window.dispatchEvent(new CustomEvent('character-updated', {
                  detail: { character: this.character, fromRemote: true }
                }));
              }
            }
          }
        };
      } catch (_) {}
    }
  }

  private loadFromStorage(): CharacterData {
    if (typeof window === 'undefined') {
      return defaultCharacter;
    }
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        let parsed = JSON.parse(saved);
        if (parsed.id === 'elysian-ventosombra' || parsed.name === 'Elysian Ventosombra') {
          parsed.id = 'atlas';
          parsed.name = 'Atlas';
          if (parsed.sessionContext?.campaignName === 'Maldición de Strahd') {
            parsed.sessionContext.campaignName = 'Aventura Independiente';
            parsed.sessionContext.sessionNumber = 1;
            parsed.sessionContext.location = 'Tierras Salvajes';
          }
        }
        // En modo local, si el personaje también existe en dnd_all_characters_v1 (campaignStore),
        // priorizamos la versión de campaignStore por si el DM o el combate modificó sus PG.
        const fromCampaignStore = !campaignStore.isCloudMode() && parsed.id
          ? campaignStore.getCharacter(parsed.id)
          : undefined;
        if (fromCampaignStore) {
          parsed = JSON.parse(JSON.stringify(fromCampaignStore));
        }
        if (isBrokenAvatarUrl(parsed.avatarUrl)) {
          parsed.avatarUrl = getRandomCharacterAvatar();
        }
        return recalculateCharacter(parsed);
      }
    } catch (e) {
      console.warn('Error loading character from localStorage, using default', e);
    }
    return defaultCharacter;
  }

  public get(): CharacterData {
    return this.character;
  }

  private saveAndNotify(broadcast = true, fromRemote = false) {
    if (campaignStore.isCloudMode()) {
      const currentUid = userStore.getCurrentUser().id;
      if (currentUid && (!this.character.userId || this.character.userId === 'user-me')) {
        this.character.userId = currentUid;
      }
    }
    this.character = recalculateCharacter(this.character);
    if (!fromRemote) {
      (this.character as any).updatedAt = Date.now();
    }
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.character));
      window.dispatchEvent(new CustomEvent('character-updated', {
        detail: { character: this.character, fromRemote }
      }));
    }
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'character-sync', character: this.character });
      } catch (_) {}
    }
  }

  public loadCharacter(newChar: CharacterData, fromRemote = false) {
    this.character = recalculateCharacter(JSON.parse(JSON.stringify(newChar)));
    this.saveAndNotify(!fromRemote, fromRemote);
  }

  /**
   * Único camino para cambiar los PG del personaje activo. Si la ficha existe en campaignStore pasa por
   * campaignStore.mutateHp (en la nube: transacción sobre el valor del servidor, con valor optimista y
   * reversión si falla). La bitácora se escribe una sola vez, al confirmarse, con los valores reales.
   * Devuelve los valores optimistas para animar la UI.
   */
  private changeHp(op: HpOp, journal: boolean = true): { before: HitPoints; after: HitPoints } {
    const id = this.character.id;
    const name = this.character.name;
    const log = (change: { before: HitPoints; after: HitPoints }) => {
      if (!journal || sameHp(change.before, change.after)) return;
      const entry = describeHpChange(name, op, change);
      journalStore.log(entry.title, entry.content, ['#Combate']);
    };

    if (id && campaignStore.usesAtomicHp() && campaignStore.getCharacter(id)) {
      const mutation = campaignStore.mutateHp(id, op);
      // campaignStore ya avisó con 'character-hp-changed'; esto cubre el caso en que la ficha activa
      // tenía otro valor que la de campaignStore.
      if (!sameHp(this.character.hp, mutation.optimistic)) {
        this.character.hp = { ...mutation.optimistic };
        this.saveAndNotify(false, true);
      }
      if (mutation.before.current > mutation.optimistic.current) {
        const dmg = mutation.before.current - mutation.optimistic.current;
        this.checkConcentrationOnDamage(dmg);
        this.checkReactionsOnDamage(dmg);
      }
      void mutation.done.then(change => { if (change) log(change); });
      return { before: mutation.before, after: mutation.optimistic };
    }

    // Sin nube (o ficha que todavía no existe en la nube): se aplica a la ficha activa y el guardado
    // normal la propaga a campaignStore. No se usa campaignStore.mutateHp porque su copia puede no
    // tener cambios de la ficha activa que aún no se guardaron (p. ej. dados de golpe en shortRest).
    const before = normalizeHp(this.character.hp);
    const after = applyHpOp(before, op);
    this.character.hp = after;
    if (before.current > after.current) {
      const dmg = before.current - after.current;
      this.checkConcentrationOnDamage(dmg);
      this.checkReactionsOnDamage(dmg);
    }
    this.saveAndNotify();
    log({ before, after });
    return { before, after };
  }

  public checkConcentrationOnDamage(damageTaken: number): void {
    const check = evaluateConcentrationOnDamage(this.character, damageTaken);
    if (check && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('concentration-check-required', { detail: check }));
    }
  }

  public checkReactionsOnDamage(damageTaken: number, damageType?: string): void {
    if (damageTaken <= 0 || !this.isReactionAvailable()) return;
    const trigger: ReactionTriggerPayload = {
      triggerType: 'damage_taken',
      targetCharacterId: this.character.id,
      damageAmount: damageTaken,
      damageType,
    };
    const reactions = findAvailableReactions(this.character, trigger).filter((r) => r.canExecute);
    if (reactions.length > 0 && typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('show-reaction-prompt', {
          detail: { trigger, reactions },
        })
      );
    }
  }

  public modifyHp(delta: number, silent: boolean = false): { current: number; max: number; old: number } {
    const { before, after } = this.changeHp({ kind: 'delta', amount: delta }, !silent);
    return { current: after.current, max: after.max, old: before.current };
  }

  public setHp(current: number, max: number, temp: number) {
    this.changeHp({ kind: 'set', current, max, temp });
  }

  /** Cambia los PG máximos (edición de la ficha); si estaba al máximo, o keepFull, queda al máximo. */
  public setMaxHp(max: number, keepFull = false) {
    this.changeHp({ kind: 'setMax', max, keepFull }, false);
  }

  public toggleInspiration(): boolean {
    this.character.inspiration = !this.character.inspiration;
    this.saveAndNotify();
    journalStore.log(
      'Inspiración',
      `Inspiración ${this.character.inspiration ? 'otorgada ✨' : 'utilizada'}.`,
      ['#Combate']
    );
    return this.character.inspiration;
  }

  public updateStat(statKey: keyof CharacterData['stats'], newScore: number) {
    if (this.character.stats[statKey]) {
      const oldScore = this.character.stats[statKey].score;
      const clamped = Math.max(1, Math.min(30, newScore));
      this.character.stats[statKey].baseScore = clamped;
      this.character.stats[statKey].score = clamped;
      this.saveAndNotify();
      journalStore.log(
        `Atributo ${statKey.toUpperCase()} modificado`,
        `Puntuación cambiada de ${oldScore} a ${this.character.stats[statKey].score} (Mod: ${this.character.stats[statKey].modifier >= 0 ? '+' : ''}${this.character.stats[statKey].modifier}).`,
        ['#Configuración']
      );
    }
  }

  public updateLevel(newLevel: number) {
    const oldLevel = this.character.level;
    const boundedLevel = Math.max(1, Math.min(20, newLevel));
    if (boundedLevel === oldLevel) return;

    const oldMaxHp = this.character.hp.max;
    const levelDiff = boundedLevel - oldLevel;

    // PG según 5e: el máximo sube (o baja) por los dados de golpe; ver applyHpOp 'setMax'.
    const die = this.character.hitDice?.die || 'd10';
    const conMod = this.character.stats.con.modifier;
    const hpChange = calculateLevelUpHpGain(die, conMod, Math.abs(levelDiff));
    const newMaxHp = levelDiff > 0 ? oldMaxHp + hpChange : Math.max(1, oldMaxHp - hpChange);
    this.setMaxHp(newMaxHp);

    // Hit Dice adjustments
    if (!this.character.hitDice) {
      this.character.hitDice = { total: boundedLevel, remaining: boundedLevel, die: 'd10' };
    } else {
      const oldRemaining = this.character.hitDice.remaining;
      const oldTotal = this.character.hitDice.total;
      this.character.hitDice.total = boundedLevel;
      if (oldRemaining >= oldTotal) {
        this.character.hitDice.remaining = boundedLevel;
      } else if (levelDiff > 0) {
        this.character.hitDice.remaining = Math.min(boundedLevel, oldRemaining + levelDiff);
      } else {
        this.character.hitDice.remaining = Math.min(boundedLevel, oldRemaining);
      }
    }

    this.character.level = boundedLevel;
    this.saveAndNotify();
    journalStore.log(
      `¡Nivel del Personaje: Nivel ${this.character.level}!`,
      `El personaje avanzó del Nivel ${oldLevel} al Nivel ${this.character.level}. PG Máximos aumentados a ${this.character.hp.max} (${this.character.hp.current}/${this.character.hp.max} PG). Bono de competencia: +${this.character.proficiencyBonus}.`,
      ['#Configuración', '#Hito']
    );
  }

  public updateFullCharacter(updated: CharacterData) {
    this.character = recalculateCharacter(updated);
    this.saveAndNotify();
    journalStore.log(
      'Configuración del Personaje guardada',
      `Perfil actualizado: "${this.character.name}" (Nivel ${this.character.level} ${this.character.className}, CA ${getArmorClass(this.character)}, PG máx ${this.character.hp.max}).`,
      ['#Configuración']
    );
  }

  public updateProfile(updates: Partial<Pick<CharacterData, 'name' | 'title' | 'race' | 'alignment' | 'className' | 'subclass' | 'avatarUrl' | 'quote'>>) {
    Object.assign(this.character, updates);
    this.saveAndNotify();
    const details = Object.entries(updates)
      .filter(([k]) => k !== 'avatarUrl')
      .map(([k, v]) => `${k}: "${v}"`)
      .join(', ');
    journalStore.log(
      'Perfil de Personaje actualizado',
      `Se actualizaron datos del personaje (${details || 'imagen cambiada'}).`,
      ['#Configuración']
    );
  }

  public updateCurrency(newCurrency: CharacterData['currency'], reason?: string) {
    const old = { ...this.character.currency };
    this.character.currency = {
      cp: Math.max(0, newCurrency.cp || 0),
      sp: Math.max(0, newCurrency.sp || 0),
      ep: Math.max(0, newCurrency.ep || 0),
      gp: Math.max(0, newCurrency.gp || 0),
      pp: Math.max(0, newCurrency.pp || 0),
    };
    this.saveAndNotify();

    const diffs: string[] = [];
    if (newCurrency.gp !== old.gp) diffs.push(`${newCurrency.gp - old.gp >= 0 ? '+' : ''}${newCurrency.gp - old.gp} PO`);
    if (newCurrency.sp !== old.sp) diffs.push(`${newCurrency.sp - old.sp >= 0 ? '+' : ''}${newCurrency.sp - old.sp} PP`);
    if (newCurrency.cp !== old.cp) diffs.push(`${newCurrency.cp - old.cp >= 0 ? '+' : ''}${newCurrency.cp - old.cp} PC`);
    if (newCurrency.pp !== old.pp) diffs.push(`${newCurrency.pp - old.pp >= 0 ? '+' : ''}${newCurrency.pp - old.pp} PPT`);
    if (newCurrency.ep !== old.ep) diffs.push(`${newCurrency.ep - old.ep >= 0 ? '+' : ''}${newCurrency.ep - old.ep} PE`);

    const totalGp = (
      this.character.currency.cp * 0.01 +
      this.character.currency.sp * 0.1 +
      this.character.currency.ep * 0.5 +
      this.character.currency.gp +
      this.character.currency.pp * 10
    ).toFixed(2);

    journalStore.log(
      'Bolsa de Monedas actualizada',
      `${reason ? `${reason}. ` : ''}Movimiento: ${diffs.join(', ') || 'Sin variación'}. Fondos actuales: ${this.character.currency.gp} PO, ${this.character.currency.sp} PP, ${this.character.currency.cp} PC, ${this.character.currency.pp} PPT (${totalGp} PO equiv.).`,
      ['#Botín']
    );
  }

  public toggleSkill(skillId: string, type: 'proficient' | 'expertise') {
    const skill = this.character.skills.find(s => s.id === skillId);
    if (skill) {
      if (type === 'proficient') {
        skill.proficient = !skill.proficient;
        if (!skill.proficient) skill.expertise = false;
      } else if (type === 'expertise') {
        skill.expertise = !skill.expertise;
        if (skill.expertise) skill.proficient = true;
      }
      this.saveAndNotify();
      journalStore.log(
        `Habilidad: ${skill.name}`,
        `Competencia=${skill.proficient ? 'Sí' : 'No'}, Pericia=${skill.expertise ? 'Sí (x2)' : 'No'}.`,
        ['#Configuración']
      );
    }
  }

  public updateSkillConfig(skillId: string, updates: { proficient?: boolean; expertise?: boolean; customBonus?: number }) {
    const skill = this.character.skills.find(s => s.id === skillId);
    if (skill) {
      if (typeof updates.proficient === 'boolean') skill.proficient = updates.proficient;
      if (typeof updates.expertise === 'boolean') skill.expertise = updates.expertise;
      if (typeof updates.customBonus === 'number') skill.customBonus = updates.customBonus;
      this.saveAndNotify();
      journalStore.log(
        `Habilidad ajustada: ${skill.name}`,
        `Nueva configuración para ${skill.name}: Competente=${skill.proficient ? 'Sí' : 'No'}, Pericia=${skill.expertise ? 'Sí (x2)' : 'No'}, Bono obj=${skill.customBonus || 0}. Modificador total: ${skill.modifier >= 0 ? '+' : ''}${skill.modifier}.`,
        ['#Configuración']
      );
    }
  }

  public updateSkillsAndSaves(stats: CharacterData['stats'], skills: CharacterData['skills']) {
    this.character.stats = stats;
    this.character.skills = skills;
    this.saveAndNotify();
    journalStore.log(
      'Habilidades y Salvaciones configuradas',
      'Se guardaron las competencias, pericias y bonos de equipo para las habilidades y salvaciones.',
      ['#Configuración']
    );
  }

  public toggleSavingThrow(statKey: keyof CharacterData['stats']) {
    if (this.character.stats[statKey]) {
      this.character.stats[statKey].savingProficient = !this.character.stats[statKey].savingProficient;
      this.saveAndNotify();
      journalStore.log(
        `Tirada de Salvación: ${statKey.toUpperCase()}`,
        `Competencia de salvación ${this.character.stats[statKey].savingProficient ? 'activada' : 'desactivada'}.`,
        ['#Configuración']
      );
    }
  }

  public addInventoryItem(item: Omit<CharacterData['inventory'][0], 'id'>): string {
    const id = `item-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    this.character.inventory.push({ ...item, id });
    this.saveAndNotify();
    journalStore.log(
      'Objeto añadido al inventario',
      `Se guardó "${item.name}" (Cantidad: x${item.quantity}, Peso: ${item.weightLb} lb, Tipo: ${item.category}).`,
      ['#Botín']
    );
    return id;
  }

  public updateInventoryItem(id: string, updates: Partial<CharacterData['inventory'][0]>) {
    const itemIndex = this.character.inventory.findIndex(i => i.id === id);
    if (itemIndex === -1) return;
    const old = this.character.inventory[itemIndex];
    let nextItem = { ...old, ...updates, id };

    // Si el objeto estaba equipado y se cambió el equipSlot a una ranura distinta o incompatible,
    // se desequipa para no quedar en una ranura inválida o atascado en la anterior.
    if (nextItem.equipped && nextItem.slot && updates.equipSlot !== undefined) {
      const validSlots = validSlotsFor(nextItem);
      if (!validSlots.includes(nextItem.slot)) {
        nextItem = { ...nextItem, equipped: false, slot: undefined };
      }
    }

    this.character.inventory[itemIndex] = nextItem;
    this.saveAndNotify();
    journalStore.log(
      'Objeto de mochila modificado',
      `Se actualizaron los detalles de "${this.character.inventory[itemIndex].name}".`,
      ['#Botín']
    );
  }

  public removeInventoryItem(id: string, quantityToRemove?: number) {
    const item = this.character.inventory.find(i => i.id === id);
    if (!item) return;

    const itemName = item.name || 'Objeto';
    const total = item.quantity || 1;
    const toRemove = (quantityToRemove !== undefined && quantityToRemove > 0)
      ? Math.min(quantityToRemove, total)
      : total;

    if (toRemove >= total) {
      this.character.inventory = this.character.inventory.filter(i => i.id !== id);
      if (this.character.quickSlotItemId === id) {
        this.character.quickSlotItemId = null;
      }
      this.saveAndNotify();
      journalStore.log(
        'Objeto retirado de la mochila',
        `Se eliminó "${itemName}" (x${total}) del inventario.`,
        ['#Botín']
      );
    } else {
      item.quantity = total - toRemove;
      this.saveAndNotify();
      journalStore.log(
        'Objetos descartados de la mochila',
        `Se descartaron ${toRemove}x "${itemName}". Quedan ${item.quantity} en la mochila.`,
        ['#Botín']
      );
    }
  }

  public addSpell(spell: CharacterData['spellcasting']['spells'][0]) {
    if (!this.character.spellcasting) return;
    const id = spell.id || `spell-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    this.character.spellcasting.spells.push({ ...spell, id });
    this.saveAndNotify();
    journalStore.log(
      spell.level === 0 ? 'Nuevo truco preparado' : 'Nuevo conjuro preparado',
      `Se añadió "${spell.name}" al grimorio (${spell.level === 0 ? 'Truco' : `Nivel ${spell.level}`}, Escuela: ${spell.school}, Tiempo: ${spell.castingTime}, Alcance: ${spell.range}).`,
      ['#Magia']
    );
  }

  public updateSpell(idOrName: string, updates: Partial<CharacterData['spellcasting']['spells'][0]>) {
    if (!this.character.spellcasting) return;
    const spellIndex = this.character.spellcasting.spells.findIndex(s => s.id === idOrName || s.name === idOrName);
    if (spellIndex === -1) return;
    const old = this.character.spellcasting.spells[spellIndex];
    this.character.spellcasting.spells[spellIndex] = { ...old, ...updates };
    this.saveAndNotify();
    journalStore.log(
      'Conjuro/Truco modificado',
      `Se actualizaron los detalles y notas de "${this.character.spellcasting.spells[spellIndex].name}".`,
      ['#Magia']
    );
  }

  public removeSpell(idOrName: string) {
    if (!this.character.spellcasting) return;
    const sp = this.character.spellcasting.spells.find(s => s.id === idOrName || s.name === idOrName);
    const spName = sp?.name || idOrName;
    this.character.spellcasting.spells = this.character.spellcasting.spells.filter(s => s.id !== idOrName && s.name !== idOrName);
    this.saveAndNotify();
    journalStore.log(
      'Conjuro olvidado',
      `Se eliminó "${spName}" del grimorio activo.`,
      ['#Magia']
    );
  }

  public addAction(action: Omit<CharacterData['actions'][0], 'id'>) {
    const id = `act-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    this.character.actions.push({ ...action, id });
    this.saveAndNotify();
    journalStore.log(
      'Acción/Arma preparada',
      `Se equipó "${action.name}" (${action.type}, Bono: ${action.bonus}, Daño: ${action.damage} ${action.damageType}).`,
      ['#Combate']
    );
  }

  public updateAction(id: string, updates: Partial<CharacterData['actions'][0]>) {
    const actIndex = this.character.actions.findIndex(a => a.id === id);
    if (actIndex === -1) return;
    const old = this.character.actions[actIndex];
    this.character.actions[actIndex] = { ...old, ...updates, id };
    this.saveAndNotify();
    journalStore.log(
      'Arma/Acción modificada',
      `Se actualizó "${this.character.actions[actIndex].name}" (${this.character.actions[actIndex].bonus}, Daño: ${this.character.actions[actIndex].damage}).`,
      ['#Combate']
    );
  }

  public removeAction(id: string) {
    const act = this.character.actions.find(a => a.id === id);
    const actName = act?.name || 'Acción';
    this.character.actions = this.character.actions.filter(a => a.id !== id);
    this.saveAndNotify();
    journalStore.log(
      'Acción/Arma retirada',
      `Se retiró "${actName}" de las armas/acciones disponibles.`,
      ['#Combate']
    );
  }

  public useSpellSlot(level: number) {
    const slot = this.character.spellcasting.slots[level];
    if (slot && slot.used < slot.total) {
      slot.used++;
      this.saveAndNotify();
      journalStore.log(
        `Espacio de conjuro gastado (Nivel ${level})`,
        `Se utilizó un espacio de Nivel ${level}. Espacios restantes: ${slot.total - slot.used}/${slot.total}.`,
        ['#Magia']
      );
    }
  }

  public restoreSpellSlot(level: number) {
    const slot = this.character.spellcasting.slots[level];
    if (slot && slot.used > 0) {
      slot.used--;
      this.saveAndNotify();
      journalStore.log(
        `Espacio de conjuro recuperado (Nivel ${level})`,
        `Se restableció 1 espacio de Nivel ${level}. Espacios disponibles: ${slot.total - slot.used}/${slot.total}.`,
        ['#Magia']
      );
    }
  }

  // ---- Registro de recursos (Spec 07, Fase A) ----

  /**
   * DECISION: se mantiene la fuente vieja (wildShape / features[].uses) hasta que la UI migre.
   * Cada cambio en un recurso migrado se refleja hacia atrás en su fuente legacy.
   */
  private syncLegacyFromResource(r: Resource) {
    if (r.id === 'wildShape' && this.character.wildShape) {
      this.character.wildShape.usesTotal = r.max;
      this.character.wildShape.usesRemaining = remaining(r);
    } else if (r.id.startsWith('feature:')) {
      const fid = r.id.slice('feature:'.length);
      const f = this.character.features.find((x) => x.id === fid);
      if (f) f.uses = `${remaining(r)}/${r.max}`;
    }
  }

  /** Refleja wildShape (fuente vieja) en el recurso `wildShape`. */
  private syncWildShapeResource() {
    const ws = this.character.wildShape;
    const r = this.character.resources?.find((x) => x.id === 'wildShape');
    if (!ws || !r) return;
    r.max = ws.usesTotal;
    r.used = Math.max(0, ws.usesTotal - ws.usesRemaining);
  }

  public addResource(partial: Partial<Resource> & { name: string; max: number }) {
    const resource: Resource = {
      id: partial.id ?? `res-${Date.now()}-${this.character.resources.length}`,
      name: partial.name,
      max: partial.max,
      used: partial.used ?? 0,
      rechargeOn: partial.rechargeOn ?? 'manual',
      source: partial.source ?? 'custom',
      ...(partial.values ? { values: partial.values } : {}),
    };
    this.character.resources.push(resource);
    this.saveAndNotify();
    return resource;
  }

  public updateResource(id: string, patch: Partial<Omit<Resource, 'id'>>) {
    const idx = this.character.resources.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = { ...this.character.resources[idx], ...patch };
    next.used = Math.min(next.max, Math.max(0, next.used));
    this.character.resources[idx] = next;
    this.syncLegacyFromResource(next);
    this.saveAndNotify();
  }

  public removeResource(id: string) {
    this.character.resources = this.character.resources.filter((r) => r.id !== id);
    this.saveAndNotify();
  }

  public spendResource(id: string, n: number = 1) {
    const idx = this.character.resources.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = spend(this.character.resources[idx], n);
    this.character.resources[idx] = next;
    this.syncLegacyFromResource(next);
    this.saveAndNotify();
  }

  public recoverResource(id: string, n: number = 1) {
    const idx = this.character.resources.findIndex((r) => r.id === id);
    if (idx < 0) return;
    const next = recover(this.character.resources[idx], n);
    this.character.resources[idx] = next;
    this.syncLegacyFromResource(next);
    this.saveAndNotify();
  }

  public setResourceValues(id: string, values: number[]) {
    const r = this.character.resources.find((x) => x.id === id);
    if (!r) return;
    r.values = values.slice(0, r.max);
    this.saveAndNotify();
  }

  // ---- Combate en la Hoja: Turnos, Modificadores y Reacciones (Spec 11, H4 & Spec 12, H5) ----

  private lastSyncedCombatKey: string | null = null;

  public resetTurn(options?: { forceResetReaction?: boolean }): void {
    if (!this.character.turnState) this.character.turnState = {};
    this.character.turnState.usedModifiers = [];

    const isInCampaign = Boolean(this.character.campaignId);
    if (!isInCampaign || options?.forceResetReaction) {
      this.character.turnState.reactionUsed = false;
      const { effects, expired } = expireUntilNextTurn(this.character.activeEffects);
      this.character.activeEffects = effects;
      this.saveAndNotify();
      this.emitEffectsExpired(expired);
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('character-reaction-changed', {
          detail: { characterId: this.character.id, reactionUsed: false }
        }));
      }
    } else {
      this.saveAndNotify();
    }
  }

  public markTurnModifierUsed(id: string): void {
    if (!this.character.turnState) this.character.turnState = { usedModifiers: [] };
    if (!Array.isArray(this.character.turnState.usedModifiers)) this.character.turnState.usedModifiers = [];
    if (!this.character.turnState.usedModifiers.includes(id)) {
      this.character.turnState.usedModifiers.push(id);
      this.saveAndNotify();
    }
  }

  public isTurnModifierUsed(id: string): boolean {
    return Boolean(this.character.turnState?.usedModifiers?.includes(id));
  }

  public isReactionAvailable(): boolean {
    return !Boolean(this.character.turnState?.reactionUsed);
  }

  public useReaction(name?: string): boolean {
    if (!this.character.turnState) this.character.turnState = {};
    this.character.turnState.reactionUsed = true;
    this.saveAndNotify();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('character-reaction-changed', {
        detail: { characterId: this.character.id, reactionUsed: true, name }
      }));
    }
    return true;
  }

  public resetReaction(): void {
    if (!this.character.turnState) this.character.turnState = {};
    this.character.turnState.reactionUsed = false;
    const { effects, expired } = expireUntilNextTurn(this.character.activeEffects);
    this.character.activeEffects = effects;
    this.saveAndNotify();
    this.emitEffectsExpired(expired);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('character-reaction-changed', {
        detail: { characterId: this.character.id, reactionUsed: false }
      }));
    }
  }

  public executeReaction(
    reactionId: string,
    options?: { spellSlotLevel?: number; damageTaken?: number; triggerPayload?: any }
  ): ReactionExecutionResult {
    const { updatedCharacter, result } = executeReaction(this.character, reactionId, options);
    this.character = updatedCharacter;
    this.saveAndNotify();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('character-reaction-changed', {
        detail: { characterId: this.character.id, reactionUsed: true, reactionName: result.reactionName }
      }));
    }
    journalStore.log(result.reactionName, result.logMessage, ['#Combate', '#Reacción']);
    return result;
  }

  // ---- Efectos activos (Spec 07, Fase B) ----

  private emitEffectsExpired(expired: ActiveEffect[]) {
    if (expired.length && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('effects-expired', { detail: { expired } }));
    }
  }

  /** Aplica un efecto. Devuelve `replaced` si había otro de concentración (no lo quita, FB-6). */
  public applyEffect(effect: ActiveEffect): AddResult {
    const result = addEffect(this.character.activeEffects, effect);
    this.character.activeEffects = result.effects;
    this.saveAndNotify();
    return result;
  }

  public endEffect(id: string) {
    this.character.activeEffects = removeEffect(this.character.activeEffects, id);
    this.saveAndNotify();
  }

  public clearEffects() {
    this.character.activeEffects = [];
    this.saveAndNotify();
  }

  /** Descuenta rondas y devuelve los efectos expirados. */
  public tickEffects(rounds: number): ActiveEffect[] {
    const { effects, expired } = tickRounds(this.character.activeEffects, rounds);
    this.character.activeEffects = effects;
    this.saveAndNotify();
    this.emitEffectsExpired(expired);
    return expired;
  }

  /**
   * FB-2: sincroniza con la ronda del combate en una sola escritura (tick + marca).
   * Solo descuenta si es la misma campaña y la ronda avanzó (ver `roundDelta`).
   */
  public syncEffectsRound(campaignId: string, round: number): ActiveEffect[] {
    const last = this.character.effectsLastRound;
    const delta = roundDelta(last, { campaignId, round });
    const markChanged = !last || last.campaignId !== campaignId || last.round !== round;
    if (delta <= 0 && !markChanged) return [];
    let expired: ActiveEffect[] = [];
    if (delta > 0) {
      const ticked = tickRounds(this.character.activeEffects, delta);
      this.character.activeEffects = ticked.effects;
      expired = ticked.expired;
    }
    this.character.effectsLastRound = { campaignId, round };
    this.saveAndNotify();
    this.emitEffectsExpired(expired);
    return expired;
  }

  /**
   * Sincroniza el turno de combate con el personaje: si es su turno, restablece su reacción y modificadores.
   */
  public syncCombatTurn(combat: { active: boolean; round?: number; turnIndex: number; combatants: { characterId?: string }[] }): void {
    if (!combat || !combat.active || !this.character?.id) return;
    const currentCombatant = combat.combatants[combat.turnIndex];
    const currentKey = `${combat.round ?? 1}-${combat.turnIndex}-${currentCombatant?.characterId ?? ''}`;
    if (this.lastSyncedCombatKey === currentKey) return;
    this.lastSyncedCombatKey = currentKey;

    if (currentCombatant && currentCombatant.characterId === this.character.id) {
      this.resetTurn({ forceResetReaction: true });
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('combat-turn-started', {
          detail: { characterId: this.character.id, round: combat.round, turnIndex: combat.turnIndex }
        }));
      }
    }
  }

  private expireEffectsOnRest(rest: 'short' | 'long'): ActiveEffect[] {
    const { effects, expired } = expireOnRest(this.character.activeEffects, rest);
    this.character.activeEffects = effects;
    return expired;
  }

  /** Reinicia recursos según el descanso y devuelve los nombres de los que se recuperaron. */
  private applyRestToResources(rest: 'short' | 'long'): string[] {
    const before = this.character.resources;
    const after = resetOn(before, rest);
    const recovered: string[] = [];
    after.forEach((r, i) => {
      if (before[i].used > 0 || (before[i].values?.length ?? 0) > 0) {
        if (r !== before[i]) recovered.push(r.name);
      }
      this.syncLegacyFromResource(r);
    });
    this.character.resources = after;
    return recovered;
  }

  public setQuickSlotItem(itemId: string | null) {
    this.character.quickSlotItemId = itemId;
    this.saveAndNotify();
    const item = itemId ? this.character.inventory.find(i => i.id === itemId) : null;
    journalStore.log(
      'Acceso Rápido de Mochila',
      itemId && item ? `Se asignó "${item.name}" como objeto de acceso rápido en la mochila.` : 'Se desasignó el objeto de acceso rápido.',
      ['#Botín']
    );
  }

  public consumeItem(itemId: string): { success: boolean; healed?: number; name?: string } {
    const item = this.character.inventory.find(i => i.id === itemId);
    if (!item || item.quantity <= 0) return { success: false };

    item.quantity--;
    const heal = item.healAmount || (item.id.includes('healing') ? 10 : 0);
    if (heal > 0) {
      this.modifyHp(heal, true);
    }

    const remaining = item.quantity;
    if (remaining <= 0) {
      // If quick slot was pointing to this item, unpin it
      if (this.character.quickSlotItemId === itemId) {
        this.character.quickSlotItemId = null;
      }
      this.character.inventory = this.character.inventory.filter(i => i.id !== itemId);
    }

    this.saveAndNotify();

    const actionVerb = item.usableType === 'edible' ? 'comió' : item.usableType === 'usable' ? 'usó' : 'bebió';
    const tag = heal > 0 ? '#Combate' : '#Botín';

    journalStore.log(
      `Objeto consumido: "${item.name}"`,
      `El personaje ${actionVerb} 1 dosis de "${item.name}".${heal > 0 ? ` Recuperados +${heal} PG (Salud: ${this.character.hp.current}/${this.character.hp.max} PG).` : ''} Restantes: ${remaining}.`,
      [tag]
    );

    return { success: true, healed: heal, name: item.name };
  }

  public consumePotion(potionId: string): boolean {
    return this.consumeItem(potionId).success;
  }

  public updateSessionContext(context: CharacterData['sessionContext']) {
    this.character.sessionContext = { ...context };
    this.saveAndNotify();
    journalStore.log(
      'Datos de Campaña actualizados',
      `Campaña: "${context.campaignName}" (Sesión ${context.sessionNumber}). Clima: ${context.weather}. Ubicación: ${context.location}.`,
      ['#Configuración']
    );
  }

  // Equipo y sintonización (Spec 08, Fase A). Una sola escritura por acción.
  public equipItem(itemId: string, slot: EquipSlot): AcrossResult {
    return this.equipKey(itemId, slot);
  }

  public equipWeapon(actionId: string, slot: EquipSlot): AcrossResult {
    return this.equipKey(ACTION_PREFIX + actionId, slot);
  }

  private equipKey(key: string, slot: EquipSlot): AcrossResult {
    const result = equipAcross(this.character.inventory, this.character.actions, key, slot);
    if (result.error) return result;
    this.character.inventory = result.inventory;
    this.character.actions = result.actions;
    this.saveAndNotify();
    const name = key.startsWith(ACTION_PREFIX)
      ? result.actions.find(a => a.id === key.slice(ACTION_PREFIX.length))?.name
      : result.inventory.find(i => i.id === key)?.name;
    journalStore.log(
      'Objeto equipado',
      `"${name}" equipado en ${slot}.` +
        (result.unequipped.length ? ` Se quitó: ${result.unequipped.map(i => i.name).join(', ')}.` : ''),
      ['#Equipo']
    );
    return result;
  }

  // DECISION (FE-2): crear o actualizar el ataque es una acción explícita, nunca automática al equipar.
  // DECISION (FE-7): al desequipar el arma la acción no se borra; se elimina a mano.
  public createAttackFromWeapon(itemId: string): boolean {
    const item = this.character.inventory.find(i => i.id === itemId);
    if (!item?.weapon) return false;
    this.character.actions = upsertAttack(this.character.actions, buildAttackFromWeapon(this.character, item));
    this.saveAndNotify();
    return true;
  }

  public unequipWeapon(actionId: string) {
    this.character.actions = unequipAction(this.character.actions, actionId);
    this.saveAndNotify();
  }

  public setWeaponHands(actionId: string, hands: 1 | 2) {
    this.character.actions = setActionHands(this.character.actions, actionId, hands);
    this.saveAndNotify();
  }

  public unequipItem(itemId: string) {
    this.character.inventory = unequipItem(this.character.inventory, itemId);
    this.saveAndNotify();
  }

  // Competencias y avisos (Spec 08, Fase C). Una escritura por cambio.
  public setProficiencies(prof: Proficiencies) {
    this.character.proficiencies = { armor: [...prof.armor], weapons: [...prof.weapons] };
    this.saveAndNotify();
  }

  /** FD-6: número = override manual; `undefined` vuelve al cálculo. Una sola escritura. */
  public setManualAc(value: number | undefined) {
    if (typeof value === 'number' && Number.isFinite(value)) this.character.armorClass = Math.round(value);
    else delete this.character.armorClass;
    this.saveAndNotify();
  }

  public setIgnoreWarnings(itemId: string, ignore: boolean) {
    this.character.inventory = this.character.inventory.map(i =>
      i.id === itemId ? { ...i, ignoreWarnings: ignore } : i
    );
    this.saveAndNotify();
  }

  public attuneItem(itemId: string): EquipResult {
    const result = attuneItem(this.character.inventory, itemId);
    if (result.error) return result;
    this.character.inventory = result.inventory;
    this.saveAndNotify();
    return result;
  }

  public unattuneItem(itemId: string) {
    this.character.inventory = unattuneItem(this.character.inventory, itemId);
    this.saveAndNotify();
  }

  public toggleFeature(featureId: string): boolean {
    const feat = this.character.features.find(f => f.id === featureId);
    if (feat) {
      feat.enabled = feat.enabled !== false ? false : true;
      this.saveAndNotify();
      journalStore.log(
        `Rasgo del Guardián: ${feat.title}`,
        `Rasgo ${feat.enabled ? 'activado' : 'desactivado'}.`,
        ['#Configuración']
      );
      return feat.enabled;
    }
    return false;
  }

  public addFeature(feature: Omit<CharacterData['features'][0], 'id'> & { id?: string }) {
    const id = feature.id || `feat-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    this.character.features.unshift({
      ...feature,
      id,
      enabled: feature.enabled !== false
    });
    this.saveAndNotify();
    journalStore.log(
      'Nuevo Rasgo/Dote adquirido',
      `Se agregó el rasgo "${feature.title}" a los rasgos del personaje.`,
      ['#Configuración']
    );
    return id;
  }

  public updateFeatures(features: CharacterData['features']) {
    this.character.features = features.map((f, i) => ({
      ...f,
      id: f.id || `feat-${i + 1}-${Date.now()}`,
      enabled: f.enabled !== false
    }));
    this.saveAndNotify();
    journalStore.log(
      'Rasgos y Dotes actualizados',
      `Se actualizaron los rasgos de clase del personaje (${features.length} rasgos registrados).`,
      ['#Configuración']
    );
  }

  public executeShortRest(spentDice: { die: HitDie; roll?: number }[]): ShortRestResult {
    const { char, result } = executeShortRestLogic(this.character, { spent: spentDice });
    this.character = char;
    this.saveAndNotify();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('short-rest-completed', { detail: result }));
    }
    const spentText = result.spentDice.map((d) => `${d.die} (sacó ${d.roll} + ${d.conMod} CON = ${d.total} PG)`).join(', ');
    journalStore.log(
      'Descanso Corto completado',
      `Descanso de 1 hora completado. Curados +${result.healedHp} PG (Salud actual: ${this.character.hp.current}/${this.character.hp.max}). Dados gastados: ${spentText || 'Ninguno'}. Dados restantes: ${result.remainingDiceTotal}/${this.character.hitDice.total}.${result.recoveredResources.length ? ` Recursos recuperados: ${result.recoveredResources.join(', ')}.` : ''}${result.expiredEffects.length ? ` Efectos terminados: ${result.expiredEffects.join(', ')}.` : ''}`,
      ['#Descanso']
    );
    return result;
  }

  public shortRest(hitDiceToSpend: number = 1): { healed: number; remainingDice: number } {
    const pools = getHitDicePools(this.character);
    const availablePool = pools.find((p) => p.remaining > 0);
    const die = (availablePool?.die || this.character.hitDice?.die || 'd10') as HitDie;
    const count = Math.min(availablePool?.remaining ?? 0, hitDiceToSpend);
    const spentList: { die: HitDie }[] = [];
    for (let i = 0; i < count; i++) {
      spentList.push({ die });
    }
    const res = this.executeShortRest(spentList);
    return { healed: res.healedHp, remainingDice: res.remainingDiceTotal };
  }

  /**
   * Descanso de grupo ordenado por el DM. Los PG ya los escribió el DM, así que el corto solo
   * reinicia recursos y quita efectos; el largo es el descanso completo.
   */
  public applyGroupRest(rest: 'short' | 'long') {
    if (rest === 'long') {
      this.longRest();
      return;
    }
    const recovered = this.applyRestToResources('short');
    const expired = this.expireEffectsOnRest('short');
    this.saveAndNotify();
    this.emitEffectsExpired(expired);
    journalStore.log(
      'Descanso Corto de Grupo',
      `El Dungeon Master decretó un descanso corto.${recovered.length ? ` Recursos recuperados: ${recovered.join(', ')}.` : ''}${expired.length ? ` Efectos terminados: ${expired.map((e) => e.name).join(', ')}.` : ''}`,
      ['#Descanso']
    );
  }

  public executeLongRest(options: LongRestOptions = {}): LongRestResult {
    const { char, result } = executeLongRestLogic(this.character, options);
    this.character = char;
    this.saveAndNotify();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('long-rest-completed', { detail: result }));
    }
    const diceText = result.recoveredDice.map((d) => `+${d.count} ${d.die}`).join(', ');
    const portentText = result.savedDiceRolled.length
      ? ` Portento obtenido: ${result.savedDiceRolled.map((p) => `${p.resourceName} [${p.values.join(', ')}]`).join(', ')}.`
      : '';
    journalStore.log(
      'Descanso Largo completado',
      `Descanso de 8 horas completado. Salud restaurada al 100% (${this.character.hp.max}/${this.character.hp.max} PG). Recuperados Dados de Golpe: ${diceText || '0'} (${result.remainingDiceTotal}/${this.character.hitDice.total}). Todos los espacios de conjuro y formas salvajes restablecidos.${portentText}${result.recoveredResources.length ? ` Recursos recuperados: ${result.recoveredResources.join(', ')}.` : ''}${result.expiredEffects.length ? ` Efectos terminados: ${result.expiredEffects.join(', ')}.` : ''}`,
      ['#Descanso']
    );
    return result;
  }

  public longRest(): LongRestResult {
    return this.executeLongRest();
  }

  public consumePortentDie(resourceId: string, valueOrIndex: number | { index: number }) {
    if (!Array.isArray(this.character.resources)) return null;
    const rIndex = this.character.resources.findIndex((r) => r.id === resourceId);
    if (rIndex === -1) return null;
    const { resource, value } = consumeSavedDie(this.character.resources[rIndex], valueOrIndex);
    this.character.resources[rIndex] = resource;
    this.saveAndNotify();
    journalStore.log(
      'Dado de Portento utilizado',
      `Se utilizó el dado guardado [${value}] de ${resource.name}. Usos restantes: ${resource.max - resource.used}/${resource.max}.`,
      ['#Recursos']
    );
    return { resource, value };
  }

  public updateLayoutConfig(updates: Partial<CharacterData['layoutConfig']>) {
    if (!this.character.layoutConfig) {
      this.character.layoutConfig = {
        activeTab: 'all',
        showSpells: true,
        showWildShape: false,
        showWeapons: true,
        showInventory: true,
        showJournal: true,
        showSkills: true,
        classPreset: 'custom'
      };
    }
    Object.assign(this.character.layoutConfig, updates);
    this.saveAndNotify();
    journalStore.log(
      'Configuración de Paneles actualizada',
      `Preferencias de visualización de módulos guardadas.`,
      ['#Configuración']
    );
  }

  public updateSectionOrder(order: Partial<SectionOrderConfig>) {
    if (!this.character.layoutConfig) this.updateLayoutConfig({});

    // Sincronizar unifiedOrder y columnas
    let col1 = order.col1 ? [...order.col1] : undefined;
    let col2 = order.col2 ? [...order.col2] : undefined;
    let unified = order.unifiedOrder && order.unifiedOrder.length > 0 
      ? [...order.unifiedOrder] 
      : undefined;

    if (!col1 || !col2) {
      if (unified && unified.length > 0) {
        col1 = unified.slice(0, 4);
        col2 = unified.slice(4);
      } else {
        col1 = this.character.layoutConfig?.sectionOrder?.col1 ? [...this.character.layoutConfig.sectionOrder.col1] : ['abilities', 'saves', 'skills', 'features'];
        col2 = this.character.layoutConfig?.sectionOrder?.col2 ? [...this.character.layoutConfig.sectionOrder.col2] : ['weapons', 'wildshape', 'currency', 'backpack', 'spells'];
      }
    }

    if (!unified) {
      unified = [...col1, ...col2];
    }

    this.character.layoutConfig!.sectionOrder = {
      col1,
      col2,
      unifiedOrder: unified
    };
    this.saveAndNotify();
  }

  public resetSectionOrder() {
    this.updateSectionOrder({
      col1: ['abilities', 'saves', 'skills', 'features'],
      col2: ['weapons', 'wildshape', 'currency', 'backpack', 'spells'],
      unifiedOrder: ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells']
    });
  }

  public toggleSectionCollapsed(sectionId: string, force?: boolean): boolean {
    if (!this.character.layoutConfig) this.updateLayoutConfig({});
    if (!Array.isArray(this.character.layoutConfig!.collapsedSections)) {
      this.character.layoutConfig!.collapsedSections = [];
    }

    const list = this.character.layoutConfig!.collapsedSections;
    const idx = list.indexOf(sectionId);
    const shouldCollapse = force !== undefined ? force : idx === -1;

    if (shouldCollapse && idx === -1) {
      list.push(sectionId);
    } else if (!shouldCollapse && idx !== -1) {
      list.splice(idx, 1);
    }

    this.saveAndNotify();
    return shouldCollapse;
  }

  public setAllSectionsCollapsed(collapsed: boolean) {
    if (!this.character.layoutConfig) this.updateLayoutConfig({});
    const allSections = ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells', 'armor'];
    this.character.layoutConfig!.collapsedSections = collapsed ? [...allSections] : [];
    this.saveAndNotify();
  }

  public isSectionCollapsed(sectionId: string): boolean {
    return Boolean(this.character.layoutConfig?.collapsedSections?.includes(sectionId));
  }

  public setActiveTab(tab: any) {
    if (!this.character.layoutConfig) this.updateLayoutConfig({});
    if (this.character.layoutConfig) {
      this.character.layoutConfig.activeTab = tab;
      this.saveAndNotify();
    }
  }

  public setViewMode(mode: 'standard' | 'table') {
    if (!this.character.layoutConfig) this.updateLayoutConfig({});
    if (this.character.layoutConfig) {
      this.character.layoutConfig.viewMode = mode;
      this.saveAndNotify();
    }
  }

  public getViewMode(): 'standard' | 'table' {
    return this.character.layoutConfig?.viewMode || 'standard';
  }

  public applyClassPreset(preset: 'wizard' | 'druid' | 'fighter' | 'rogue' | 'cleric' | 'custom') {
    if (!this.character.layoutConfig) this.updateLayoutConfig({});
    const cfg = this.character.layoutConfig!;
    cfg.classPreset = preset;

    if (preset === 'wizard') {
      cfg.showSpells = true;
      cfg.showWildShape = false;
      cfg.showWeapons = false;
      cfg.showSkills = true;
      cfg.showInventory = true;
      cfg.activeTab = 'spells';
    } else if (preset === 'druid') {
      cfg.showSpells = true;
      cfg.showWildShape = true;
      cfg.showWeapons = true;
      cfg.showSkills = true;
      cfg.showInventory = true;
      cfg.activeTab = 'wildshape';
    } else if (preset === 'fighter') {
      cfg.showSpells = false;
      cfg.showWildShape = false;
      cfg.showWeapons = true;
      cfg.showSkills = true;
      cfg.showInventory = true;
      cfg.activeTab = 'combat';
    } else if (preset === 'rogue') {
      cfg.showSpells = false;
      cfg.showWildShape = false;
      cfg.showWeapons = true;
      cfg.showSkills = true;
      cfg.showInventory = true;
      cfg.activeTab = 'skills';
    } else if (preset === 'cleric') {
      cfg.showSpells = true;
      cfg.showWildShape = false;
      cfg.showWeapons = true;
      cfg.showSkills = true;
      cfg.showInventory = true;
      cfg.activeTab = 'combat';
    } else {
      cfg.activeTab = 'all';
    }

    this.saveAndNotify();
    journalStore.log(
      `Preset de clase aplicado: ${preset.toUpperCase()}`,
      `Se ajustaron las pestañas y módulos visuales para la clase ${preset}.`,
      ['#Configuración']
    );
  }

  public transformWildShape(form: any) {
    if (!this.character.wildShape) {
      this.character.wildShape = { usesTotal: 2, usesRemaining: 2, activeForm: null };
    }
    if (form && this.character.wildShape.usesRemaining > 0) {
      this.character.wildShape.usesRemaining--;
    }
    this.character.wildShape.activeForm = form;
    this.syncWildShapeResource();
    this.saveAndNotify();

    if (form) {
      journalStore.log(
        `Forma Salvaje: ${form.name}`,
        `Transformación en ${form.name} (PG: ${form.hp.max}, CA: ${form.ac}, Velocidad: ${form.speed}). Usos restantes: ${this.character.wildShape.usesRemaining}/${this.character.wildShape.usesTotal}.`,
        ['#Combate', '#Magia']
      );
    } else {
      journalStore.log(
        'Reversión a Forma Humanoide',
        `El druida regresó a su forma natural.`,
        ['#Combate']
      );
    }
  }

  public restoreWildShapeUses() {
    if (!this.character.wildShape) return;
    this.character.wildShape.usesRemaining = this.character.wildShape.usesTotal;
    this.syncWildShapeResource();
    this.saveAndNotify();
  }

  public modifyWildShapeHp(delta: number): number {
    if (!this.character.wildShape?.activeForm) return 0;
    const form = this.character.wildShape.activeForm;
    let next = form.hp.current + delta;
    if (next <= 0) {
      const excessDamage = Math.abs(next);
      const beastName = form.name;
      this.character.wildShape.activeForm = null;
      if (excessDamage > 0) {
        this.modifyHp(-excessDamage, true);
      }
      this.saveAndNotify();
      journalStore.log(
        `¡Forma Salvaje derrotada! (${beastName})`,
        `La bestia cayó a 0 PG y se disipó.${excessDamage > 0 ? ` Daño excedente de ${excessDamage} PG transferido al druida (Salud actual: ${this.character.hp.current}/${this.character.hp.max}).` : ''}`,
        ['#Combate']
      );
      return 0;
    } else {
      form.hp.current = Math.min(form.hp.max, next);
      this.saveAndNotify();
      journalStore.log(
        `Daño a Forma Salvaje: ${form.name}`,
        `PG de la forma animal: ${form.hp.current}/${form.hp.max}.`,
        ['#Combate']
      );
      return form.hp.current;
    }
  }

  public resetToDefault() {
    this.character = JSON.parse(JSON.stringify(defaultCharacter));
    this.character.avatarUrl = getRandomCharacterAvatar();
    this.saveAndNotify();
    journalStore.log(
      'Personaje restablecido por defecto',
      'Se han reiniciado todas las estadísticas, inventario y configuraciones a los valores de partida.',
      ['#Configuración']
    );
  }

  /**
   * Importa una ficha exportada. El JSON aporta el contenido, nunca la identidad: su id/userId/campaignId
   * pueden venir de otro dispositivo, del modo local o de otra cuenta, y en la nube eso impedía guardarla.
   * - Si la ficha abierta es propia, se reemplaza su contenido conservando id, dueño y campaña.
   * - Si no (p.ej. la ficha por defecto de una cuenta nueva), se crea un personaje nuevo sin campaña.
   */
  public importJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && parsed.name && parsed.stats) {
        const current = this.character;
        const known = campaignStore.getCharacter(current.id);
        const ownsCurrent = !!known && campaignStore.isCharacterOwner(known);

        if (ownsCurrent) {
          this.character = recalculateCharacter({
            ...parsed,
            id: known.id,
            userId: known.userId,
            playerName: known.playerName,
            campaignId: known.campaignId ?? null,
            sessionContext: known.sessionContext,
          });
        } else {
          const me = userStore.getCurrentUser();
          this.character = recalculateCharacter({
            ...parsed,
            id: generateCharacterSyncId(parsed.name),
            userId: me.id,
            playerName: me.name,
            campaignId: null,
            sessionContext: { ...defaultCharacter.sessionContext },
          });
          // Se registra antes de notificar: el listener de campaignStore solo guarda fichas propias conocidas.
          campaignStore.saveCharacter(this.character);
        }
        this.saveAndNotify();
        journalStore.log(
          'Perfil importado desde JSON',
          `Se importaron exitosamente los datos del personaje: "${this.character.name}".`,
          ['#Configuración']
        );
        return true;
      }
    } catch (e) {
      console.error('Failed to import JSON', e);
    }
    return false;
  }

  // ---------------------------------------------------------------------------
  // Compañeros e Invocaciones (Spec 13, H6)
  // ---------------------------------------------------------------------------

  public getCompanions(): CharacterCompanion[] {
    return this.character.companions ? [...this.character.companions] : [];
  }

  public addCompanion(data: Omit<CharacterCompanion, 'id'>): string {
    if (!this.character.companions) {
      this.character.companions = [];
    }
    const id = `comp-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const newCompanion: CharacterCompanion = {
      ...data,
      id,
      size: data.size || 1,
      hp: {
        current: Math.max(0, data.hp?.current ?? data.hp?.max ?? 1),
        max: Math.max(1, data.hp?.max ?? 1),
      },
    };
    this.character.companions.push(newCompanion);
    this.saveAndNotify();
    return id;
  }

  public updateCompanion(companionId: string, patch: Partial<CharacterCompanion>): void {
    if (!this.character.companions) return;
    const idx = this.character.companions.findIndex((c) => c.id === companionId);
    if (idx === -1) return;

    const existing = this.character.companions[idx];
    const updated = { ...existing, ...patch };
    if (patch.hp) {
      const max = Math.max(1, patch.hp.max ?? existing.hp.max);
      const current = Math.max(0, Math.min(patch.hp.current ?? existing.hp.current, max));
      updated.hp = { current, max };
    }
    this.character.companions[idx] = updated;
    this.saveAndNotify();
  }

  public removeCompanion(companionId: string): void {
    if (!this.character.companions) return;
    this.character.companions = this.character.companions.filter((c) => c.id !== companionId);
    this.saveAndNotify();
  }

  public linkCompanionToken(companionId: string, tokenId: string | null): void {
    if (!this.character.companions) return;
    const comp = this.character.companions.find((c) => c.id === companionId);
    if (comp) {
      if (tokenId) {
        comp.tokenId = tokenId;
      } else {
        delete comp.tokenId;
      }
      this.saveAndNotify();
    }
  }

  public exportJson(): string {
    return JSON.stringify(this.character, null, 2);
  }
}

export const characterStore = new CharacterStoreManager();
