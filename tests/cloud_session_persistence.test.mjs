// tests/cloud_session_persistence.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

test('Firebase client explicitly imports and configures IndexedDB and localStorage persistence', () => {
  const clientSrc = fs.readFileSync(path.resolve('src/scripts/firebase/client.ts'), 'utf-8');
  assert.ok(clientSrc.includes('indexedDBLocalPersistence'), 'client.ts must import indexedDBLocalPersistence');
  assert.ok(clientSrc.includes('browserLocalPersistence'), 'client.ts must import browserLocalPersistence');
  assert.ok(clientSrc.includes('initializeAuth'), 'client.ts must call initializeAuth with persistence array');
});

test('cloudSync automatically uploads active character to Firestore if remote roster is empty', () => {
  const cloudSyncSrc = fs.readFileSync(path.resolve('src/scripts/data/cloudSync.ts'), 'utf-8');
  assert.ok(
    cloudSyncSrc.includes('myRemoteChars.length === 0'),
    'cloudSync must detect when remote user has no characters'
  );
  assert.ok(
    cloudSyncSrc.includes("setDoc(charRef, toPlain(uploadedChar))"),
    'cloudSync must save uploaded active character into Firestore'
  );
});

test('campaigns.astro does not forcefully redirect to / when user has no characters yet', () => {
  const campaignsSrc = fs.readFileSync(path.resolve('src/pages/campaigns.astro'), 'utf-8');
  assert.ok(
    !campaignsSrc.includes("window.location.href = '/';\n      return;\n    }"),
    'campaigns.astro must not abruptly kick empty users back to /'
  );
  assert.ok(
    campaignsSrc.includes("initCampaignsWorkspace"),
    'campaigns.astro must define initCampaignsWorkspace'
  );
  assert.ok(
    campaignsSrc.includes("addEventListener('cloud-session-changed'"),
    'campaigns.astro must reactively reinitialize workspace on cloud-session-changed'
  );
});

test('index.astro avoids landing view flash during loading state when user was authenticated', () => {
  const indexSrc = fs.readFileSync(path.resolve('src/pages/index.astro'), 'utf-8');
  assert.ok(
    indexSrc.includes("(state === 'loading' && wasAuthed)"),
    'index.astro must preserve authed view while loading if wasAuthed is true'
  );
});
