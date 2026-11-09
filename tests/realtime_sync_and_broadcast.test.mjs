import test from 'node:test';
import assert from 'node:assert/strict';
import { journalStore } from '../src/scripts/state/journalStore.ts';
import { campaignStore } from '../src/scripts/state/campaignStore.ts';
import { characterStore } from '../src/scripts/state/characterStore.ts';

test('Real-Time Cross-Tab Broadcast & Sync Tests', async (t) => {
  await t.test('1. journalStore broadcasts entries to other channels on new entry', async () => {
    const receiverChannel = new BroadcastChannel('dnd_journal_bus_v1');
    if (typeof receiverChannel.unref === 'function') receiverChannel.unref();

    const receivedPromise = new Promise((resolve) => {
      receiverChannel.onmessage = (event) => {
        if (event.data?.type === 'journal-sync') {
          resolve(event.data.entries);
        }
      };
    });

    const entry = journalStore.addEntry({
      title: 'Nota en tiempo real de prueba',
      content: 'Contenido sincronizado entre pestañas',
      tags: ['#Prueba', '#RealTime'],
      sessionNumber: 1
    });

    const broadcastedEntries = await Promise.race([
      receivedPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for journal broadcast')), 1000))
    ]);

    assert.ok(Array.isArray(broadcastedEntries), 'Received broadcast should be an array of entries');
    const found = broadcastedEntries.find(e => e.id === entry.id);
    assert.ok(found, 'Added entry should be present in the broadcasted payload');
    assert.equal(found.title, 'Nota en tiempo real de prueba');

    receiverChannel.close();
  });

  await t.test('2. campaignStore broadcasts campaign updates and DM events', async () => {
    const receiverChannel = new BroadcastChannel('dnd_campaign_bus_v1');
    if (typeof receiverChannel.unref === 'function') receiverChannel.unref();

    let receivedDmEvent = null;
    let receivedCampaignSync = null;

    const eventPromise = new Promise((resolve) => {
      receiverChannel.onmessage = (event) => {
        if (event.data?.type === 'dm-event') {
          receivedDmEvent = event.data.detail;
          if (receivedCampaignSync) resolve();
        } else if (event.data?.type === 'campaigns-sync') {
          receivedCampaignSync = event.data.campaigns;
          if (receivedDmEvent) resolve();
        }
      };
    });

    // 1. Create/update a campaign
    const camp = campaignStore.createCampaign({
      name: 'Campaña RealTime Alpha',
      weather: 'Tormenta Eléctrica',
      sessionNumber: 3
    });

    // 2. Send DM Event
    campaignStore.sendDmEvent(camp.id, {
      type: 'short_rest',
      campaignId: camp.id,
      dmName: 'Lord DM',
      payload: { restType: 'short', hpHealedTotal: 12 }
    });

    await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for campaign broadcast')), 1000))
    ]);

    assert.ok(receivedCampaignSync, 'Campaign sync should have been broadcasted');
    assert.ok(receivedDmEvent, 'DM event should have been broadcasted');
    assert.equal(receivedDmEvent.type, 'short_rest');
    assert.equal(receivedDmEvent.payload.hpHealedTotal, 12);

    receiverChannel.close();
  });

  await t.test('3. characterStore broadcasts character changes to other tabs', async () => {
    const receiverChannel = new BroadcastChannel('dnd_character_bus_v1');
    if (typeof receiverChannel.unref === 'function') receiverChannel.unref();

    const charPromise = new Promise((resolve) => {
      receiverChannel.onmessage = (event) => {
        if (event.data?.type === 'character-sync') {
          resolve(event.data.character);
        }
      };
    });

    const currentHp = characterStore.get().hp.current;
    characterStore.modifyHp(-5);

    const receivedChar = await Promise.race([
      charPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for character broadcast')), 1000))
    ]);

    assert.ok(receivedChar, 'Character should have been broadcasted');
    assert.equal(receivedChar.hp.current, currentHp - 5, 'Modified HP should reflect in broadcast');

    // Restore HP
    characterStore.modifyHp(5);

    receiverChannel.close();
  });
});
