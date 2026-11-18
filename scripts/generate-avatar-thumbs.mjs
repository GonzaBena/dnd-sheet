// Optimiza los retratos de /public/characters/:
//  1. Reduce los originales a MAX_FULL_WIDTH px (solo si son más grandes; la URL no cambia, así que
//     los personajes ya guardados se benefician sin migrar datos).
//  2. Genera miniaturas de THUMB_WIDTH px en /public/characters/thumbs/ para tarjetas y galerías.
// Decodificar AVIF de ~3000 px en tarjetas pequeñas trababa la UI.
// Uso: node scripts/generate-avatar-thumbs.mjs
import { createRequire } from 'node:module';
import { readdir, mkdir, rename } from 'node:fs/promises';
import path from 'node:path';

// sharp llega como dependencia transitiva de astro (pnpm no lo eleva a node_modules/).
const astroRequire = createRequire(createRequire(import.meta.url).resolve('astro/package.json'));
const sharp = astroRequire('sharp');

const SRC_DIR = path.resolve('public/characters');
const OUT_DIR = path.join(SRC_DIR, 'thumbs');
const MAX_FULL_WIDTH = 960;
const THUMB_WIDTH = 480;

await mkdir(OUT_DIR, { recursive: true });
const files = (await readdir(SRC_DIR)).filter((f) => f.endsWith('.avif'));
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

for (const file of files) {
  const src = path.join(SRC_DIR, file);
  const meta = await sharp(src).metadata();

  if ((meta.width ?? 0) > MAX_FULL_WIDTH) {
    const tmp = `${src}.tmp`;
    const info = await sharp(src)
      .resize({ width: MAX_FULL_WIDTH })
      .avif({ quality: 60, effort: 6 })
      .toFile(tmp);
    await rename(tmp, src);
    console.log(`full  ${file}: ${meta.width}x${meta.height} → ${info.width}x${info.height}, ${kb(info.size)}`);
  }

  const info = await sharp(src)
    .resize({ width: THUMB_WIDTH, withoutEnlargement: true })
    .avif({ quality: 55, effort: 6 })
    .toFile(path.join(OUT_DIR, file));
  console.log(`thumb ${file}: ${info.width}x${info.height}, ${kb(info.size)}`);
}
