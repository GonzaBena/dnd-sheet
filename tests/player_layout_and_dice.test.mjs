// tests/player_layout_and_dice.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Player VTT view (PartyView) distribution & dice layout checks', () => {
  const partyViewPath = path.resolve('src/components/party/PartyView.astro');
  const content = fs.readFileSync(partyViewPath, 'utf-8');

  // 1. Header has dedicated player dice container
  assert.ok(
    content.includes('id="party-player-dice-container"'),
    'PartyView must include #party-player-dice-container for user dice roll buttons to the right of the title'
  );

  // 2. Player dice container includes quick dice buttons
  assert.ok(
    content.includes('party-player-dice-btn'),
    'PartyView player dice container must include .party-player-dice-btn buttons'
  );
  assert.ok(
    content.includes('data-dice="1d20"') && content.includes('data-dice="1d100"'),
    'PartyView player dice container must support standard dice (d20, d100, etc.)'
  );

  // 3. Player dice container includes secret roll checkbox
  assert.ok(
    content.includes('id="party-player-secret-dice-check"'),
    'PartyView player dice container must include #party-player-secret-dice-check'
  );

  // 4. Tactical section uses 7:5 ratio (12-column grid) matching DM cockpit distribution
  assert.ok(
    content.includes('id="party-player-tactical-view" class="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"'),
    'PartyView player tactical view must use grid-cols-12 layout matching DM view'
  );
  assert.ok(
    content.includes('lg:col-span-7 xl:col-span-8 min-w-0 space-y-2') && content.includes('Mapa Táctico de la Mesa'),
    'Player tactical view must place tactical map in 7 cols with title header'
  );
  assert.ok(
    content.includes('lg:col-span-5 xl:col-span-4') && content.includes('<InitiativeList />'),
    'Player tactical view must place InitiativeList combat card in 5 cols'
  );

  // 5. Player actions: rest, inspiration, initiative
  assert.ok(
    content.includes('id="party-player-short-rest-btn"'),
    'Must include short rest button for player'
  );
  assert.ok(
    content.includes('id="party-player-long-rest-btn"'),
    'Must include long rest button for player'
  );
  assert.ok(
    content.includes('id="party-player-inspiration-btn"'),
    'Must include inspiration button for player'
  );
  assert.ok(
    content.includes('id="party-player-init-roll-btn"'),
    'Must include initiative roll button for player'
  );
});

test('SessionBanner player dice buttons & context checks', () => {
  const sessionBannerPath = path.resolve('src/components/layout/SessionBanner.astro');
  const content = fs.readFileSync(sessionBannerPath, 'utf-8');

  // 1. SessionBanner has 12-col grid with dice on right
  assert.ok(
    content.includes('grid grid-cols-1 xl:grid-cols-12 gap-5 items-center'),
    'SessionBanner must use 12-col responsive grid'
  );
  assert.ok(
    content.includes('xl:col-span-7') && content.includes('id="banner-campaign-title"'),
    'Title & context must be on left (7 cols)'
  );
  assert.ok(
    content.includes('xl:col-span-5') && content.includes('session-banner-dice-btn'),
    'Quick dice buttons must be on right of title (5 cols)'
  );

  // 2. Secret roll checkbox
  assert.ok(
    content.includes('id="session-banner-secret-dice-check"'),
    'SessionBanner must include secret roll checkbox'
  );

  // 3. Resting buttons
  assert.ok(
    content.includes('id="session-banner-short-rest-btn"') && content.includes('id="session-banner-long-rest-btn"'),
    'SessionBanner must include short and long rest buttons'
  );
});

test('InitiativeList card title & subtitle match combat section spec', () => {
  const initiativeListPath = path.resolve('src/components/party/InitiativeList.astro');
  const content = fs.readFileSync(initiativeListPath, 'utf-8');

  assert.ok(
    content.includes('Iniciativa y Combate'),
    'InitiativeList must have title "Iniciativa y Combate"'
  );
  assert.ok(
    content.includes('Control táctico de turnos, PG, CA y condiciones en tiempo real'),
    'InitiativeList must have subtitle matching tactical combat card'
  );
});

test('Header navbar buttons removal checks', () => {
  const headerPath = path.resolve('src/components/layout/Header.astro');
  const content = fs.readFileSync(headerPath, 'utf-8');

  // Verify the 4 buttons are no longer present in the navbar
  assert.ok(
    !content.includes('id="header-open-compendium-btn"'),
    'Header must not have #header-open-compendium-btn in navbar'
  );
  assert.ok(
    !content.includes('id="header-open-dice-btn"'),
    'Header must not have #header-open-dice-btn in navbar'
  );
  assert.ok(
    !content.includes('id="header-open-secret-dice-btn"'),
    'Header must not have #header-open-secret-dice-btn in navbar'
  );
  assert.ok(
    !content.includes('id="header-rest-btn"'),
    'Header must not have #header-rest-btn in navbar'
  );
});

test('CombatTracker hides "Pedir Iniciativa" when all players are in the initiative list', () => {
  const combatTrackerPath = path.resolve('src/components/dm/CombatTracker.astro');
  const content = fs.readFileSync(combatTrackerPath, 'utf-8');

  assert.ok(
    content.includes('areAllPlayersInInitiative'),
    'CombatTracker must use areAllPlayersInInitiative to check if all players are in initiative'
  );
  assert.ok(
    content.includes('reqInitActiveBtn.classList.add(\'hidden\')') ||
    content.includes('reqInitActiveBtn.classList.toggle(\'hidden\''),
    'CombatTracker must hide reqInitActiveBtn when all players are in initiative'
  );
});
