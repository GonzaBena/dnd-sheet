// src/scripts/data/cloudTypes.ts
// Contratos entre los stores (que no conocen Firebase) y la capa de nube (cloudSync.ts).
import type { DmEvent } from '../models/campaign.ts';
import type { JournalEntry } from '../models/journal.ts';

export interface DocChanges {
  /** Documentos nuevos: se escriben completos. */
  creates: { id: string; data: Record<string, any> }[];
  /** Documentos existentes: solo los campos de primer nivel que cambiaron. */
  updates: { id: string; fields: Record<string, any>; removedKeys: string[] }[];
  deletes: string[];
}

export interface CampaignCloudWriter {
  applyCampaignChanges(changes: DocChanges): void;
  applyCharacterChanges(changes: DocChanges): void;
  isCharacterPending(id: string): boolean;
  sendDmEvent(event: DmEvent): void;
}

export interface JournalCloudWriter {
  addEntry(entry: JournalEntry): void;
  deleteEntry(entry: JournalEntry): void;
}

/** Copia JSON pura (Firestore no acepta undefined ni prototipos). */
export function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

/**
 * Compara el último estado sincronizado (id → JSON) con la lista nueva y devuelve
 * solo lo que hay que escribir. Así los métodos existentes de los stores siguen mutando
 * arrays en memoria y la nube recibe el diff.
 */
export function diffDocs<T extends { id: string }>(
  synced: Map<string, string>,
  next: T[],
  serialize: (item: T) => Record<string, any>,
): DocChanges {
  const changes: DocChanges = { creates: [], updates: [], deletes: [] };
  const seen = new Set<string>();

  for (const item of next) {
    seen.add(item.id);
    const data = serialize(item);
    const prevJson = synced.get(item.id);
    if (prevJson === undefined) {
      changes.creates.push({ id: item.id, data });
      continue;
    }
    const nextJson = JSON.stringify(data);
    if (prevJson === nextJson) continue;

    const prev = JSON.parse(prevJson);
    const fields: Record<string, any> = {};
    for (const key of Object.keys(data)) {
      if (JSON.stringify(prev[key]) !== JSON.stringify(data[key])) {
        fields[key] = data[key];
      }
    }
    const removedKeys = Object.keys(prev).filter(k => !(k in data));
    if (Object.keys(fields).length > 0 || removedKeys.length > 0) {
      changes.updates.push({ id: item.id, fields, removedKeys });
    }
  }

  for (const id of synced.keys()) {
    if (!seen.has(id)) changes.deletes.push(id);
  }
  return changes;
}

export function hasChanges(c: DocChanges): boolean {
  return c.creates.length > 0 || c.updates.length > 0 || c.deletes.length > 0;
}
