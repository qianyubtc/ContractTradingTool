const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

function loadLiveRouterInMockMode() {
  process.env.LIVE_PROVIDER = 'mock';
  delete require.cache[require.resolve('../routes/live')];
  return require('../routes/live');
}

test('GET /api/live returns mock payload structure', async () => {
  const app = express();
  app.use('/api', loadLiveRouterInMockMode());

  const res = await request(app).get('/api/live').expect(200);
  assert.equal(res.body.source, 'mock');
  assert.ok(Array.isArray(res.body.list));
  assert.ok(res.body.list.length > 0);
  assert.equal(typeof res.body.liveNum, 'number');
  assert.equal(typeof res.body.onlineNum, 'number');
  assert.equal(typeof res.body.viewNum, 'number');
});

test('GET /api/live list keeps only live_status=1', async () => {
  const app = express();
  app.use('/api', loadLiveRouterInMockMode());

  const res = await request(app).get('/api/live').expect(200);
  const allLive = res.body.list.every((item) => String(item.live_status) === '1');
  assert.equal(allLive, true);
});

