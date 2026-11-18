// tests/tokens_and_familiar_deployment.test.mjs
// Verificación de lista de monstruos en TokenEditor y despliegue de familiar por parte de jugadores
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('TokenEditor: contiene lista estructurada para monstruos y oponentes en el mapa', () => {
  const tokenEditorSrc = fs.readFileSync(path.resolve('src/components/dm/TokenEditor.astro'), 'utf8');

  // 1. Contenedores HTML
  assert.ok(tokenEditorSrc.includes('id="token-monsters-container"'), 'TokenEditor debe tener contenedor para monstruos');
  assert.ok(tokenEditorSrc.includes('id="token-monsters-count"'), 'TokenEditor debe tener contador de criaturas');
  assert.ok(tokenEditorSrc.includes('Enemigos y Criaturas en el mapa'), 'TokenEditor debe tener encabezado de criaturas');

  // 2. Lógica JavaScript
  assert.ok(tokenEditorSrc.includes('function renderMonsters('), 'Debe existir función renderMonsters');
  assert.ok(tokenEditorSrc.includes("addEventListener('map-stage-loaded'"), 'Debe escuchar evento map-stage-loaded');
  assert.ok(tokenEditorSrc.includes('subscribeDmOnly('), 'Debe suscribirse a tokens secretos con subscribeDmOnly');
});

test('CompanionsPanel: jugador puede invocar y desplegar familiares en el mapa táctico', () => {
  const compSrc = fs.readFileSync(path.resolve('src/components/character/CompanionsPanel.astro'), 'utf8');

  // 1. Botón rápido de invocación
  assert.ok(compSrc.includes('id="btn-quick-summon-familiar"'), 'CompanionsPanel debe tener botón Invocar Familiar');
  assert.ok(compSrc.includes('handleQuickSummonFamiliar'), 'Debe existir manejador de invocación rápida');

  // 2. Botón para retirar el familiar del mapa
  assert.ok(compSrc.includes('comp-dismiss-btn'), 'CompanionsPanel debe permitir retirar miniatura del mapa');
  assert.ok(compSrc.includes('removeToken('), 'Debe invocar removeToken al retirar del mapa');

  // 3. No bloquea a los jugadores con isDm || isLocal
  assert.ok(!compSrc.includes('if (isDm || isLocal)'), 'No debe bloquear el despliegue de familiar a jugadores en online');

  // 4. Sincronización reactiva con el mapa táctico activo y detección de tokens
  assert.ok(compSrc.includes('watchActiveMap'), 'CompanionsPanel debe suscribirse al mapa activo con watchActiveMap');
  assert.ok(compSrc.includes('tokensOnMap'), 'CompanionsPanel debe inspeccionar tokensOnMap');
  assert.ok(compSrc.includes('t.companionId === comp.id'), 'CompanionsPanel debe detectar despliegue por companionId');
  assert.ok(compSrc.includes('setupMapSync'), 'CompanionsPanel debe implementar setupMapSync');
  assert.ok(compSrc.includes('map-stage-loaded'), 'CompanionsPanel debe escuchar map-stage-loaded');
});

test('SpellcastingPanel: detecta rituales y conjuros de familiar para desplegar en el mapa', () => {
  const spellSrc = fs.readFileSync(path.resolve('src/components/combat/SpellcastingPanel.astro'), 'utf8');

  assert.ok(spellSrc.includes('triggerFamiliarDeployWorkflow'), 'SpellcastingPanel debe contener workflow de despliegue de familiar');
  assert.ok(spellSrc.includes('/familiar|invoc|summon|montura|steed/i'), 'Debe detectar conjuros de familiar e invocaciones');
  assert.ok(spellSrc.includes('getLocalMaps'), 'SpellcastingPanel debe inspeccionar tokens existentes en getLocalMaps');
});
