const test = require('node:test');
const assert = require('node:assert/strict');

const { cGet, cSet } = require('../services/cache');

test('cSet/cGet should read value before TTL expires', () => {
  const key = 'cache:test:alive';
  const payload = { ok: true };
  cSet(key, payload, 1000);
  assert.deepEqual(cGet(key), payload);
});

test('cGet should return null after TTL expires', async () => {
  const key = 'cache:test:expired';
  cSet(key, 'stale', 5);
  await new Promise((resolve) => setTimeout(resolve, 20));
  assert.equal(cGet(key), null);
});

