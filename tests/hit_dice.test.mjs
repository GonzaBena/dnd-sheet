import { test } from 'node:test';
import assert from 'node:assert';
import { hitDieForClass } from '../src/scripts/dnd/hitDice.ts';

test('dado de golpe sugerido por clase', () => {
  const casos = {
    Bárbaro: 'd12', barbarian: 'd12', Guerrero: 'd10', Paladín: 'd10', Explorador: 'd10',
    Pícaro: 'd8', Clérigo: 'd8', Druida: 'd8', Monje: 'd8', Bardo: 'd8', Brujo: 'd8',
    Maga: 'd6', Mago: 'd6', Hechicera: 'd6', Wizard: 'd6',
  };
  for (const [clase, dado] of Object.entries(casos)) assert.strictEqual(hitDieForClass(clase), dado, clase);
  assert.strictEqual(hitDieForClass('Artífice raro'), undefined);
  assert.strictEqual(hitDieForClass(''), undefined);
});
