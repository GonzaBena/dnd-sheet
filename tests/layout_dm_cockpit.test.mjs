// tests/layout_dm_cockpit.test.mjs
// Pruebas unitarias para el Cockpit Táctico del DM y Party Dashboard (Spec 14, H7, Fase B)
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { campaignStore } from '../src/scripts/state/campaignStore.ts';
import { defaultCharacter } from '../src/scripts/data/defaultCharacter.ts';

test('Cockpit DM: agrega y recupera aventureros de la campaña para el Party Dashboard', () => {
  const camp = campaignStore.createCampaign({
    name: 'Campaña Cockpit',
    setting: 'Averno',
    weather: 'Despejado',
    location: 'Puerta de Baldur',
    sessionNumber: 1,
  });
  const campId = camp.id;

  const char1 = {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'char-p1',
    name: 'Guerrero Valiente',
    campaignId: campId,
    userId: 'player-1',
    className: 'Guerrero',
    level: 4,
    hp: { current: 36, max: 36, temp: 0 }
  };

  const char2 = {
    ...JSON.parse(JSON.stringify(defaultCharacter)),
    id: 'char-p2',
    name: 'Mago Sabio',
    campaignId: campId,
    userId: 'player-2',
    className: 'Mago',
    level: 4,
    hp: { current: 20, max: 24, temp: 5 }
  };

  campaignStore.saveCharacter(char1);
  campaignStore.saveCharacter(char2);
  campaignStore.setActiveCampaign(campId);

  const party = campaignStore.getCharactersForCampaign(campId);
  assert.equal(party.length, 2);
  assert.equal(party[0].name, 'Guerrero Valiente');
  assert.equal(party[1].name, 'Mago Sabio');
});

test('Cockpit DM Party Dashboard: botones [-] y [+] modifican la vida del aventurero', () => {
  const charId = 'char-p1';
  const char = campaignStore.getCharacter(charId);
  assert.ok(char);
  assert.equal(char.hp.current, 36);

  // Dañar 10 con [-]
  campaignStore.mutateHp(charId, { kind: 'delta', amount: -10 });
  assert.equal(campaignStore.getCharacter(charId)?.hp.current, 26);

  // Curar 5 con [+]
  campaignStore.mutateHp(charId, { kind: 'delta', amount: 5 });
  assert.equal(campaignStore.getCharacter(charId)?.hp.current, 31);

  // Curar en exceso no sobrepasa el máximo (36)
  campaignStore.mutateHp(charId, { kind: 'delta', amount: 100 });
  assert.equal(campaignStore.getCharacter(charId)?.hp.current, 36);

  // Daño excesivo no baja de 0
  campaignStore.mutateHp(charId, { kind: 'delta', amount: -100 });
  assert.equal(campaignStore.getCharacter(charId)?.hp.current, 0);
});

test('Cockpit DM Party Dashboard: ajuste directo "set" de PG respeta valores', () => {
  const charId = 'char-p2';
  assert.equal(campaignStore.getCharacter(charId)?.hp.current, 20);

  // Ajustar manualmente a 15
  campaignStore.mutateHp(charId, { kind: 'set', current: 15, max: 24, temp: 0 });
  assert.equal(campaignStore.getCharacter(charId)?.hp.current, 15);
});
