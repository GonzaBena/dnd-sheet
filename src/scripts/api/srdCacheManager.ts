// src/scripts/api/srdCacheManager.ts
// Gestor de almacenamiento en caché para datos del SRD de D&D 5e (IndexedDB en navegador + fallback local)

const DB_NAME = 'dnd_sheet_srd_cache_v1';
const DB_VERSION = 1;
const STORE_NAME = 'srd_data';

export type SrdEdition = '2024' | '2014';
export type SrdCategory =
  | 'spells'
  | 'equipment'
  | 'magic-items'
  | 'classes'
  | 'species'
  | 'races'
  | 'feats'
  | 'weapon-properties'
  | 'weapon-mastery';

class SrdCacheManager {
  private memCache = new Map<string, any[]>();
  private dbPromise: Promise<IDBDatabase | null> | null = null;

  constructor() {
    if (typeof window !== 'undefined' && 'indexedDB' in window) {
      this.dbPromise = this.initDb();
    }
  }

  private initDb(): Promise<IDBDatabase | null> {
    return new Promise((resolve) => {
      try {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME);
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
          console.warn('No se pudo inicializar IndexedDB para el caché SRD, usando memoria:', req.error);
          resolve(null);
        };
      } catch (e) {
        console.warn('Excepción al abrir IndexedDB:', e);
        resolve(null);
      }
    });
  }

  private async getFromIndexedDb(key: string): Promise<any[] | null> {
    if (!this.dbPromise) return null;
    const db = await this.dbPromise;
    if (!db) return null;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(key);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => resolve(null);
      } catch {
        resolve(null);
      }
    });
  }

  private async saveToIndexedDb(key: string, data: any[]): Promise<void> {
    if (!this.dbPromise) return;
    const db = await this.dbPromise;
    if (!db) return;

    return new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        store.put(data, key);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      } catch {
        resolve();
      }
    });
  }

  /**
   * Obtiene los datos de una categoría y edición, resolviendo memoria -> IndexedDB -> archivo JSON estático
   */
  public async getCategory<T = any>(edition: SrdEdition, category: SrdCategory): Promise<T[]> {
    const key = `${edition}_${category}`;

    // 1. Memoria rápida
    if (this.memCache.has(key)) {
      return this.memCache.get(key) as T[];
    }

    // 2. IndexedDB
    const fromIdb = await this.getFromIndexedDb(key);
    if (fromIdb && Array.isArray(fromIdb) && fromIdb.length > 0) {
      this.memCache.set(key, fromIdb);
      return fromIdb as T[];
    }

    // 3. Descarga desde el archivo estático JSON servido localmente
    try {
      const url = `/data/srd/${edition}/${category}.json`;
      let data: any = null;

      // Si estamos en entorno Node.js (tests) o browser
      if (typeof window === 'undefined') {
        const fsMod = 'node:fs';
        const pathMod = 'node:path';
        const fs = await import(/* @vite-ignore */ fsMod);
        const path = await import(/* @vite-ignore */ pathMod);
        const filePath = path.resolve(process.cwd(), 'public', 'data', 'srd', edition, `${category}.json`);
        if (fs.existsSync(filePath)) {
          data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        }
      } else {
        const res = await fetch(url);
        if (res.ok) {
          data = await res.json();
        }
      }

      if (Array.isArray(data)) {
        this.memCache.set(key, data);
        await this.saveToIndexedDb(key, data);
        return data as T[];
      }
    } catch (e) {
      console.warn(`Error al cargar datos SRD para ${key}:`, e);
    }

    return [];
  }

  /**
   * Precarga en segundo plano las categorías principales para la edición seleccionada
   */
  public async preloadEdition(edition: SrdEdition): Promise<void> {
    const categories: SrdCategory[] = [
      'spells',
      'equipment',
      'magic-items',
      'classes',
      edition === '2024' ? 'species' : 'races',
      'feats',
      'weapon-properties'
    ];

    await Promise.all(categories.map(cat => this.getCategory(edition, cat)));
  }

  /**
   * Limpia el almacenamiento de IndexedDB y memoria
   */
  public async clearCache(): Promise<void> {
    this.memCache.clear();
    if (this.dbPromise) {
      const db = await this.dbPromise;
      if (db) {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).clear();
      }
    }
  }

  /**
   * Guarda un objeto individual en caché (ej: si se obtuvo en vivo de la API)
   */
  public async appendItem(edition: SrdEdition, category: SrdCategory, item: any): Promise<void> {
    const list = await this.getCategory(edition, category);
    const existingIndex = list.findIndex((i: any) => i.index === item.index);
    if (existingIndex >= 0) {
      list[existingIndex] = item;
    } else {
      list.push(item);
    }
    const key = `${edition}_${category}`;
    this.memCache.set(key, list);
    await this.saveToIndexedDb(key, list);
  }
}

export const srdCacheManager = new SrdCacheManager();
