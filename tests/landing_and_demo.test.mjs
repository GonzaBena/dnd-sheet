// tests/landing_and_demo.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const distDir = path.resolve('dist');

test('dist/ directory contains static pages', () => {
  assert.ok(fs.existsSync(distDir), 'dist/ directory must exist after build');
  assert.ok(fs.existsSync(path.join(distDir, 'index.html')), 'dist/index.html must exist');
  assert.ok(fs.existsSync(path.join(distDir, 'privacidad', 'index.html')), 'dist/privacidad/index.html must exist');
  assert.ok(fs.existsSync(path.join(distDir, 'terminos', 'index.html')), 'dist/terminos/index.html must exist');
  assert.ok(fs.existsSync(path.join(distDir, 'campaigns', 'index.html')), 'dist/campaigns/index.html must exist');
});

test('dist/index.html contains Landing Hero, OpenGraph and Legal Footer', () => {
  const html = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
  assert.ok(html.includes('Crónicas del Aventurero'), 'Must contain brand title');
  assert.ok(html.includes('/campaigns?demo=1'), 'Must link to demo mode');
  assert.ok(html.includes('og:title'), 'Must contain OpenGraph title tag');
  assert.ok(html.includes('og:image'), 'Must contain OpenGraph image tag');
  assert.ok(html.includes('twitter:card'), 'Must contain Twitter card tag');
  assert.ok(html.includes('System Reference Document 5.1'), 'Must contain SRD 5.1 attribution in footer');
  assert.ok(html.includes('Wizards of the Coast LLC'), 'Must cite Wizards of the Coast LLC');
  assert.ok(html.includes('Creative Commons Attribution 4.0'), 'Must cite CC-BY-4.0');
});

test('dist/privacidad/index.html contains GDPR/OAuth compliance information', () => {
  const html = fs.readFileSync(path.join(distDir, 'privacidad', 'index.html'), 'utf-8');
  assert.ok(html.includes('Política de Privacidad'), 'Must have privacy title');
  assert.ok(html.includes('Firebase Authentication'), 'Must explain authentication mechanism');
  assert.ok(html.includes('Cloud Firestore'), 'Must explain database storage');
  assert.ok(html.includes('contacto@gonzabena.com.ar'), 'Must have contact email');
});

test('dist/terminos/index.html contains Terms of Service and IP rights', () => {
  const html = fs.readFileSync(path.join(distDir, 'terminos', 'index.html'), 'utf-8');
  assert.ok(html.includes('Términos y Condiciones'), 'Must have terms title');
  assert.ok(html.includes('CC-BY-4.0'), 'Must cite CC-BY-4.0 license');
  assert.ok(html.includes('contacto@gonzabena.com.ar'), 'Must have contact email');
});

test('dist/campaigns/index.html contains Demo Notice Banner and Random Char trigger', () => {
  const html = fs.readFileSync(path.join(distDir, 'campaigns', 'index.html'), 'utf-8');
  assert.ok(html.includes('demo-notice-banner'), 'Must contain demo banner root');
  assert.ok(html.includes('btn-demo-random-char'), 'Must contain random char shuffle button');
  assert.ok(html.includes('btn-demo-save-cloud'), 'Must contain save in cloud CTA');
});
