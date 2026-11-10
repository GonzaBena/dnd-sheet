// tests/throttle.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { throttle } from '../src/scripts/utils/throttle.ts';

test('throttle - leading call executes immediately', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let count = 0;
  let lastVal = null;
  const fn = throttle((val) => {
    count++;
    lastVal = val;
  }, 50);

  fn('first');
  assert.equal(count, 1);
  assert.equal(lastVal, 'first');
});

test('throttle - trailing call executes after delay with last arguments', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let count = 0;
  let lastVal = null;
  const fn = throttle((val) => {
    count++;
    lastVal = val;
  }, 50);

  fn('first');
  assert.equal(count, 1);

  fn('second');
  fn('third');
  assert.equal(count, 1); // Not called yet

  t.mock.timers.tick(50);
  assert.equal(count, 2);
  assert.equal(lastVal, 'third');
});

test('throttle - cancel prevents pending trailing call', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let count = 0;
  const fn = throttle(() => {
    count++;
  }, 50);

  fn();
  assert.equal(count, 1);

  fn();
  fn.cancel();

  t.mock.timers.tick(60);
  assert.equal(count, 1);
});

test('throttle - flush executes pending trailing call immediately', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let count = 0;
  let lastVal = null;
  const fn = throttle((val) => {
    count++;
    lastVal = val;
  }, 50);

  fn('a');
  assert.equal(count, 1);

  fn('b');
  assert.equal(count, 1);

  fn.flush();
  assert.equal(count, 2);
  assert.equal(lastVal, 'b');

  // After time passes, it should not execute again
  t.mock.timers.tick(60);
  assert.equal(count, 2);
});
