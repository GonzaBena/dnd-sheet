// tests/handouts.test.mjs
// Lógica pura de handouts (T-52, RF-41).
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateHandoutDraft,
  buildDraftDoc,
  sentHandouts,
  pickHandoutToOpen,
  isRecipient,
  buildRecipients,
  describeRecipients,
} from '../src/scripts/vtt/handouts.ts';

const h = (id, sentAt, extra = {}) => ({ id, kind: 'text', title: id, body: 'x', sentAt, createdAt: 1, ...extra });

test('validateHandoutDraft: título obligatorio y de hasta 120', () => {
  assert.match(validateHandoutDraft({ kind: 'text', title: '  ', body: 'x' }), /título/i);
  assert.match(validateHandoutDraft({ kind: 'text', title: 't'.repeat(121), body: 'x' }), /120/);
  assert.equal(validateHandoutDraft({ kind: 'text', title: 't'.repeat(120), body: 'x' }), null);
});

test('validateHandoutDraft: imagen exige URL https de hasta 2048', () => {
  assert.match(validateHandoutDraft({ kind: 'image', title: 'M' }), /URL/);
  assert.match(validateHandoutDraft({ kind: 'image', title: 'M', imageUrl: 'http://a.com/x.png' }), /https/);
  assert.match(validateHandoutDraft({ kind: 'image', title: 'M', imageUrl: 'javascript:alert(1)' }), /https/);
  assert.match(validateHandoutDraft({ kind: 'image', title: 'M', imageUrl: 'https://a.com/' + 'a'.repeat(2048) }), /2048/);
  assert.equal(validateHandoutDraft({ kind: 'image', title: 'M', imageUrl: 'https://a.com/x.png' }), null);
});

test('validateHandoutDraft: texto exige cuerpo y admite hasta 5000', () => {
  assert.match(validateHandoutDraft({ kind: 'text', title: 'C', body: ' ' }), /texto/i);
  assert.match(validateHandoutDraft({ kind: 'text', title: 'C', body: 'b'.repeat(5001) }), /5000/);
  assert.equal(validateHandoutDraft({ kind: 'text', title: 'C', body: 'b'.repeat(5000) }), null);
});

test('buildDraftDoc: borrador sin enviar, recortado y sin campos del otro tipo', () => {
  const t = buildDraftDoc({ kind: 'text', title: '  Carta ', body: ' hola ', imageUrl: 'https://ignorada' }, 7);
  assert.deepEqual(t, { kind: 'text', title: 'Carta', sentAt: null, recipients: [], createdAt: 7, body: 'hola' });
  const i = buildDraftDoc({ kind: 'image', title: 'Mapa', imageUrl: ' https://a.com/m.png ', body: '' }, 7);
  assert.deepEqual(i, { kind: 'image', title: 'Mapa', sentAt: null, recipients: [], createdAt: 7, imageUrl: 'https://a.com/m.png' });
  assert.equal(buildDraftDoc({ kind: 'image', title: 'M', imageUrl: 'https://a.com/m.png', body: 'Pie' }, 7).body, 'Pie');
});

test('sentHandouts: descarta borradores y ordena por sentAt descendente', () => {
  const list = [h('a', 5), h('draft', null), h('b', 9), h('c', 1)];
  assert.deepEqual(sentHandouts(list).map((x) => x.id), ['b', 'a', 'c']);
});

test('pickHandoutToOpen: la primera vez no abre nada y marca todo como visto', () => {
  const r = pickHandoutToOpen([h('a', 5), h('b', 9)], null);
  assert.equal(r.open, null);
  assert.equal(r.nextSeen, 9);
  assert.deepEqual(pickHandoutToOpen([], null), { open: null, nextSeen: 0 });
});

test('pickHandoutToOpen: abre el más reciente posterior al último visto', () => {
  const list = [h('a', 5), h('b', 9), h('c', 12), h('draft', null)];
  const r = pickHandoutToOpen(list, 9);
  assert.equal(r.open?.id, 'c');
  assert.equal(r.nextSeen, 12);
});

test('pickHandoutToOpen: sin novedades no abre y no retrocede nextSeen', () => {
  assert.deepEqual(pickHandoutToOpen([h('a', 5)], 9), { open: null, nextSeen: 9 });
});

test('isRecipient: "todos" llega a cualquiera; una lista solo a los elegidos; el borrador a nadie', () => {
  assert.equal(isRecipient({ sentAt: 5, recipients: ['*'] }, 'u1'), true);
  assert.equal(isRecipient({ sentAt: 5, recipients: ['u1', 'u2'] }, 'u2'), true);
  assert.equal(isRecipient({ sentAt: 5, recipients: ['u1'] }, 'u2'), false);
  assert.equal(isRecipient({ sentAt: null, recipients: [] }, 'u1'), false);
  assert.equal(isRecipient({ sentAt: 5, recipients: [] }, 'u1'), false);
  assert.equal(isRecipient({ sentAt: 5, recipients: ['u1'] }, ''), false);
});

test('buildRecipients: todos => ["*"]; selección sin repetidos; vacío => null', () => {
  assert.deepEqual(buildRecipients(true, ['u1']), ['*']);
  assert.deepEqual(buildRecipients(false, ['u1', 'u2', 'u1', '']), ['u1', 'u2']);
  assert.equal(buildRecipients(false, []), null);
  assert.equal(buildRecipients(false, Array.from({ length: 51 }, (_, i) => `u${i}`)), null);
});

test('describeRecipients: "todos" o los nombres elegidos', () => {
  const nameOf = (u) => ({ u1: 'Elena', u2: 'Brom' }[u] ?? u);
  assert.equal(describeRecipients(['*'], nameOf), 'todos');
  assert.equal(describeRecipients(['u1', 'u2'], nameOf), 'Elena, Brom');
  assert.equal(describeRecipients(undefined, nameOf), '');
});

test('pickHandoutToOpen: un reenvío (sentAt mayor) vuelve a abrirse', () => {
  const r = pickHandoutToOpen([h('a', 20)], 9);
  assert.equal(r.open?.id, 'a');
});
