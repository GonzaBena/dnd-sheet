import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('CombatTracker responsive layout & anti-overflow checks', () => {
  const combatTrackerPath = path.resolve('src/components/dm/CombatTracker.astro');
  const content = fs.readFileSync(combatTrackerPath, 'utf-8');

  // 1. Container prevents horizontal scroll leakage
  assert.ok(
    content.includes('id="dm-combatants-container"'),
    'CombatTracker must contain dm-combatants-container'
  );
  assert.ok(
    content.includes('overflow-x-hidden'),
    'CombatTracker container must contain overflow-x-hidden'
  );

  // 2. Structured 2-tier layout: identity on top, controls on bottom to prevent text superposition in 5-col panel
  assert.ok(
    content.includes('flex flex-col gap-2.5 w-full'),
    'CombatTracker row must use 2-tier flex-col layout to prevent text and HP bar superposition'
  );

  // 3. Left column (identity) has min-w-0 flex-1
  assert.ok(
    content.includes('flex items-center gap-2.5 min-w-0 flex-1'),
    'Identity cluster must expand cleanly in tier 1'
  );

  // 4. Combatant name truncates and has tooltip
  assert.ok(
    content.includes('title="${c.name}"'),
    'Combatant name must include tooltip with full name'
  );
  assert.ok(
    content.includes('truncate max-w-[150px] sm:max-w-xs md:max-w-md'),
    'Combatant name must have max-width limits to avoid pushing badges off-screen'
  );

  // 5. CA and conditions chips must never wrap lines internally
  assert.ok(
    content.includes('CA ${c.ac || 10}') && content.includes('whitespace-nowrap shrink-0 inline-flex items-center'),
    'CA badge must have whitespace-nowrap and shrink-0 to prevent "CA" and "13" breaking onto separate lines'
  );
  assert.ok(
    content.includes('+ Condición') && content.includes('whitespace-nowrap shrink-0 inline-flex items-center'),
    '+ Condicion button must have whitespace-nowrap and shrink-0 to prevent "+" and "Condicion" breaking'
  );

  // 6. Actuando & PJ/NPC badges must not wrap or shrink
  assert.ok(
    content.includes('⚔️ Actuando') && content.includes('whitespace-nowrap shrink-0'),
    'Actuando status badge must not wrap or break'
  );

  // 7. Tier 2 HP controls has a clean horizontal border divider across all viewports
  assert.ok(
    content.includes('border-t border-[#222f42]/60 pt-2.5'),
    'Controls cluster must have clean divider separating HP controls from identity'
  );

  // 8. Attack button text must truncate on narrow screens so it does not overflow
  assert.ok(
    content.includes('truncate max-w-[130px] sm:max-w-[190px]'),
    'Attack button text must be truncated with max-w on mobile'
  );

  // 9. Quick HP delta buttons have shrink-0
  assert.ok(
    content.includes('dm-hp-delta-btn') && content.includes('shrink-0'),
    'HP delta buttons must have shrink-0'
  );

  // 10. Active combat controls are 100% centered horizontally in 2 rows
  assert.ok(
    content.includes('id="dm-active-combat-controls" class="hidden w-full flex flex-wrap items-center justify-center gap-2"'),
    'Active combat controls container must be a centered flex-wrap row'
  );
});

test('InitiativeList responsive anti-overflow checks', () => {
  const initiativeListPath = path.resolve('src/components/party/InitiativeList.astro');
  const content = fs.readFileSync(initiativeListPath, 'utf-8');

  // Container prevents horizontal scroll leakage
  assert.ok(
    content.includes('id="party-combat-list"'),
    'InitiativeList must contain party-combat-list'
  );
  assert.ok(
    content.includes('overflow-x-hidden'),
    'InitiativeList container must contain overflow-x-hidden'
  );

  // Badges have whitespace-nowrap and shrink-0
  assert.ok(
    content.includes('whitespace-nowrap shrink-0">TÚ</span>'),
    'TU badge has whitespace-nowrap shrink-0'
  );
  assert.ok(
    content.includes('whitespace-nowrap shrink-0">TURNO</span>'),
    'TURNO badge has whitespace-nowrap shrink-0'
  );
  assert.ok(
    content.includes('party-attack-target-btn') && content.includes('whitespace-nowrap shrink-0'),
    'Attack button in player view has whitespace-nowrap shrink-0'
  );
});
