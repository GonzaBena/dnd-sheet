// tests/tactical_combat.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  canCombatantAttackTarget,
  getWeaponReachFeet,
  getSpellRangeFeet,
  getItemReachFeet,
  validateActionForDistance,
} from '../src/scripts/vtt/tacticalCombat.ts';

test('canCombatantAttackTarget respects active turn and cross-faction rules', () => {
  const player = { id: 'p1', isPlayer: true, hp: 20 };
  const playerAlly = { id: 'p2', isPlayer: true, hp: 15 };
  const enemy1 = { id: 'e1', isPlayer: false, hp: 12 };
  const enemy2 = { id: 'e2', isPlayer: false, hp: 8 };

  // 1. Cuando es el turno del jugador:
  // - Puede atacar al enemigo 1
  assert.equal(canCombatantAttackTarget(player, enemy1, true), true);
  // - NO puede atacar a su aliado jugador
  assert.equal(canCombatantAttackTarget(player, playerAlly, true), false);
  // - NO puede atacarse a sí mismo
  assert.equal(canCombatantAttackTarget(player, player, true), false);

  // 2. Cuando NO es el turno del jugador (ej. turno de enemigo o de otro jugador):
  // - No puede atacar a nadie
  assert.equal(canCombatantAttackTarget(player, enemy1, false), false);

  // 3. Cuando es el turno del enemigo:
  // - El enemigo puede atacar al jugador
  assert.equal(canCombatantAttackTarget(enemy1, player, true), true);
  // - El enemigo NO puede atacar a otro enemigo
  assert.equal(canCombatantAttackTarget(enemy1, enemy2, true), false);
  // - El enemigo NO puede atacarse a sí mismo
  assert.equal(canCombatantAttackTarget(enemy1, enemy1, true), false);

  // 4. Cuando NO es el turno del enemigo:
  // - El enemigo no puede atacar
  assert.equal(canCombatantAttackTarget(enemy1, player, false), false);
});

test('getWeaponReachFeet detects melee 5ft, reach 10ft, and ranged weapons', () => {
  // Espada corta estándar
  const sword = {
    name: 'Espada Corta',
    type: 'Cuerpo a cuerpo',
    tags: ['Sutil', 'Ligera'],
  };
  const swordReach = getWeaponReachFeet(sword);
  assert.equal(swordReach.normal, 5);
  assert.equal(swordReach.max, 5);
  assert.equal(swordReach.isRanged, false);

  // Alabarda con Alcance (Reach)
  const halberd = {
    name: 'Alabarda',
    type: 'Cuerpo a cuerpo',
    tags: ['Pesada', 'Alcance', 'Dos manos'],
  };
  const halberdReach = getWeaponReachFeet(halberd);
  assert.equal(halberdReach.normal, 10);
  assert.equal(halberdReach.max, 10);
  assert.equal(halberdReach.isReach, true);

  // Arco Largo con tags 150/600
  const longbow = {
    name: 'Arco Largo Élfico',
    type: 'A distancia',
    tags: ['Rango 150/600', 'Pesada'],
  };
  const bowReach = getWeaponReachFeet(longbow);
  assert.equal(bowReach.normal, 150);
  assert.equal(bowReach.max, 600);
  assert.equal(bowReach.isRanged, true);

  // Daga arrojadiza con tag 20/60
  const dagger = {
    name: 'Daga',
    type: 'Cuerpo a cuerpo',
    tags: ['Sutil', 'Ligera', 'Arrojadiza (20/60)'],
  };
  const daggerReach = getWeaponReachFeet(dagger);
  assert.equal(daggerReach.normal, 20);
  assert.equal(daggerReach.max, 60);
  assert.equal(daggerReach.isThrown, true);
});

test('getSpellRangeFeet parses touch, feet and meters correctly', () => {
  // Toque / Contacto
  assert.equal(getSpellRangeFeet({ range: 'Toque' }).max, 5);
  assert.equal(getSpellRangeFeet({ range: 'Contacto' }).isTouch, true);

  // Distancia en pies
  assert.equal(getSpellRangeFeet({ range: '30 pies' }).max, 30);
  assert.equal(getSpellRangeFeet({ range: '90 ft' }).max, 90);
  assert.equal(getSpellRangeFeet({ range: '120 feet' }).max, 120);

  // Distancia en metros (ej. 18 m / 60 pies)
  const spell18m = getSpellRangeFeet({ range: '18 m' });
  assert.ok(spell18m.max >= 58 && spell18m.max <= 60);
});

test('validateActionForDistance: sword CANNOT attack at 30 feet, bow CAN', () => {
  const swordReach = getWeaponReachFeet({
    name: 'Espada',
    type: 'Cuerpo a cuerpo',
  });
  const bowReach = getWeaponReachFeet({
    name: 'Arco',
    type: 'A distancia',
    tags: ['Rango 150/600'],
  });

  // A 5 pies (melé):
  // La espada es perfectamente válida
  const swordAt5 = validateActionForDistance(swordReach, 5);
  assert.equal(swordAt5.valid, true);
  assert.equal(swordAt5.disadvantage, false);

  // A 30 pies:
  // La espada NO PUEDE ser elegida (inválida)
  const swordAt30 = validateActionForDistance(swordReach, 30);
  assert.equal(swordAt30.valid, false);
  assert.match(swordAt30.reason, /Fuera de alcance/);

  // El arco sí puede a 30 pies
  const bowAt30 = validateActionForDistance(bowReach, 30);
  assert.equal(bowAt30.valid, true);
  assert.equal(bowAt30.disadvantage, false);

  // El arco a 300 pies tiene desventaja (largo alcance entre 150 y 600)
  const bowAt300 = validateActionForDistance(bowReach, 300);
  assert.equal(bowAt300.valid, true);
  assert.equal(bowAt300.disadvantage, true);

  // El arco a 650 pies está fuera de alcance
  const bowAt650 = validateActionForDistance(bowReach, 650);
  assert.equal(bowAt650.valid, false);
});
