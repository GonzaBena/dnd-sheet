import assert from 'node:assert';

console.log('Running Journal Privacy & Sync Isolation Tests...');

const sampleEntries = [
  {
    id: 'entry-1',
    sessionNumber: 15,
    title: 'Emboscada en el Bosque',
    content: 'Fuimos atacados por lobos huargos al anochecer.',
    tags: ['#Combate'],
    isPrivate: false,
    characterId: 'elysian-1',
    timestamp: 1000
  },
  {
    id: 'entry-2',
    sessionNumber: 15,
    title: 'Sospecha sobre el posadero',
    content: 'Creo que el posadero de Vallaki está compinchado con Strahd. No se lo diré al grupo aún.',
    tags: ['#Pista', '#Privado'],
    isPrivate: true,
    characterId: 'elysian-1',
    timestamp: 1050
  },
  {
    id: 'entry-3',
    sessionNumber: 15,
    title: 'Sueño extraño de Morgana',
    content: 'Escuché susurros oscuros en mis sueños.',
    tags: ['#Magia', '#Privado'],
    isPrivate: true,
    characterId: 'morgana-2',
    timestamp: 1100
  },
  {
    id: 'entry-4',
    sessionNumber: 15,
    title: 'Tirada del DM',
    content: 'Tirada pública d20: 19',
    tags: ['#Tirada'],
    isPrivate: false,
    characterId: 'dm-1',
    timestamp: 1150
  }
];

function getEntriesForCharacter(entries, viewingCharacterId) {
  if (!viewingCharacterId) return entries;
  return entries.filter(e => !e.isPrivate || !e.characterId || e.characterId === viewingCharacterId);
}

function getPublicCampaignEntries(entries) {
  return entries.filter(e => !e.isPrivate);
}

function mergeRemoteEntries(localEntries, remoteEntries) {
  const localPrivate = localEntries.filter(e => e.isPrivate);
  const remoteIds = new Set(remoteEntries.map(r => r.id));
  const merged = [...remoteEntries, ...localPrivate.filter(p => !remoteIds.has(p.id))];
  merged.sort((a, b) => b.timestamp - a.timestamp);
  return merged;
}

// TEST 1: Elysian views the journal
const elysianView = getEntriesForCharacter(sampleEntries, 'elysian-1');
assert.strictEqual(elysianView.length, 3, 'Elysian sees public entries + his own private note');
assert(elysianView.some(e => e.id === 'entry-2'), 'Elysian must see his secret note');
assert(!elysianView.some(e => e.id === 'entry-3'), "Elysian must NEVER see Morgana's private note");

// TEST 2: Morgana views the journal
const morganaView = getEntriesForCharacter(sampleEntries, 'morgana-2');
assert.strictEqual(morganaView.length, 3, 'Morgana sees public entries + her own private note');
assert(morganaView.some(e => e.id === 'entry-3'), 'Morgana must see her dream note');
assert(!morganaView.some(e => e.id === 'entry-2'), "Morgana must NEVER see Elysian's private note");

// TEST 3: Public Campaign Entries for Cloud Sync
const publicForSync = getPublicCampaignEntries(sampleEntries);
assert.strictEqual(publicForSync.length, 2, 'Only public entries must be sent to campaign cloud');
assert(!publicForSync.some(e => e.isPrivate), 'No private notes allowed in cloud payload');

// TEST 4: Merging remote updates preserves local private notes
const remoteCampaignUpdate = [
  {
    id: 'entry-1',
    sessionNumber: 15,
    title: 'Emboscada en el Bosque (Actualizado)',
    content: 'Fuimos atacados por lobos huargos al anochecer. Los derrotamos con fuego.',
    tags: ['#Combate'],
    isPrivate: false,
    timestamp: 1000
  },
  {
    id: 'entry-5-new',
    sessionNumber: 15,
    title: 'Llegada al Castillo',
    content: 'El carruaje negro nos espera ante las puertas de Ravenloft.',
    tags: ['#Pista'],
    isPrivate: false,
    timestamp: 1200
  }
];

const merged = mergeRemoteEntries(elysianView, remoteCampaignUpdate);
assert(merged.some(e => e.id === 'entry-2'), 'Local private note MUST survive remote sync merge');
assert(merged.some(e => e.id === 'entry-5-new'), 'New remote public entry must be added');
assert.strictEqual(merged.find(e => e.id === 'entry-1').title, 'Emboscada en el Bosque (Actualizado)', 'Public entry updated');

console.log('✓ All Journal Privacy & Sync tests passed successfully!');
