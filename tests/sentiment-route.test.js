const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { mountRouteWithMockedFetchService } = require('./helpers/route-test-utils');

function buildSentimentApp(fakeFetchJSON) {
  return mountRouteWithMockedFetchService({
    routeModulePath: require.resolve('../routes/sentiment'),
    fetchServiceExports: { fetchJSON: fakeFetchJSON }
  });
}

test('GET /api/cg should reject invalid coin input', async () => {
  const ctx = buildSentimentApp(async () => ({}));
  try {
    const res = await request(ctx.app).get('/api/cg?coin=btc$').expect(400);
    assert.equal(res.body.error, 'invalid coin');
  } finally {
    ctx.restore();
  }
});

test('GET /api/cg should map alias btc -> bitcoin', async () => {
  let calledUrl = '';
  const ctx = buildSentimentApp(async (url) => {
    calledUrl = url;
    return { ok: true };
  });
  try {
    const res = await request(ctx.app).get('/api/cg?coin=btc').expect(200);
    assert.equal(res.body.ok, true);
    assert.match(calledUrl, /\/coins\/bitcoin\?/);
  } finally {
    ctx.restore();
  }
});

test('GET /api/fg should return 502 when upstream throws', async () => {
  const ctx = buildSentimentApp(async () => {
    throw new Error('upstream down');
  });
  try {
    const res = await request(ctx.app).get('/api/fg').expect(502);
    assert.match(String(res.body.error || ''), /upstream down/);
  } finally {
    ctx.restore();
  }
});

