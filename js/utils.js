// ── utils ──────────────────────────────────────────────────────────────────

function fmt(n, dec=2) {
  if (n === null || n === undefined || isNaN(n)) return '--';
  if (Math.abs(n) >= 1e9) return (n/1e9).toFixed(2)+'B';
  if (Math.abs(n) >= 1e6) return (n/1e6).toFixed(2)+'M';
  if (Math.abs(n) >= 1e3) return (n/1e3).toFixed(2)+'K';
  return parseFloat(n.toFixed(dec)).toString();
}

function fmtPrice(n) {
  if (!n) return '--';
  if (n >= 1000) return n.toLocaleString('en-US', {minimumFractionDigits:2, maximumFractionDigits:2});
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function setStatus(state) {
  const dot = document.getElementById('statusDot');
  dot.className = 'status-dot ' + state;
}

function showError(msg) {
  const b = document.getElementById('errorBanner');
  b.textContent = '⚠ ' + msg;
  b.classList.add('show');
  setTimeout(() => b.classList.remove('show'), 5000);
}

function timeAgo(dateStr) {
  if (!dateStr) return '';
  // 兼容多种格式：ISO、空格分隔、时间戳数字
  let d;
  if (typeof dateStr === 'number') {
    d = new Date(dateStr > 1e12 ? dateStr : dateStr * 1000);
  } else {
    // 把空格分隔的 "2024-01-01 12:00:00" 转成 ISO
    const s = String(dateStr).trim().replace(' ', 'T');
    d = new Date(s);
  }
  if (isNaN(d.getTime())) return '';
  const diff = Math.floor((Date.now() - d.getTime()) / 60000);
  if (diff < 0)    return '刚刚';
  if (diff < 1)    return '刚刚';
  if (diff < 60)   return `${diff}分钟前`;
  if (diff < 1440) return `${Math.floor(diff/60)}小时前`;
  return `${Math.floor(diff/1440)}天前`;
}

function impactDots(score, type) {
  // score 1-3
  const color = type === 'bull' ? 'var(--green)' : type === 'bear' ? 'var(--red)' : 'var(--text-muted)';
  return [1,2,3].map(i =>
    `<div class="news-impact-dot" style="background:${i<=score?color:'rgba(255,255,255,0.1)'}"></div>`
  ).join('');
}

function proxyUrl(url) {
  // 不再使用 Cloudflare Worker，改走海外服务器
  return `${API}/api/proxy?u=${encodeURIComponent(url)}`;
}

function fetchTimeout(url, ms = 9000) {
  const ctrl  = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, { signal: ctrl.signal, cache: 'no-cache' })
    .finally(() => clearTimeout(timer));
}

async function fetchJSON(url, useProxy = true) {
  const target = useProxy ? proxyUrl(url) : url;
  try {
    const r = await fetchTimeout(target, 9000);
    // Worker 自身返回的错误（非上游错误）
    if (r.status === 403 || r.status === 400) {
      const err = await r.json().catch(() => ({}));
      throw new Error(err.error || `HTTP ${r.status}`);
    }
    // 上游 4xx/5xx：尝试解析 JSON，抛出
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('timeout');
    throw e;
  }
}

