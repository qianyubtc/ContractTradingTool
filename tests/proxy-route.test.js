const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { mountRouteWithMockedFetchService } = require('./helpers/route-test-utils');

function buildProxyApp({ allowedDomains = 'api.binance.com', fakeFetch }) {
  return mountRouteWithMockedFetchService({
    routeModulePath: require.resolve('../routes/proxy'),
    fetchServiceExports: { fetch: fakeFetch, UA: 'test-ua' },
    env: { PROXY_ALLOWED_DOMAINS: allowedDomains }
  });
}

test('GET /api/proxy should return 400 when u is missing', async () => {
  const ctx = buildProxyApp({
    fakeFetch: async () => ({ ok: true, async json() { return {}; } })
  });
  try {
    const res = await request(ctx.app).get('/api/proxy').expect(400);
    assert.equal(res.body.error, 'missing u');
  } finally {
    ctx.restore();
  }
});

test('GET /api/proxy should block non-whitelisted domains', async () => {
  const ctx = buildProxyApp({
    allowedDomains: 'api.binance.com',
    fakeFetch: async () => ({ ok: true, async json() { return {}; } })
  });
  try {
    const target = encodeURIComponent('https://evil.test/path');
    const res = await request(ctx.app).get(`/api/proxy?u=${target}`).expect(403);
    assert.equal(res.body.error, 'domain not allowed');
  } finally {
    ctx.restore();
  }
});

