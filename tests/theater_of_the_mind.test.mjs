// tests/theater_of_the_mind.test.mjs
// Pruebas unitarias para el Modo Teatro de la Mente y cálculo de distancias por zonas (Spec 14, H7, Fase C)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateTotmDistanceFeet,
  resolveCombatantDistance,
  validateActionForDistance,
  getWeaponReachFeet
} from '../src/scripts/vtt/tacticalCombat.ts';

test('Teatro de la Mente: calculateTotmDistanceFeet calcula distancias 5e por zonas', () => {
  // Melé contra Melé (mismo grupo): 5 pies, adyacente
  const meleeSame = calculateTotmDistanceFeet('melee', 'melee', true);
  assert.equal(meleeSame.feet, 5);
  assert.equal(meleeSame.cells, 1);
  assert.equal(meleeSame.adjacent, true);

  // Melé contra Melé (combates separados): 10 pies
  const meleeDiff = calculateTotmDistanceFeet('melee', 'melee', false);
  assert.equal(meleeDiff.feet, 10);
  assert.equal(meleeDiff.cells, 2);
  assert.equal(meleeDiff.adjacent, false);

  // Melé contra Rango Cercano: 30 pies (1 turno de movimiento)
  const meleeNear = calculateTotmDistanceFeet('melee', 'near');
  assert.equal(meleeNear.feet, 30);
  assert.equal(meleeNear.cells, 6);

  // Melé contra Rango Lejano: 60 pies
  const meleeFar = calculateTotmDistanceFeet('melee', 'far');
  assert.equal(meleeFar.feet, 60);
  assert.equal(meleeFar.cells, 12);

  // Cercano contra Cercano: 15 pies
  const nearNear = calculateTotmDistanceFeet('near', 'near');
  assert.equal(nearNear.feet, 15);
  assert.equal(nearNear.cells, 3);

  // Cercano contra Lejano: 30 pies
  const nearFar = calculateTotmDistanceFeet('near', 'far');
  assert.equal(nearFar.feet, 30);

  // Lejano contra Lejano: 30 pies
  const farFar = calculateTotmDistanceFeet('far', 'far');
  assert.equal(farFar.feet, 30);
});

test('Teatro de la Mente: resolveCombatantDistance resuelve combatientes por sus zonas TotM', () => {
  const actor = { id: 'warrior-1', totmZone: 'melee', totmEngagement: 'front-1' };
  const targetMelee = { id: 'goblin-1', totmZone: 'melee', totmEngagement: 'front-1' };
  const targetArcher = { id: 'goblin-archer', totmZone: 'near' };
  const targetBoss = { id: 'boss-mage', totmZone: 'far' };

  // Actor contra objetivo trabado en melé
  const distMelee = resolveCombatantDistance(actor, targetMelee, null);
  assert.ok(distMelee);
  assert.equal(distMelee.feet, 5);
  assert.equal(distMelee.adjacent, true);

  // Actor contra arquero a distancia cercana
  const distNear = resolveCombatantDistance(actor, targetArcher, null);
  assert.ok(distNear);
  assert.equal(distNear.feet, 30);

  // Actor contra hechicero en zona lejana
  const distFar = resolveCombatantDistance(actor, targetBoss, null);
  assert.ok(distFar);
  assert.equal(distFar.feet, 60);

  // Diccionario externo de zonas TotM
  const dictZones = {
    'rogue-1': 'near',
    'shaman-1': 'far'
  };
  const distDict = resolveCombatantDistance(
    { id: 'rogue-1' },
    { id: 'shaman-1' },
    null,
    dictZones
  );
  assert.ok(distDict);
  assert.equal(distDict.feet, 30);
});

test('Teatro de la Mente: compatibilidad con validación de acciones tácticas de H6', () => {
  const swordAction = { name: 'Espada Larga', type: 'Cuerpo a cuerpo', notes: '' };
  const bowAction = { name: 'Arco Corto', type: 'A distancia', notes: 'rango 80/320' };

  const swordReach = getWeaponReachFeet(swordAction); // 5 ft normal / 5 ft max
  const bowReach = getWeaponReachFeet(bowAction);     // 80 ft normal / 320 ft max

  // En Melé (5 ft):
  const meleeDist = calculateTotmDistanceFeet('melee', 'melee', true);
  // Espada en melé: válida y óptima
  const swordAtMelee = validateActionForDistance(swordReach, meleeDist.feet);
  assert.equal(swordAtMelee.valid, true);
  assert.equal(swordAtMelee.disadvantage, false);

  // Arco en melé (5 ft): desventaja por quemarropa en 5e
  const bowAtMelee = validateActionForDistance(bowReach, meleeDist.feet);
  assert.equal(bowAtMelee.valid, true);
  assert.equal(bowAtMelee.disadvantage, true);
  assert.ok(bowAtMelee.badgeText?.includes('quemarropa'));

  // En Rango Cercano (30 ft):
  const nearDist = calculateTotmDistanceFeet('melee', 'near');
  // Espada a 30 ft: inválida (fuera de alcance)
  const swordAtNear = validateActionForDistance(swordReach, nearDist.feet);
  assert.equal(swordAtNear.valid, false);

  // Arco a 30 ft: válido y óptimo
  const bowAtNear = validateActionForDistance(bowReach, nearDist.feet);
  assert.equal(bowAtNear.valid, true);
  assert.equal(bowAtNear.disadvantage, false);
});
