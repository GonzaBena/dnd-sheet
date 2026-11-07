import type { CharacterData } from '../models/character.ts';
import { defaultCharacter } from '../data/defaultCharacter.ts';
import { recalculateCharacter, calculateLevelUpHpGain } from '../dnd/calculations.ts';
import { journalStore } from './journalStore.ts';

const STORAGE_KEY = 'dnd_active_character_v1';

class CharacterStoreManager {
  private character: CharacterData;

  constructor() {
    this.character = this.loadFromStorage();
    if (typeof window === 'undefined') return;
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent('character-updated', {
        detail: { character: this.character }
      }));
    }, 0);
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

  private saveAndNotify() {
    this.character = recalculateCharacter(this.character);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.character));
      window.dispatchEvent(new CustomEvent('character-updated', {
        detail: { character: this.character }
      }));
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
      `Perfil actualizado: "${this.character.name}" (Nivel ${this.character.level} ${this.character.className}, CA ${this.character.armorClass}, PG máx ${this.character.hp.max}).`,
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

  public useSpellSlot(level: 1 | 2) {
    const key = `level${level}` as const;
    const slot = this.character.spellcasting.slots[key];
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

  public restoreSpellSlot(level: 1 | 2) {
    const key = `level${level}` as const;
    const slot = this.character.spellcasting.slots[key];
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

  public updateAttunedItems(items: CharacterData['attunedItems']) {
    this.character.attunedItems = items;
    this.saveAndNotify();
    const activeNames = items.filter(i => !i.name.includes('Libre')).map(i => i.name).join(', ');
    journalStore.log(
      'Objetos Sintonizados configurados',
      `Ranuras de sintonización mágicas actualizadas: ${activeNames || 'Ninguno'}.`,
      ['#Configuración']
    );
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
    // Restore Wild Shape uses for Druids on short rest (Official D&D 5e rule!)
    if (this.character.wildShape) {
      this.character.wildShape.usesRemaining = this.character.wildShape.usesTotal;
    }
    this.saveAndNotify();

    journalStore.log(
      'Descanso Corto completado',
      `Descanso de 1 hora completado. Gastado ${spend} Dado de Golpe (${this.character.hitDice.die}). Recuperados +${healed} PG (Salud actual: ${this.character.hp.current}/${this.character.hp.max}). Dados restantes: ${this.character.hitDice.remaining}/${this.character.hitDice.total}. Usos de Forma Salvaje restaurados al máximo.`,
      ['#Descanso']
    );

    return { healed, remainingDice: this.character.hitDice.remaining };
  }

  public longRest() {
    this.character.hp.current = this.character.hp.max;
    this.character.hp.temp = 0;
    // Restore half hit dice (min 1)
    const restoreDice = Math.max(1, Math.floor(this.character.hitDice.total / 2));
    this.character.hitDice.remaining = Math.min(this.character.hitDice.total, this.character.hitDice.remaining + restoreDice);
    // Restore all spell slots
    if (this.character.spellcasting?.slots) {
      this.character.spellcasting.slots.level1.used = 0;
      this.character.spellcasting.slots.level2.used = 0;
    }
    // Restore Wild Shape uses
    if (this.character.wildShape) {
      this.character.wildShape.usesRemaining = this.character.wildShape.usesTotal;
      this.character.wildShape.activeForm = null;
    }
    this.saveAndNotify();

    journalStore.log(
      'Descanso Largo completado',
      `Descanso de 8 horas completado. Salud restaurada al 100% (${this.character.hp.max}/${this.character.hp.max} PG). Recuperados +${restoreDice} Dados de Golpe (${this.character.hitDice.remaining}/${this.character.hitDice.total}). Todos los espacios de conjuro y formas salvajes restablecidos.`,
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
    this.saveAndNotify();
    journalStore.log(
      'Personaje restablecido por defecto',
      'Se han reiniciado todas las estadísticas, inventario y configuraciones a los valores de partida.',
      ['#Configuración']
    );
  }

  public importJson(jsonString: string): boolean {
    try {
      const parsed = JSON.parse(jsonString);
      if (parsed && parsed.name && parsed.stats) {
        this.character = recalculateCharacter(parsed);
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
