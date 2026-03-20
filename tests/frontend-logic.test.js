const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function createElement() {
  return {
    textContent: '',
    innerHTML: '',
    className: '',
    style: {},
    attributes: {},
    setAttribute(name, value) {
      this.attributes[name] = String(value);
    }
  };
}

function createDocument(ids = []) {
  const map = new Map(ids.map((id) => [id, createElement()]));
  return {
    getElementById(id) {
      return map.get(id) || null;
    },
    querySelector() {
      return null;
    },
    _map: map
  };
}

function loadScript(filePath, extras = {}) {
  const code = fs.readFileSync(filePath, 'utf8');
  const context = {
    console,
    Math,
    Date,
    setTimeout,
    clearTimeout,
    ...extras
  };
  vm.createContext(context);
  vm.runInContext(code, context, { filename: filePath });
  return context;
}

test('calcNewsSentiment should include boundary funding rate 0.05%', () => {
  const document = createDocument(['newsSentLabel', 'newsSentDesc']);
  const ctx = loadScript(path.join(__dirname, '../js/analysis.js'), { document, window: {} });

  const indicators = { a: { type: 'neutral' } };
  const fgData = { status: 'rejected' };
  const lsData = { status: 'rejected' };
  const fundingData = {
    status: 'fulfilled',
    value: [{ fundingRate: '0.0005' }]
  };

  ctx.calcNewsSentiment(indicators, fgData, fundingData, lsData);
  const desc = document.getElementById('newsSentDesc').textContent;
  assert.match(desc, /资金费率\+0\.050%/);
});

test('renderRiskAlerts should treat decimal and percent fundingRate consistently', () => {
  const document = createDocument(['riskAlerts', 'riskBadge', 'riskConclusion']);
  const ctx = loadScript(path.join(__dirname, '../js/render.js'), { document });

  const ticker = { priceChangePercent: '0.2', quoteVolume: '200000000', lastPrice: '100000' };
  const noKlines = [];

  ctx.renderRiskAlerts('BTC', noKlines, ticker, [{ fundingRate: '0.0002' }]); // 0.02%
  const htmlWithDecimal = document.getElementById('riskAlerts').innerHTML;

  ctx.renderRiskAlerts('BTC', noKlines, ticker, [{ fundingRate: '0.02' }]); // already 0.02%
  const htmlWithPercent = document.getElementById('riskAlerts').innerHTML;

  const hasHighRiskA = htmlWithDecimal.includes('资金费率过高');
  const hasHighRiskB = htmlWithPercent.includes('资金费率过高');
  assert.equal(hasHighRiskA, hasHighRiskB);
});

test('updateMiniChart should not throw when SVG/canvas nodes are missing', () => {
  const document = createDocument([]);
  const ctx = loadScript(path.join(__dirname, '../js/render.js'), { document });

  assert.doesNotThrow(() => {
    ctx.updateMiniChart([1, 2, 3, 4]);
  });
});

