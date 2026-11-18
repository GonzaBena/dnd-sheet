// tests/rests.test.mjs
// Tests unitarios de lógica pura de descansos, dados de golpe y portento (Spec 10, Fase A).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateHitDieHeal,
  getHitDicePools,
  syncHitDicePools,
  calculateMaxHitDiceRecovery,
  suggestHitDiceRecovery,
  executeShortRestLogic,
  executeLongRestLogic,
  rollSavedDice,
  consumeSavedDie,
} from '../src/scripts/dnd/rests.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

const makeChar = (overrides = {}) => {
  const base = JSON.parse(JSON.stringify(defaultCharacter));
  return {
    ...base,
    ...overrides,
    hp: { current: 10, max: 25, temp: 0, ...(overrides.hp || {}) },
    stats: {
      ...base.stats,
      con: { score: 14, modifier: 2, savingProficient: false, ...(overrides.stats?.con || {}) },
    },
    hitDice: {
      total: 5,
      remaining: 5,
      die: 'd10',
      ...(overrides.hitDice || {}),
    },
    resources: overrides.resources ? [...overrides.resources] : [],
    activeEffects: overrides.activeEffects ? [...overrides.activeEffects] : [],
  };
};

test('calculateHitDieHeal suma Constitución y respeta el mínimo de 0', () => {
  // Tirada normal con bono positivo
  const h1 = calculateHitDieHeal('d10', 2, 7);
  assert.equal(h1.roll, 7);
  assert.equal(h1.conMod, 2);
  assert.equal(h1.total, 9); // 7 + 2

  // Tirada con CON negativo que resultaría en número negativo: debe ser mínimo 0
  const h2 = calculateHitDieHeal('d6', -3, 1);
  assert.equal(h2.roll, 1);
  assert.equal(h2.total, 0); // max(0, 1 - 3) = 0

  // Clampeo a caras máximas del dado
  const h3 = calculateHitDieHeal('d8', 0, 15);
  assert.equal(h3.roll, 8); // clamp a 8
});

test('syncHitDicePools maneja tanto personajes monoclass como multiclass', () => {
  // Monoclass simple
  const mono = makeChar({ level: 4, hitDice: { total: 2, remaining: 1, die: 'd8' } });
  const changed = syncHitDicePools(mono);
  assert.equal(changed, true);
  assert.equal(mono.hitDice.total, 4);
  assert.equal(mono.hitDice.remaining, 3); // 1 previo + 2 nuevos

  // Multiclass con pools
  const multi = makeChar({
    level: 5,
    hitDice: {
      total: 4,
      remaining: 2,
      die: 'd10',
      pools: [
        { die: 'd10', total: 3, remaining: 1 },
        { die: 'd6', total: 1, remaining: 1 },
      ],
    },
  });
  syncHitDicePools(multi);
  // Sube de 4 a 5: se agrega al pool principal
  assert.equal(multi.hitDice.pools[0].total, 4);
  assert.equal(multi.hitDice.pools[0].remaining, 2);
  assert.equal(multi.hitDice.total, 5);
  assert.equal(multi.hitDice.remaining, 3);

  // Idempotente
  const again = syncHitDicePools(multi);
  assert.equal(again, false);
});

test('calculateMaxHitDiceRecovery y suggestHitDiceRecovery en multiclase', () => {
  assert.equal(calculateMaxHitDiceRecovery(1), 1); // min 1
  assert.equal(calculateMaxHitDiceRecovery(4), 2);
  assert.equal(calculateMaxHitDiceRecovery(5), 2); // floor(5/2) = 2
  assert.equal(calculateMaxHitDiceRecovery(8), 4);

  // Multiclass: 2 d10 gastados y 2 d8 gastados, cuota de recuperación = 2
  const pools = [
    { die: 'd8', total: 3, remaining: 1 },  // 2 gastados
    { die: 'd10', total: 3, remaining: 1 }, // 2 gastados
  ];
  const plan = suggestHitDiceRecovery(pools, 2);
  // Prioridad d10 sobre d8: debe sugerir recuperar los 2 d10
  assert.deepEqual(plan, [{ die: 'd10', count: 2 }]);
});

test('executeShortRestLogic descuenta dados, cura PG con CON y reinicia recursos shortRest', () => {
  const char = makeChar({
    hp: { current: 10, max: 25 },
    stats: { con: { modifier: 2 } },
    hitDice: { total: 3, remaining: 3, die: 'd10' },
    resources: [
      { id: 'ws', name: 'Forma Salvaje', max: 2, used: 2, rechargeOn: 'shortRest' },
      { id: 'furia', name: 'Furia', max: 3, used: 1, rechargeOn: 'longRest' },
    ],
    activeEffects: [
      { id: 'e1', name: 'Escudo de Fe', duration: { kind: 'untilRest', rest: 'short' } },
      { id: 'e2', name: 'Armadura de Mago', duration: { kind: 'untilRest', rest: 'long' } },
    ],
  });

  // Gastar 2 dados: uno con roll 6 y otro con roll 4
  const { char: nextChar, result } = executeShortRestLogic(char, {
    spent: [
      { die: 'd10', roll: 6 }, // 6 + 2 = 8
      { die: 'd10', roll: 4 }, // 4 + 2 = 6
    ],
    conMod: 2,
  });

  assert.equal(result.spentDice.length, 2);
  assert.equal(result.healedHp, 14); // 8 + 6 = 14
  assert.equal(nextChar.hp.current, 24); // 10 + 14 = 24 / 25
  assert.equal(nextChar.hitDice.remaining, 1); // 3 - 2 = 1

  // Recursos
  const ws = nextChar.resources.find((r) => r.id === 'ws');
  assert.equal(ws.used, 0); // recuperado
  const furia = nextChar.resources.find((r) => r.id === 'furia');
  assert.equal(furia.used, 1); // NO recuperado en corto
  assert.ok(result.recoveredResources.includes('Forma Salvaje'));

  // Efectos: expira e1, se mantiene e2
  assert.equal(nextChar.activeEffects.length, 1);
  assert.equal(nextChar.activeEffects[0].id, 'e2');
  assert.ok(result.expiredEffects.includes('Escudo de Fe'));
});

