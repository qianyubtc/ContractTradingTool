const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

function buildFuturesApp(fakeFetch) {
  const fetchServicePath = require.resolve('../services/fetch');
  const futuresRoutePath = require.resolve('../routes/futures');
  const oldFetchService = require.cache[fetchServicePath];
  delete require.cache[fetchServicePath];
  delete require.cache[futuresRoutePath];

  require.cache[fetchServicePath] = {
    id: fetchServicePath,
    filename: fetchServicePath,
    loaded: true,
    exports: { fetch: fakeFetch, UA: 'test-ua' }
  };

  const app = express();
  app.use('/api', require('../routes/futures'));

  return {
    app,
    restore() {
      delete require.cache[futuresRoutePath];
      if (oldFetchService) require.cache[fetchServicePath] = oldFetchService;
      else delete require.cache[fetchServicePath];
    }
  };
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

