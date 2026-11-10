// tests/ping_presence.test.mjs
// Lógica pura de presencia y ping (T-51a, T-51b).
import test from 'node:test';
import assert from 'node:assert/strict';
import { exceedsLongPressMove, pingColor, LONG_PRESS_MS } from '../src/scripts/vtt/ping.ts';
import { formatLastSeen, normalizePresence } from '../src/scripts/data/presenceService.ts';
import { presenceVisual } from '../src/scripts/ui/presenceBadge.ts';
import { allowPing, resetPingLimiter, PING_MIN_INTERVAL_MS } from '../src/scripts/data/pingService.ts';

test('el clic largo se cancela al moverse más de 6 px', () => {
  assert.equal(LONG_PRESS_MS, 500);
  assert.equal(exceedsLongPressMove({ x: 0, y: 0 }, { x: 3, y: 4 }), false); // 5 px
  assert.equal(exceedsLongPressMove({ x: 0, y: 0 }, { x: 6, y: 0 }), false);
  assert.equal(exceedsLongPressMove({ x: 0, y: 0 }, { x: 5, y: 5 }), true); // ~7 px
});

test('pingColor es estable por usuario y siempre devuelve un color válido', () => {
  assert.equal(pingColor('uid-a'), pingColor('uid-a'));
  assert.match(pingColor('uid-a'), /^#[0-9a-f]{6}$/);
  assert.match(pingColor(''), /^#[0-9a-f]{6}$/);
});

test('allowPing limita a 1 por segundo', () => {
  resetPingLimiter();
  assert.equal(allowPing(10_000), true);
  assert.equal(allowPing(10_000 + PING_MIN_INTERVAL_MS - 1), false);
  assert.equal(allowPing(10_000 + PING_MIN_INTERVAL_MS), true);
});

test('formatLastSeen en minutos, horas y días', () => {
  const now = 1_000_000_000;
  assert.equal(formatLastSeen(now - 10_000, now), 'visto hace un momento');
  assert.equal(formatLastSeen(now - 5 * 60_000, now), 'visto hace 5 min');
  assert.equal(formatLastSeen(now - 3 * 3_600_000, now), 'visto hace 3 h');
  assert.equal(formatLastSeen(now - 2 * 86_400_000, now), 'visto hace 2 d');
});

test('presenceVisual: en línea = borde verde; desconectado = punto gris con "visto hace"; sin dato = nada', () => {
  const now = 1_000_000_000;
  const on = presenceVisual({ uid: 'a', name: 'A', online: true, lastSeen: now }, now);
  assert.equal(on.state, 'online');
  assert.match(on.borderColor, /52,211,153/);
  const off = presenceVisual({ uid: 'a', name: 'A', online: false, lastSeen: now - 5 * 60_000 }, now);
  assert.equal(off.state, 'offline');
  assert.equal(off.borderColor, '');
  assert.equal(off.title, 'Desconectado · visto hace 5 min');
  assert.deepEqual(presenceVisual(undefined, now), { state: 'unknown', borderColor: '', dotColor: '', title: '' });
});

test('normalizePresence ordena en línea primero, luego por nombre, y descarta basura', () => {
  const list = normalizePresence({
    u1: { name: 'Zed', online: false, lastSeen: 5 },
    u2: { name: 'Ana', online: true, lastSeen: 9 },
    u3: { name: 'Bea', online: true, lastSeen: 9 },
    u4: { online: true },
    u5: null,
  });
  assert.deepEqual(list.map((p) => p.uid), ['u2', 'u3', 'u1']);
  assert.deepEqual(normalizePresence(null), []);
});
