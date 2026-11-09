// scripts/generate-srd-cache.mjs
// Genera los archivos JSON de caché del SRD para las ediciones 2024 y 2014
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');
const PUBLIC_DATA_DIR = path.join(ROOT_DIR, 'public', 'data', 'srd');

const GITHUB_RAW_BASE = 'https://raw.githubusercontent.com/5e-bits/5e-srd-api/main/packages/5e-database/src';

const ENDPOINTS_MAP = {
  '2024': [
    { key: 'spells', file: '5e-SRD-Spells.json' },
    { key: 'equipment', file: '5e-SRD-Equipment.json' },
    { key: 'magic-items', file: '5e-SRD-Magic-Items.json' },
    { key: 'classes', file: '5e-SRD-Classes.json' },
    { key: 'species', file: '5e-SRD-Species.json' },
    { key: 'feats', file: '5e-SRD-Feats.json' },
    { key: 'weapon-properties', file: '5e-SRD-Weapon-Properties.json' },
    { key: 'weapon-mastery', file: '5e-SRD-Weapon-Mastery-Properties.json' }
  ],
  '2014': [
    { key: 'spells', file: '5e-SRD-Spells.json' },
    { key: 'equipment', file: '5e-SRD-Equipment.json' },
    { key: 'magic-items', file: '5e-SRD-Magic-Items.json' },
    { key: 'classes', file: '5e-SRD-Classes.json' },
    { key: 'races', file: '5e-SRD-Races.json' },
    { key: 'feats', file: '5e-SRD-Feats.json' },
    { key: 'weapon-properties', file: '5e-SRD-Weapon-Properties.json' }
  ]
};

async function fetchJsonWithRetry(url, retries = 3) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'dnd-sheet-builder/1.0' } });
      if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
      return await res.json();
    } catch (err) {
      if (attempt === retries) throw err;
      console.warn(`[Retry ${attempt}/${retries}] Failed to fetch ${url}: ${err.message}. Retrying in 1s...`);
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}

async function run() {
  console.log('--- Iniciando generación de caché SRD (2024 & 2014) ---');

  for (const edition of ['2024', '2014']) {
    const targetDir = path.join(PUBLIC_DATA_DIR, edition);
    if (!fs.existsSync(targetDir)) {
      fs.mkdirSync(targetDir, { recursive: true });
    }

    const items = ENDPOINTS_MAP[edition];
    for (const item of items) {
      const url = `${GITHUB_RAW_BASE}/${edition}/en/${item.file}`;
      const destPath = path.join(targetDir, `${item.key}.json`);

      console.log(`[${edition}] Descargando ${item.key} (${item.file})...`);
      try {
        const data = await fetchJsonWithRetry(url);
        fs.writeFileSync(destPath, JSON.stringify(data, null, 2), 'utf-8');
        const count = Array.isArray(data) ? data.length : (data.results ? data.results.length : 1);
        console.log(`✓ [${edition}] Guardado ${item.key}.json (${count} elementos)`);
      } catch (err) {
        console.error(`✗ Error al descargar ${url}:`, err.message);
      }
    }
  }

  console.log('--- Caché SRD generado exitosamente en public/data/srd/ ---');
}

run().catch((e) => {
  console.error('Fatal error generating SRD cache:', e);
  process.exit(1);
});
