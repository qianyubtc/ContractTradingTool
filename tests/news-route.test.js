const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const request = require('supertest');

function buildNewsAppWithFakeFetch(fakeFetch, sources) {
  process.env.NEWS_RSS_SOURCES = JSON.stringify(sources);

  const fetchServicePath = require.resolve('../services/fetch');
  const newsRoutePath = require.resolve('../routes/news');
  const oldFetchService = require.cache[fetchServicePath];
  delete require.cache[fetchServicePath];
  delete require.cache[newsRoutePath];

  require.cache[fetchServicePath] = {
    id: fetchServicePath,
    filename: fetchServicePath,
    loaded: true,
    exports: { fetch: fakeFetch, UA: 'test-ua' }
  };

  const router = require('../routes/news');
  const app = express();
  app.use('/api', router);

  return {
    app,
    restore() {
      delete require.cache[newsRoutePath];
      if (oldFetchService) require.cache[fetchServicePath] = oldFetchService;
      else delete require.cache[fetchServicePath];
      delete process.env.NEWS_RSS_SOURCES;
    }
  };
}

test('GET /api/news should parse RSS and keep coin-related titles', async () => {
  const xml = `
    <rss><channel>
      <item><title><![CDATA[BTC rallies above key level]]></title><pubDate>Wed, 01 Jan 2025 00:00:00 GMT</pubDate><link>https://a.test/1</link></item>
      <item><title>Sports daily news</title><pubDate>Wed, 01 Jan 2025 01:00:00 GMT</pubDate><link>https://a.test/2</link></item>
      <item><title>ETH and BTC correlation update</title><pubDate>Wed, 01 Jan 2025 02:00:00 GMT</pubDate><link>https://a.test/3</link></item>
    </channel></rss>
  `;

  const fakeFetch = async () => ({
    async text() { return xml; }
  });

  const ctx = buildNewsAppWithFakeFetch(fakeFetch, [{ url: 'https://rss.test/a', name: 'SourceA' }]);
  try {
    const res = await request(ctx.app).get('/api/news?coin=BTC').expect(200);
    assert.ok(Array.isArray(res.body.items));
    assert.ok(res.body.items.length >= 2);
    const titles = res.body.items.map((i) => i.title.toLowerCase()).join(' | ');
    assert.match(titles, /btc/);
  } finally {
    ctx.restore();
  }
});

test('GET /api/news should degrade to 200 with empty items when all sources fail', async () => {
  const fakeFetch = async () => {
    throw new Error('network down');
  };

  const ctx = buildNewsAppWithFakeFetch(fakeFetch, [{ url: 'https://rss.test/b', name: 'SourceB' }]);
  try {
    const res = await request(ctx.app).get('/api/news?coin=ETH').expect(200);
    assert.equal(Array.isArray(res.body.items), true);
    assert.equal(res.body.items.length, 0);
    assert.equal(typeof res.body.updated, 'number');
  } finally {
    ctx.restore();
  }
});

