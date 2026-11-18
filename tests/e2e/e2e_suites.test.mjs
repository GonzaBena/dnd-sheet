// tests/e2e/e2e_suites.test.mjs
// Envoltorio node:test de las suites E2E en Python (Playwright + Brave). Fuera del glob de `pnpm test`
// (tarda varios minutos): se ejecuta con `pnpm test:e2e`. Con E2E_CLOUD=1 incluye la suite de nube.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PYTHON_BIN = process.env.PYTHON_BIN || '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3';
const BRAVE_BIN = process.env.BRAVE_BIN || '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';

test('Suites E2E (Playwright + Brave): compañeros, mapa táctico, ficha de jugador, herramientas del DM y nube', async (t) => {
  assert.ok(fs.existsSync(PYTHON_BIN), `Python con Playwright debe existir en ${PYTHON_BIN}`);
  assert.ok(fs.existsSync(BRAVE_BIN), `Brave debe existir en ${BRAVE_BIN}`);
  assert.ok(fs.existsSync(path.resolve('dist', 'index.html')), 'Compilá la app primero (pnpm build)');

  const args = ['tests/e2e/run_all.py', '--json'];
  if (process.env.E2E_CLOUD === '1') args.push('--cloud');
  const run = spawnSync(PYTHON_BIN, args, { encoding: 'utf8', timeout: 45 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 });
  const lines = (run.stdout || '').trim().split('\n');
  const results = JSON.parse(lines[lines.length - 1] || '[]');
  assert.ok(results.length > 0, `Las suites no produjeron resultados:\n${run.stderr}`);

  for (const r of results) {
    const label = r.xfail ? `${r.name} [XFAIL bug conocido]` : r.xpass ? `${r.name} [XPASS]` : r.name;
    await t.test(label, { skip: r.skipped ? 'omitida' : false }, () => {
      assert.equal(r.passed, true, r.error || 'Falló escenario E2E');
    });
  }
});
