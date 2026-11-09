import test from 'node:test';
import assert from 'node:assert/strict';
import { campaignStore } from '../src/scripts/state/campaignStore.ts';
import { canPerform } from '../src/scripts/vtt/sessionStatus.ts';

test('Milestone Celebration Broadcast & Permission Tests', async (t) => {
  await t.test('1. campaignStore broadcasts milestone event to campaign bus', async () => {
    const receiverChannel = new BroadcastChannel('dnd_campaign_bus_v1');
    if (typeof receiverChannel.unref === 'function') receiverChannel.unref();

    let receivedDmEvent = null;

    const eventPromise = new Promise((resolve) => {
      receiverChannel.onmessage = (event) => {
        if (event.data?.type === 'dm-event' && event.data.detail?.type === 'milestone') {
          receivedDmEvent = event.data.detail;
          resolve();
        }
      };
    });

    const camp = campaignStore.createCampaign({
      name: 'Campaña Hito Test',
      status: 'active',
      sessionNumber: 5
    });

    campaignStore.sendDmEvent(camp.id, {
      type: 'milestone',
      campaignId: camp.id,
      dmName: 'Dungeon Master',
      payload: {
        milestone: {
          bannerText: '¡VICTORIA ÉPICA!',
          title: '¡Dragón Rojo Derrotado!',
          description: 'El grupo venció a la bestia en su guarida volcánica.'
        }
      }
    });

    await Promise.race([
      eventPromise,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout waiting for milestone broadcast')), 1000))
    ]);

    assert.ok(receivedDmEvent, 'Milestone DM event should have been received');
    assert.equal(receivedDmEvent.type, 'milestone');
    assert.equal(receivedDmEvent.campaignId, camp.id);
    assert.equal(receivedDmEvent.payload.milestone.bannerText, '¡VICTORIA ÉPICA!');
    assert.equal(receivedDmEvent.payload.milestone.title, '¡Dragón Rojo Derrotado!');
    assert.ok(receivedDmEvent.id.startsWith('dmevent-'), 'Event should have a unique dmevent ID');

    receiverChannel.close();
  });

  await t.test('2. canPerform dmPlay allows celebrating only when campaign status is active', () => {
    assert.equal(canPerform('dmPlay', 'dm', 'active'), true, 'DM can perform milestone celebrations when active');
    assert.equal(canPerform('dmPlay', 'dm', 'paused'), false, 'DM cannot celebrate when paused');
    assert.equal(canPerform('dmPlay', 'dm', 'ended'), false, 'DM cannot celebrate when ended');
    assert.equal(canPerform('dmPlay', 'player', 'active'), false, 'Player cannot perform dmPlay celebrations');
  });

  await t.test('3. milestone celebration filter verifies campaign status and membership', () => {
    const activeCamp = {
      id: 'camp-active-1',
      name: 'Campaña Activa',
      status: 'active',
      memberUserIds: ['user-dm', 'user-player1', 'user-player2']
    };

    const pausedCamp = {
      id: 'camp-paused-1',
      name: 'Campaña Pausada',
      status: 'paused',
      memberUserIds: ['user-dm', 'user-player1']
    };

    function shouldShowMilestone(event, campaign, currentUserId) {
      if (!event || event.type !== 'milestone' || !event.payload?.milestone) return false;
      if (!campaign || campaign.status !== 'active') return false;
      const isMember = campaign.memberUserIds && campaign.memberUserIds.includes(currentUserId);
      return Boolean(isMember);
    }

    const testEvent = {
      id: 'dmevent-test-1',
      type: 'milestone',
      campaignId: 'camp-active-1',
      payload: { milestone: { title: 'Hito', description: 'Desc', bannerText: '¡VICTORIA!' } }
    };

    // Active campaign member -> true
    assert.equal(shouldShowMilestone(testEvent, activeCamp, 'user-player1'), true);
    // Active campaign non-member -> false
    assert.equal(shouldShowMilestone(testEvent, activeCamp, 'user-intruder'), false);
    // Paused campaign member -> false
    assert.equal(shouldShowMilestone(testEvent, pausedCamp, 'user-player1'), false);
    // Null campaign -> false
    assert.equal(shouldShowMilestone(testEvent, null, 'user-player1'), false);
  });
});
