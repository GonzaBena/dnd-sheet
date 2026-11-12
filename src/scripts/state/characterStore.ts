import type { CharacterData, SectionOrderConfig } from '../models/character.ts';
import { defaultCharacter } from '../data/defaultCharacter.ts';
import { getRandomCharacterAvatar, isBrokenAvatarUrl } from '../data/characterAvatars.ts';
import { recalculateCharacter, calculateLevelUpHpGain } from '../dnd/calculations.ts';
import { spend, recover, resetOn, remaining } from '../dnd/resources.ts';
import { equipAcross, unequipItem, unequipAction, setActionHands, attuneItem, unattuneItem, ACTION_PREFIX, type EquipResult, type AcrossResult } from '../dnd/equipment.ts';
import type { EquipSlot, Proficiencies } from '../models/character.ts';
import type { Resource } from '../models/resource.ts';
import type { ActiveEffect } from '../models/effect.ts';
import { buildAttackFromWeapon, upsertAttack } from '../dnd/weaponAttack.ts';
import { getArmorClass } from '../dnd/ac.ts';
import { addEffect, removeEffect, tickRounds, expireOnRest, roundDelta, type AddResult } from '../dnd/effects.ts';
import { journalStore } from './journalStore.ts';
import { campaignStore } from './campaignStore.ts';
import { userStore } from './userStore.ts';
import { generateCharacterSyncId } from '../utils/ids.ts';

const STORAGE_KEY = 'dnd_active_character_v1';

class CharacterStoreManager {
  private character: CharacterData;
  private channel: any = null;

