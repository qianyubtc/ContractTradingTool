const test = require('node:test');
const assert = require('node:assert/strict');

test('fetchJSON should return cached data on second call', async () => {
  const calls = [];
  const fakeFetch = async () => {
    calls.push(Date.now());
    return {
      ok: true,
      status: 200,
      async json() {
        return { value: 42 };
      }
    };
  };

  const nodeFetchPath = require.resolve('node-fetch');
  const fetchModulePath = require.resolve('../services/fetch');
  const oldNodeFetch = require.cache[nodeFetchPath];
  delete require.cache[fetchModulePath];
  require.cache[nodeFetchPath] = {
    id: nodeFetchPath,
    filename: nodeFetchPath,
    loaded: true,
    exports: fakeFetch
  };

  try {
    const { fetchJSON } = require('../services/fetch');
    const a = await fetchJSON('https://unit.test/fetch/cache', 1000);
    const b = await fetchJSON('https://unit.test/fetch/cache', 1000);
    assert.deepEqual(a, { value: 42 });
    assert.deepEqual(b, { value: 42 });
    assert.equal(calls.length, 1);
  } finally {
    delete require.cache[fetchModulePath];
    if (oldNodeFetch) require.cache[nodeFetchPath] = oldNodeFetch;
    else delete require.cache[nodeFetchPath];
  }
});

test('fetchJSON should throw when upstream response is not ok', async () => {
  const fakeFetch = async () => ({ ok: false, status: 503 });
  const nodeFetchPath = require.resolve('node-fetch');
  const fetchModulePath = require.resolve('../services/fetch');
  const oldNodeFetch = require.cache[nodeFetchPath];
  delete require.cache[fetchModulePath];
  require.cache[nodeFetchPath] = {
    id: nodeFetchPath,
    filename: nodeFetchPath,
    loaded: true,
    exports: fakeFetch
  };

  try {
    const { fetchJSON } = require('../services/fetch');
    await assert.rejects(
      () => fetchJSON('https://unit.test/fetch/error', 1000),
      /HTTP 503/
    );
  } finally {
    delete require.cache[fetchModulePath];
    if (oldNodeFetch) require.cache[nodeFetchPath] = oldNodeFetch;
    else delete require.cache[nodeFetchPath];
  }
});