test('executeShortRestLogic no sobrepasa la salud máxima', () => {
  const char = makeChar({
    hp: { current: 20, max: 25 },
    stats: { con: { modifier: 3 } },
    hitDice: { total: 2, remaining: 2, die: 'd8' },
  });

  // Gastar 1d8 con roll 7: 7 + 3 = 10 curación, pero solo faltan 5 PG
  const { char: nextChar, result } = executeShortRestLogic(char, {
    spent: [{ die: 'd8', roll: 7 }],
    conMod: 3,
  });

  assert.equal(nextChar.hp.current, 25);
  assert.equal(result.healedHp, 5); // solo cura lo que faltaba
});

test('executeLongRestLogic cura 100% PG, recupera mitad de dados y slots 1-9', () => {
  const char = makeChar({
    hp: { current: 3, max: 30, temp: 5 },
    hitDice: { total: 6, remaining: 1, die: 'd8' },
    spellcasting: {
      slots: {
        1: { total: 4, used: 4 },
        2: { total: 2, used: 1 },
      },
    },
    resources: [
      { id: 'furia', name: 'Furia', max: 3, used: 2, rechargeOn: 'longRest' },
    ],
  });

  const { char: nextChar, result } = executeLongRestLogic(char);

  assert.equal(nextChar.hp.current, 30);
  assert.equal(nextChar.hp.temp, 0);
  assert.equal(result.healedHp, 27);

  // Dados: total 6 -> cuota max es 3. Tenía 1 -> pasa a 4.
  assert.equal(nextChar.hitDice.remaining, 4);

  // Espacios de conjuro restablecidos
  assert.equal(nextChar.spellcasting.slots[1].used, 0);
  assert.equal(nextChar.spellcasting.slots[2].used, 0);
  assert.equal(result.recoveredSlots[1], 4);
  assert.equal(result.recoveredSlots[2], 1);

  // Recursos
  assert.equal(nextChar.resources.find((r) => r.id === 'furia').used, 0);
  assert.ok(result.recoveredResources.includes('Furia'));
});

test('Portento genera tiradas de d20 en descanso largo y consumeSavedDie descuenta valores', () => {
  const portentResource = {
    id: 'portent',
    name: 'Portento',
    max: 2,
    used: 2,
    rechargeOn: 'longRest',
    dieType: 'd20',
    values: [],
  };

  const char = makeChar({
    resources: [portentResource],
  });

  // RNG determinista para el test (devuelve 0.8 -> 17, 0.2 -> 5)
  let call = 0;
  const mockRng = () => (call++ === 0 ? 0.8 : 0.2);

  const { char: nextChar, result } = executeLongRestLogic(char, { rng: mockRng });

  const res = nextChar.resources.find((r) => r.id === 'portent');
  assert.equal(res.used, 0);
  assert.equal(res.values.length, 2);
  assert.equal(res.values[0], 17);
  assert.equal(res.values[1], 5);
  assert.equal(result.savedDiceRolled.length, 1);
  assert.deepEqual(result.savedDiceRolled[0].values, [17, 5]);

  // Consumir el primer dado (17)
  const consumed = consumeSavedDie(res, { index: 0 });
  assert.equal(consumed.value, 17);
  assert.equal(consumed.resource.used, 1);
  assert.deepEqual(consumed.resource.values, [5]);

  // Consumir por valor directo (5)
  const consumed2 = consumeSavedDie(consumed.resource, 5);
  assert.equal(consumed2.value, 5);
  assert.equal(consumed2.resource.used, 2);
  assert.deepEqual(consumed2.resource.values, []);
});

test('RestModal: las vistas #rest-view-short y #rest-view-long son mutuamente excluyentes y no colisionan con md:grid', async () => {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const modalPath = path.resolve('src/components/modals/RestModal.astro');
  const content = fs.readFileSync(modalPath, 'utf8');

  // Verificar que los IDs de vista no tengan clases md:grid o md:flex en su contenedor directo,
  // garantizando que .hidden oculte la sección completamente en cualquier resolución de pantalla
  const shortViewMatch = content.match(/<div\s+id="rest-view-short"([^>]*)>/);
  assert.ok(shortViewMatch, 'Debe existir #rest-view-short');
  assert.ok(!shortViewMatch[1].includes('md:grid'), '#rest-view-short no debe tener md:grid en su contenedor directo');
  assert.ok(!shortViewMatch[1].includes('md:flex'), '#rest-view-short no debe tener md:flex en su contenedor directo');

  const longViewMatch = content.match(/<div\s+id="rest-view-long"([^>]*)>/);
  assert.ok(longViewMatch, 'Debe existir #rest-view-long');
  assert.ok(!longViewMatch[1].includes('md:grid'), '#rest-view-long no debe tener md:grid en su contenedor directo');
  assert.ok(!longViewMatch[1].includes('md:flex'), '#rest-view-long no debe tener md:flex en su contenedor directo');
  assert.ok(longViewMatch[1].includes('hidden'), '#rest-view-long debe iniciar con clase hidden');
});

