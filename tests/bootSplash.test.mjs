// tests/bootSplash.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import {
  shouldShowSplash,
  shouldDismiss,
  SPLASH_MIN_MS,
  SPLASH_SOFT_MAX_MS,
  SPLASH_HARD_MAX_MS,
  ICONS_MAX_MS,
} from '../src/scripts/ui/bootSplash.ts';

test('constantes de tiempo de BootSplash según Spec 16', () => {
  assert.strictEqual(SPLASH_MIN_MS, 300, 'Mínimo de 300ms para evitar micro-parpadeo');
  assert.strictEqual(SPLASH_SOFT_MAX_MS, 8000, 'Tope blando de 8s del módulo');
  assert.strictEqual(SPLASH_HARD_MAX_MS, 12000, 'Tope duro de 12s inline');
  assert.strictEqual(ICONS_MAX_MS, 1500, 'Tope de espera para fuente de íconos');
});

test('shouldShowSplash: página none o legales nunca muestra splash', () => {
  assert.strictEqual(shouldShowSplash({
    page: 'none',
    wasAuthed: true,
    isDemo: false,
    forceLanding: false,
  }), false);

  assert.strictEqual(shouldShowSplash({
    page: 'none',
    wasAuthed: false,
    isDemo: false,
    forceLanding: false,
  }), false);
});

test('shouldShowSplash: home (landing) - regla de oro para visitantes sin sesión', () => {
  // Visitante nuevo en la raíz: sin sesión, sin demo -> SIN SPLASH
  assert.strictEqual(shouldShowSplash({
    page: 'home',
    wasAuthed: false,
    isDemo: false,
    forceLanding: false,
  }), false);
});

test('shouldShowSplash: home (tablero) - usuario con sesión recordada muestra splash', () => {
  // Usuario ya autenticado -> DEBE mostrar splash para no ver la landing ni el pop de datos
  assert.strictEqual(shouldShowSplash({
    page: 'home',
    wasAuthed: true,
    isDemo: false,
    forceLanding: false,
  }), true);
});

test('shouldShowSplash: home (demo) - visitante en demo muestra splash', () => {
  // Usuario en demo -> DEBE mostrar splash para inicializar su personaje demo
  assert.strictEqual(shouldShowSplash({
    page: 'home',
    wasAuthed: false,
    isDemo: true,
    forceLanding: false,
  }), true);
});

test('shouldShowSplash: home con forceLanding (?landing=1) nunca muestra splash', () => {
  // Si fuerza la landing explícitamente (?landing=1), no hay splash
  assert.strictEqual(shouldShowSplash({
    page: 'home',
    wasAuthed: true,
    isDemo: false,
    forceLanding: true,
  }), false);

  assert.strictEqual(shouldShowSplash({
    page: 'home',
    wasAuthed: false,
    isDemo: true,
    forceLanding: true,
  }), false);
});

test('shouldShowSplash: sheet (/campaigns) siempre muestra splash mientras cargan datos', () => {
  assert.strictEqual(shouldShowSplash({
    page: 'sheet',
    wasAuthed: true,
    isDemo: false,
    forceLanding: false,
  }), true);

  assert.strictEqual(shouldShowSplash({
    page: 'sheet',
    wasAuthed: false,
    isDemo: false,
    forceLanding: false,
  }), true);
});

test('shouldShowSplash: party (/partida) siempre muestra splash mientras conecta VTT', () => {
  assert.strictEqual(shouldShowSplash({
    page: 'party',
    wasAuthed: true,
    isDemo: false,
    forceLanding: false,
  }), true);

  assert.strictEqual(shouldShowSplash({
    page: 'party',
    wasAuthed: false,
    isDemo: false,
    forceLanding: false,
  }), true);
});

test('shouldDismiss: no retira si todavía hay holds pendientes y elapsed < SPLASH_SOFT_MAX_MS', () => {
  const s = {
    holds: new Set(['session', 'view']),
    shownAt: 0,
    now: 500,
  };
  assert.strictEqual(shouldDismiss(s), false);
});

test('shouldDismiss: no retira antes del tiempo mínimo aunque se hayan liberado todos los holds', () => {
  const s = {
    holds: new Set(),
    shownAt: 0,
    now: 200, // < SPLASH_MIN_MS (300ms)
  };
  assert.strictEqual(shouldDismiss(s), false);
});

test('shouldDismiss: retira cuando todos los holds están vacíos y elapsed >= SPLASH_MIN_MS', () => {
  const s = {
    holds: new Set(),
    shownAt: 0,
    now: 300, // == SPLASH_MIN_MS
  };
  assert.strictEqual(shouldDismiss(s), true);

  const s2 = {
    holds: new Set(),
    shownAt: 0,
    now: 450, // > SPLASH_MIN_MS
  };
  assert.strictEqual(shouldDismiss(s2), true);
});

test('shouldDismiss: retira por tope blando (8s) aunque queden holds pendientes', () => {
  const s = {
    holds: new Set(['session', 'view', 'icons']),
    shownAt: 0,
    now: 8000, // == SPLASH_SOFT_MAX_MS
  };
  assert.strictEqual(shouldDismiss(s), true, 'Debe retirar por timeout de 8s para no colgar la UI');

  const s2 = {
    holds: new Set(['session']),
    shownAt: 1000,
    now: 9500, // elapsed = 8500 > 8000
  };
  assert.strictEqual(shouldDismiss(s2), true);
});

test('dist: BaseLayout genera el markup y CSS crítico de BootSplash en las páginas clave', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const distDir = path.resolve('dist');
  if (!fs.existsSync(distDir)) return;

  const homeHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
  assert.ok(homeHtml.includes('id="boot-splash"'), 'dist/index.html debe contener #boot-splash');
  assert.ok(homeHtml.includes('html[data-booting] #boot-splash'), 'dist/index.html debe contener el CSS crítico inline');
  assert.ok(homeHtml.includes('"home"'), 'dist/index.html debe pasar splash="home" al script inline');
  assert.ok(homeHtml.includes('Crónicas del Aventurero'), 'dist/index.html splash debe tener el título de marca');

  const sheetHtml = fs.readFileSync(path.join(distDir, 'campaigns', 'index.html'), 'utf-8');
  assert.ok(sheetHtml.includes('id="boot-splash"'), 'dist/campaigns debe contener #boot-splash');
  assert.ok(sheetHtml.includes('"sheet"'), 'dist/campaigns debe pasar splash="sheet" al script inline');

  const partyHtml = fs.readFileSync(path.join(distDir, 'partida', 'index.html'), 'utf-8');
  assert.ok(partyHtml.includes('id="boot-splash"'), 'dist/partida debe contener #boot-splash');
  assert.ok(partyHtml.includes('"party"'), 'dist/partida debe pasar splash="party" al script inline');

  const legalHtml = fs.readFileSync(path.join(distDir, 'privacidad', 'index.html'), 'utf-8');
  assert.ok(legalHtml.includes('"none"'), 'dist/privacidad debe tener splash="none"');
});
