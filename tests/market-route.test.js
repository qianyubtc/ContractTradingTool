const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { mountRouteWithMockedFetchService } = require('./helpers/route-test-utils');

function buildMarketApp({ fetchJSONImpl, fetchImpl }) {
  return mountRouteWithMockedFetchService({
    routeModulePath: require.resolve('../routes/market'),
    fetchServiceExports: {
      fetchJSON: fetchJSONImpl,
      fetch: fetchImpl || (async () => ({ ok: false })),
      UA: 'test-ua'
    }
  });
}

test('GET /api/ticker should fallback to OKX when Binance fails', async () => {
  const fetchJSONImpl = async (url) => {
    if (url.includes('api.binance.com') || url.includes('api1.binance.com') || url.includes('api2.binance.com')) {
      throw new Error('binance down');
    }
    if (url.includes('okx.com/api/v5/market/ticker')) {
      return {
        data: [{
          last: '100',
          open24h: '80',
          high24h: '110',
          low24h: '70',
          volCcy24h: '12345',
          vol24h: '678'
        }]
      };
    }
    throw new Error('unexpected url');
  };

  const ctx = buildMarketApp({ fetchJSONImpl });
  try {
    const res = await request(ctx.app).get('/api/ticker?symbol=BTCUSDT').expect(200);
    assert.equal(res.body.symbol, 'BTCUSDT');
    assert.equal(res.body.lastPrice, '100');
    assert.equal(res.body.priceChangePercent, '25.00');
  } finally {
    ctx.restore();
  }
});

test('GET /api/depth should return empty depth when all upstream fail', async () => {
  const fetchJSONImpl = async () => ({});
  const fetchImpl = async () => ({ ok: false });

  const ctx = buildMarketApp({ fetchJSONImpl, fetchImpl });
  try {
    const res = await request(ctx.app).get('/api/depth?symbol=BTCUSDT&limit=20').expect(200);
    assert.deepEqual(res.body, { bids: [], asks: [] });
  } finally {
    ctx.restore();
  }
});

test('GET /api/klines should fallback to OKX and normalize shape', async () => {
  const fetchJSONImpl = async (url) => {
    if (url.includes('/api/v3/klines')) throw new Error('binance klines down');
    if (url.includes('okx.com/api/v5/market/candles')) {
      return {
        data: [
          // OKX 返回通常是倒序，这里模拟两条
          ['2000', '11', '12', '10', '11.5', '100', '0', '1000'],
          ['1000', '10', '11', '9', '10.5', '90', '0', '900']
        ]
      };
    }
    throw new Error('unexpected url');
  };

  const ctx = buildMarketApp({ fetchJSONImpl });
  try {
    const res = await request(ctx.app).get('/api/klines?symbol=BTCUSDT&interval=4h&limit=2').expect(200);
    assert.equal(Array.isArray(res.body), true);
    assert.equal(res.body.length, 2);
    // 应该被 reverse 后按时间升序（1000 在前）
    assert.equal(res.body[0][0], 1000);
    assert.equal(res.body[1][0], 2000);
    // 归一化后的 Binance 样式数组长度固定 12
    assert.equal(res.body[0].length, 12);
  } finally {
    ctx.restore();
  }
});

