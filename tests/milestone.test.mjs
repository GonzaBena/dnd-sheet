import assert from 'node:assert';

console.log('Running Milestone Celebration & Banner Tests...');

// 1. Level up detection logic test
function shouldTriggerMilestone(oldLevel, newLevel) {
  return newLevel > oldLevel;
}

assert.strictEqual(shouldTriggerMilestone(5, 6), true, 'Level 5 -> 6 should trigger milestone celebration');
assert.strictEqual(shouldTriggerMilestone(5, 5), false, 'Same level should not trigger celebration');
assert.strictEqual(shouldTriggerMilestone(6, 5), false, 'Lower level should not trigger celebration');
console.log('✓ Level up milestone detection passed.');

// 2. congratulationBanner parameters formatting
function prepareMilestonePayload(texto, desc, options = {}) {
  const finalOptions = {
    bannerText: options.bannerText || '¡FELICIDADES!',
    tag: options.tag || '#Hito',
    saveToJournal: options.saveToJournal !== false,
    icon: options.icon || 'military_tech',
    subtitle: options.subtitle || 'Hito de Campaña Conseguido',
    sessionNumber: options.sessionNumber || 15
  };

  return {
    texto,
    desc,
    options: finalOptions,
    journalEntry: finalOptions.saveToJournal ? {
      title: `🏆 Hito: ${texto}`,
      content: desc,
      tags: [finalOptions.tag],
      sessionNumber: finalOptions.sessionNumber
    } : null
  };
}

const payload = prepareMilestonePayload(
  '¡Has alcanzado el Nivel 6!',
  'Nuevos espacios de conjuro y dotes han sido desbloqueados.',
  { bannerText: '¡SUBIDA DE NIVEL!' }
);

assert.strictEqual(payload.texto, '¡Has alcanzado el Nivel 6!');
assert.strictEqual(payload.options.bannerText, '¡SUBIDA DE NIVEL!');
assert.strictEqual(payload.options.tag, '#Hito');
assert.strictEqual(payload.options.saveToJournal, true);
assert.ok(payload.journalEntry);
assert.strictEqual(payload.journalEntry.title, '🏆 Hito: ¡Has alcanzado el Nivel 6!');
assert.deepStrictEqual(payload.journalEntry.tags, ['#Hito']);
console.log('✓ Milestone payload & journal formatting passed.');

// 3. Custom milestone preset test
const customPayload = prepareMilestonePayload(
  '¡Victoria en el Valle de Barovia!',
  'El grupo ha derrotado al señor de las tinieblas.',
  {
    bannerText: '¡GLORIA ETERNA!',
    tag: '#Hito',
    icon: 'swords',
    sessionNumber: 16
  }
);

assert.strictEqual(customPayload.options.bannerText, '¡GLORIA ETERNA!');
assert.strictEqual(customPayload.options.sessionNumber, 16);
assert.strictEqual(customPayload.journalEntry.sessionNumber, 16);
console.log('✓ Custom milestone preset options passed.');

console.log('All milestone celebration tests passed successfully!');
