// tests/telemetry.test.mjs
import { test } from 'node:test';
import assert from 'node:assert';
import { isAdmin, ADMIN_EMAIL } from '../src/scripts/auth/adminAuth.ts';
import { telemetry, TelemetryService } from '../src/scripts/analytics/telemetry.ts';

test('isAdmin verifies elgonzatron@gmail.com correctly', () => {
  assert.strictEqual(ADMIN_EMAIL, 'elgonzatron@gmail.com');
  assert.strictEqual(isAdmin('elgonzatron@gmail.com'), true);
  assert.strictEqual(isAdmin('  elgonzatron@gmail.com  '), true);
  assert.strictEqual(isAdmin('ELGONZATRON@GMAIL.COM'), true);
  assert.strictEqual(isAdmin({ email: 'elgonzatron@gmail.com' }), true);
  assert.strictEqual(isAdmin({ email: 'ELGONZATRON@GMAIL.COM ' }), true);
});

test('isAdmin rejects unauthorized users', () => {
  assert.strictEqual(isAdmin('otro@usuario.com'), false);
  assert.strictEqual(isAdmin({ email: 'otro@usuario.com' }), false);
  assert.strictEqual(isAdmin({}), false);
  assert.strictEqual(isAdmin(null), false);
  assert.strictEqual(isAdmin(undefined), false);
  assert.strictEqual(isAdmin(''), false);
});

test('TelemetryService operates safely in Node / SSR without window', () => {
  // En Node, typeof window === 'undefined'
  assert.doesNotThrow(() => {
    telemetry.init();
    telemetry.track('page_view', { path: '/' });
    telemetry.track('landing_cta_demo_click', { source: 'test' });
    telemetry.track('character_creator_open', { creatorType: 'manual' });
    telemetry.trackStep('manual', 'atributos', 3);
    telemetry.track('character_creator_abandon', { creatorType: 'manual', step: 3 });
    telemetry.track('character_creator_complete', { creatorType: 'manual' });
    telemetry.track('ui_error', { errorMessage: 'Test error', source: 'test' });
    telemetry.track('rage_click', { tagName: 'BUTTON' });
    telemetry.identify('user-123', 'elgonzatron@gmail.com');
    telemetry.reset();
  });
});

test('TelemetryService mock browser capture works without crashing', () => {
  const service = new TelemetryService();
  const captured = [];

  // Simulamos entorno de navegador temporal
  globalThis.window = {
    posthog: {
      capture: (evt, props) => captured.push({ evt, props }),
      identify: (uid, props) => captured.push({ evt: '$identify', uid, props }),
      reset: () => captured.push({ evt: '$reset' }),
    },
    addEventListener: () => {},
  };

  try {
    service.track('page_view', { path: '/campaigns' });
    service.trackStep('manual', 'identidad', 1);
    service.identify('usr-456', 'elgonzatron@gmail.com');
    service.reset();

    assert.strictEqual(captured.length, 4);
    assert.strictEqual(captured[0].evt, 'page_view');
    assert.strictEqual(captured[0].props.path, '/campaigns');
    assert.strictEqual(captured[1].evt, 'character_creator_step');
    assert.strictEqual(captured[1].props.step, 1);
    assert.strictEqual(captured[2].evt, '$identify');
    assert.strictEqual(captured[2].uid, 'usr-456');
    assert.strictEqual(captured[3].evt, '$reset');
  } finally {
    delete globalThis.window;
  }
});
