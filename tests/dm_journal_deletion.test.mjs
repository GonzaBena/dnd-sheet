import test from 'node:test';
import assert from 'node:assert/strict';
import { journalStore, canUserDeleteEntry } from '../src/scripts/state/journalStore.ts';

test('DM Journal Moderation & Deletion Suite', async (t) => {
  journalStore.resetToDefault();

  await t.test('1. canUserDeleteEntry accurately models DM moderation vs player permissions', () => {
    const partyEntry = {
      id: 'e-party',
      title: 'Nota de Mesa',
      content: 'Contenido público',
      authorUid: 'user-player-1',
      tags: ['#Pista']
    };

    const dmEntry = {
      id: 'e-dm',
      title: 'Nota Secreta DM',
      content: 'El tesoro está oculto bajo el altar.',
      isDmOnly: true,
      authorUid: 'user-dm',
      tags: ['#Privado']
    };

    const playerPrivateEntry = {
      id: 'e-player',
      title: 'Nota Personal',
      content: 'Sospecho del mago.',
      isPlayerOnly: true,
      authorUid: 'user-player-1',
      tags: ['#Privado']
    };

    const toDmEntry = {
      id: 'e-todm',
      title: 'Pregunta al DM',
      content: '¿Mi dios responde a la plegaria?',
      isForDm: true,
      authorUid: 'user-player-1',
      tags: ['#Privado']
    };

    // DM permissions
    assert.equal(canUserDeleteEntry(partyEntry, 'user-dm', true), true, 'DM can delete party entries');
    assert.equal(canUserDeleteEntry(dmEntry, 'user-dm', true), true, 'DM can delete DM entries');
    assert.equal(canUserDeleteEntry(toDmEntry, 'user-dm', true), true, 'DM can delete to_dm messages');
    assert.equal(canUserDeleteEntry(playerPrivateEntry, 'user-dm', true), false, 'DM cannot delete players private notes');

    // Player permissions
    assert.equal(canUserDeleteEntry(partyEntry, 'user-player-1', false), true, 'Author player can delete own party entry');
    assert.equal(canUserDeleteEntry(partyEntry, 'user-player-2', false), false, 'Non-author player cannot delete another player party entry');
    assert.equal(canUserDeleteEntry(dmEntry, 'user-player-1', false), false, 'Player cannot delete DM entry');
    assert.equal(canUserDeleteEntry(playerPrivateEntry, 'user-player-1', false), true, 'Author player can delete own private note');
  });

  await t.test('2. DM deletes an entry from journalStore and verifies removal', () => {
    const entry = journalStore.addEntry({
      sessionNumber: 15,
      title: 'Nota a moderar por el DM',
      content: 'Esta nota será removida de la crónica.',
      tags: ['#Combate'],
      authorName: 'Jugador 1'
    });

    const initialEntries = journalStore.getEntries();
    assert.ok(initialEntries.some(e => e.id === entry.id), 'Entry must exist initially');

    journalStore.deleteEntry(entry.id);

    const remaining = journalStore.getEntries();
    assert.equal(remaining.some(e => e.id === entry.id), false, 'Entry must be removed after deleteEntry');
  });

  await t.test('3. Deletion broadcasts removal through BroadcastChannel', async () => {
    const receiverChannel = new BroadcastChannel('dnd_journal_bus_v1');
    if (typeof receiverChannel.unref === 'function') receiverChannel.unref();

    const entry = journalStore.addEntry({
      sessionNumber: 15,
      title: 'Nota a borrar con broadcast',
      content: 'Prueba de sincronización',
      tags: ['#Hito']
    });

    const receivedBroadcastPromise = new Promise((resolve) => {
      receiverChannel.onmessage = (event) => {
        if (event.data?.type === 'journal-sync' && Array.isArray(event.data.entries)) {
          if (!event.data.entries.some(e => e.id === entry.id)) {
            resolve(true);
          }
        }
      };
    });

    journalStore.deleteEntry(entry.id);

    const broadcastSucceeded = await Promise.race([
      receivedBroadcastPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for deletion broadcast')), 1000))
    ]);

    assert.equal(broadcastSucceeded, true, 'Deletion should broadcast updated entry list without the deleted item');

    receiverChannel.close();
  });
});
