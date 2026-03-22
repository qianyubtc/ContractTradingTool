const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { mountRouteWithMockedFetchService } = require('./helpers/route-test-utils');

function buildFuturesApp(fakeFetch) {
  return mountRouteWithMockedFetchService({
    routeModulePath: require.resolve('../routes/futures'),
    fetchServiceExports: { fetch: fakeFetch, UA: 'test-ua' }
  });
}

test('GET /api/funding should return [] when upstream is not ok', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('/fundingRate')) return { ok: false };
    return { ok: false };
  };
  const ctx = buildFuturesApp(fakeFetch);
  try {
    const res = await request(ctx.app).get('/api/funding?symbol=BTCUSDT').expect(200);
    assert.deepEqual(res.body, []);
  } finally {
    ctx.restore();
  }
});

test('GET /api/oi should return {} when upstream is not ok', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('/openInterest')) return { ok: false };
    return { ok: false };
  };
  const ctx = buildFuturesApp(fakeFetch);
  try {
    const res = await request(ctx.app).get('/api/oi?symbol=BTCUSDT').expect(200);
    assert.deepEqual(res.body, {});
  } finally {
    ctx.restore();
  }
});

test('GET /api/ls should return [] when upstream is not ok', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('globalLongShortAccountRatio')) return { ok: false };
    return { ok: false };
  };
  const ctx = buildFuturesApp(fakeFetch);
  try {
    const res = await request(ctx.app).get('/api/ls?symbol=BTCUSDT').expect(200);
    assert.deepEqual(res.body, []);
  } finally {
    ctx.restore();
  }
});

test('GET /api/force should return [] when upstream is not ok', async () => {
  const fakeFetch = async (url) => {
    if (url.includes('/allForceOrders')) return { ok: false };
    return { ok: false };
  };
  const ctx = buildFuturesApp(fakeFetch);
  try {
    const res = await request(ctx.app).get('/api/force?symbol=BTCUSDT').expect(200);
    assert.deepEqual(res.body, []);
  } finally {
    ctx.restore();
  }
});

