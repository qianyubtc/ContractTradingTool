const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const http = require('node:http');
const path = require('node:path');

function getJSON(url) {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const body = raw ? JSON.parse(raw) : null;
          resolve({ status: res.statusCode, body });
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

function waitForServer(port, timeoutMs = 8000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const probe = async () => {
      try {
        const r = await getJSON(`http://127.0.0.1:${port}/ping`);
        if (r.status === 200 && r.body?.ok === true) return resolve();
      } catch (_) {}
      if (Date.now() - start > timeoutMs) return reject(new Error('server start timeout'));
      setTimeout(probe, 120);
    };
    probe();
  });
}

test('server.js should expose /ping and mounted /api routes', async () => {
  const port = 3100 + Math.floor(Math.random() * 400);
  const serverPath = path.join(__dirname, '../server.js');
  const child = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let stderr = '';
  child.stderr.on('data', (d) => { stderr += String(d); });

  try {
    await waitForServer(port);

    const ping = await getJSON(`http://127.0.0.1:${port}/ping`);
    assert.equal(ping.status, 200);
    assert.equal(ping.body.ok, true);

    // /api/proxy 缺参返回 400，可验证 /api 路由已正确挂载。
    const proxy = await getJSON(`http://127.0.0.1:${port}/api/proxy`);
    assert.equal(proxy.status, 400);
    assert.equal(proxy.body.error, 'missing u');
  } finally {
    child.kill('SIGTERM');
    await new Promise((resolve) => child.once('exit', resolve));
  }

  assert.equal(stderr.trim(), '');
});

