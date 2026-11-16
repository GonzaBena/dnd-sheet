// tests/e2e_browser_full.test.mjs
// Real Headless Browser E2E Test Suite using Playwright + Brave Browser against the built Astro app (dist/).
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const PYTHON_BIN = '/Library/Frameworks/Python.framework/Versions/3.14/bin/python3';
const BRAVE_BIN = '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser';
const DIST_DIR = path.resolve('dist');

test('Suite E2E en navegador real (Playwright + Brave Headless) sobre la app compilada', async (t) => {
  assert.ok(fs.existsSync(PYTHON_BIN), `Python 3.14 con Playwright debe existir en ${PYTHON_BIN}`);
  assert.ok(fs.existsSync(BRAVE_BIN), `Brave Browser debe existir en ${BRAVE_BIN}`);
  assert.ok(fs.existsSync(path.join(DIST_DIR, 'index.html')), 'El directorio dist/ debe estar compilado');

  const stdout = execFileSync(PYTHON_BIN, ['tests/run_e2e_browser.py'], {
    encoding: 'utf8',
    timeout: 90000,
    maxBuffer: 10 * 1024 * 1024,
  });

  const lines = stdout.trim().split('\n');
  const jsonLine = lines[lines.length - 1];
  const results = JSON.parse(jsonLine);

  assert.ok(Array.isArray(results) && results.length >= 5, 'Se deben haber ejecutado los escenarios E2E de navegador');

  for (const r of results) {
    await t.test(r.name, () => {
      assert.equal(r.passed, true, r.error || 'Falló escenario E2E en navegador');
    });
  }
});