  constructor() {
    this.character = this.loadFromStorage();
    this.initBroadcastChannel();
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('character-updated', {
        detail: { character: this.character }
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
              this.character = recalculateCharacter(incoming);
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('character-updated', {
                  detail: { character: this.character }
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
        const parsed = JSON.parse(saved);
        if (parsed.id === 'elysian-ventosombra' || parsed.name === 'Elysian Ventosombra') {
          parsed.id = 'atlas';
          parsed.name = 'Atlas';
          if (parsed.sessionContext?.campaignName === 'Maldición de Strahd') {
            parsed.sessionContext.campaignName = 'Aventura Independiente';
            parsed.sessionContext.sessionNumber = 1;
            parsed.sessionContext.location = 'Tierras Salvajes';
          }
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

  private saveAndNotify(broadcast = true) {
    this.character = recalculateCharacter(this.character);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.character));
      window.dispatchEvent(new CustomEvent('character-updated', {
        detail: { character: this.character }
      }));
    }
    if (broadcast && this.channel) {
      try {
        this.channel.postMessage({ type: 'character-sync', character: this.character });
      } catch (_) {}
    }
  }

  public loadCharacter(newChar: CharacterData) {
    this.character = recalculateCharacter(newChar);
    this.saveAndNotify();
  }

  public modifyHp(delta: number, silent: boolean = false): { current: number; max: number; old: number } {
    const old = this.character.hp.current;
    let next = this.character.hp.current + delta;
    if (next < 0) next = 0;
    if (next > this.character.hp.max) next = this.character.hp.max;
    this.character.hp.current = next;
    this.saveAndNotify();

    if (!silent) {
      if (delta < 0) {
        journalStore.log(
          `Daño recibido: ${Math.abs(delta)} PG`,
          `Puntos de Golpe reducidos a ${next}/${this.character.hp.max} PG.`,
          ['#Combate']
        );
      } else if (delta > 0) {
        journalStore.log(
          `Curación recibida: +${delta} PG`,
          `Puntos de Golpe restaurados a ${next}/${this.character.hp.max} PG.`,
          ['#Combate']
        );
      }
    }

    return { current: next, max: this.character.hp.max, old };
  }

  public setHp(current: number, max: number, temp: number) {
    this.character.hp.current = Math.max(0, current);
    this.character.hp.max = Math.max(1, max);
    this.character.hp.temp = Math.max(0, temp);
    this.saveAndNotify();
    journalStore.log(
      'Puntos de Golpe ajustados',
      `Salud fijada en ${this.character.hp.current}/${this.character.hp.max} PG${temp > 0 ? ` (+${temp} PG Temp)` : ''}.`,
      ['#Combate']
    );
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
      this.character.stats[statKey].score = Math.max(1, Math.min(30, newScore));
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
    const wasFullHp = this.character.hp.current >= oldMaxHp;
    const oldCurrentHp = this.character.hp.current;
    const levelDiff = boundedLevel - oldLevel;

    // HP adjustments according to 5e rules
    if (levelDiff > 0) {
      const die = this.character.hitDice?.die || 'd10';
      const conMod = this.character.stats.con.modifier;
      const hpGain = calculateLevelUpHpGain(die, conMod, levelDiff);
      this.character.hp.max = oldMaxHp + hpGain;
      if (wasFullHp) {
        this.character.hp.current = this.character.hp.max;
      } else {
        this.character.hp.current = Math.min(this.character.hp.max, oldCurrentHp + hpGain);
      }
    } else if (levelDiff < 0) {
      const die = this.character.hitDice?.die || 'd10';
      const conMod = this.character.stats.con.modifier;
      const hpLoss = calculateLevelUpHpGain(die, conMod, Math.abs(levelDiff));
      this.character.hp.max = Math.max(1, oldMaxHp - hpLoss);
      this.character.hp.current = Math.min(this.character.hp.max, oldCurrentHp);
    }

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
    this.character.inventory[itemIndex] = { ...old, ...updates, id };
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

  public shortRest(hitDiceToSpend: number = 1): { healed: number; remainingDice: number } {
    const available = this.character.hitDice.remaining;
    const spend = Math.min(available, hitDiceToSpend);
    let healed = 0;
    if (spend > 0) {
      this.character.hitDice.remaining -= spend;
      // D&D 5e: Hit die roll or average + CON mod (min 1 healed per hit die)
      const conMod = this.character.stats.con?.modifier ?? 0;
      const dieSize = parseInt(this.character.hitDice.die.replace(/\D/g, '')) || 10;
      const avgRoll = Math.floor(dieSize / 2) + 1;
      healed = Math.max(1, spend * Math.max(1, avgRoll + conMod));
      this.modifyHp(healed, true); // Silent to avoid double log
    }
    // Recursos con reinicio en descanso corto (incluye Forma Salvaje, migrada al registro).
    // Si wildShape aún no está en el registro, se restaura directo (fuente vieja).
    if (this.character.wildShape && !this.character.resources.some((r) => r.id === 'wildShape')) {
      this.character.wildShape.usesRemaining = this.character.wildShape.usesTotal;
    }
    const recoveredShort = this.applyRestToResources('short');
    const expiredShort = this.expireEffectsOnRest('short');
    this.saveAndNotify();
    this.emitEffectsExpired(expiredShort);

    journalStore.log(
      'Descanso Corto completado',
      `Descanso de 1 hora completado. Gastado ${spend} Dado de Golpe (${this.character.hitDice.die}). Recuperados +${healed} PG (Salud actual: ${this.character.hp.current}/${this.character.hp.max}). Dados restantes: ${this.character.hitDice.remaining}/${this.character.hitDice.total}. Usos de Forma Salvaje restaurados al máximo.${recoveredShort.length ? ` Recursos recuperados: ${recoveredShort.join(', ')}.` : ''}${expiredShort.length ? ` Efectos terminados: ${expiredShort.map((e) => e.name).join(', ')}.` : ''}`,
      ['#Descanso']
    );

    return { healed, remainingDice: this.character.hitDice.remaining };
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

  public longRest() {
    this.character.hp.current = this.character.hp.max;
    this.character.hp.temp = 0;
    // Restore half hit dice (min 1)
    const restoreDice = Math.max(1, Math.floor(this.character.hitDice.total / 2));
    this.character.hitDice.remaining = Math.min(this.character.hitDice.total, this.character.hitDice.remaining + restoreDice);
    // Restore all spell slots
    if (this.character.spellcasting?.slots) {
      for (const n of Object.keys(this.character.spellcasting.slots)) {
        this.character.spellcasting.slots[Number(n)].used = 0;
      }
    }
    // Restore Wild Shape uses
    if (this.character.wildShape) {
      this.character.wildShape.usesRemaining = this.character.wildShape.usesTotal;
      this.character.wildShape.activeForm = null;
    }
    const recoveredLong = this.applyRestToResources('long');
    const expiredLong = this.expireEffectsOnRest('long');
    this.saveAndNotify();
    this.emitEffectsExpired(expiredLong);

    journalStore.log(
      'Descanso Largo completado',
      `Descanso de 8 horas completado. Salud restaurada al 100% (${this.character.hp.max}/${this.character.hp.max} PG). Recuperados +${restoreDice} Dados de Golpe (${this.character.hitDice.remaining}/${this.character.hitDice.total}). Todos los espacios de conjuro y formas salvajes restablecidos.${recoveredLong.length ? ` Recursos recuperados: ${recoveredLong.join(', ')}.` : ''}${expiredLong.length ? ` Efectos terminados: ${expiredLong.map((e) => e.name).join(', ')}.` : ''}`,
      ['#Descanso']
    );
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
    const allSections = ['abilities', 'saves', 'skills', 'features', 'weapons', 'wildshape', 'currency', 'backpack', 'spells'];
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

  public exportJson(): string {
    return JSON.stringify(this.character, null, 2);
  }
}

export const characterStore = new CharacterStoreManager();
