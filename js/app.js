// app.js 负责页面壳逻辑：加载子页面、切换 Tab、主题与初始化调度。
const _pageCache = {};

// 按需加载 pages/*.html，已加载过的页面直接复用缓存，避免重复请求。
async function loadPageContent(page) {
  const containerId = 'page' + page.charAt(0).toUpperCase() + page.slice(1);
  const container = document.getElementById(containerId);
  if (!container) return;
  if (_pageCache[page]) return;

  try {
    const r = await fetch(`pages/${page}.html`);
    if (!r.ok) throw new Error('load failed');
    const content = await r.text();
    container.innerHTML = content;
    _pageCache[page] = true;
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));
  } catch(e) {
    console.warn(`Failed to load page: ${page}`, e);
  }
}

// 页面切换总入口：激活 UI 后再触发对应页面的数据加载函数。
function switchPage(page) {
  _currentPage = page;
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1)).classList.add('active');
  const headerTab = document.querySelector(`.header [data-page="${page}"]`);
  if (headerTab) headerTab.classList.add('active');

  const ctrl = document.getElementById('analysisControls');
  const isMob = window.innerWidth <= 768;
  ctrl.style.display = (page === 'analysis' || isMob) ? 'flex' : 'none';

  document.querySelectorAll('.mobile-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });

  loadPageContent(page).then(() => {
    if (page === 'event'   && typeof loadEventPage === 'function') loadEventPage();
    if (page === 'monitor' && typeof loadMonitor   === 'function') loadMonitor(false);
    if (page === 'live'    && typeof loadLivePage  === 'function') loadLivePage();
    if (page === 'calc'    && typeof loadCalcPage   === 'function') loadCalcPage();
  });
}

function initTheme() {
  const saved = localStorage.getItem('theme');
  if (saved) {
    applyTheme(saved);
  } else {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
  if (window.matchMedia) {
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
      if (!localStorage.getItem('theme')) {
        applyTheme(e.matches ? 'dark' : 'light');
      }
    });
  }
}

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem('theme', theme);
  const btn = document.getElementById('themeToggle');
  if (btn) btn.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function toggleTheme() {
  const cur = document.documentElement.getAttribute('data-theme') || 'dark';
  applyTheme(cur === 'dark' ? 'light' : 'dark');
}

function initCollapse() {
  const isMobile = window.innerWidth <= 768;

  const panels = [
    { h:'trendPanel',      b:'trendList',        mobileCollapsed: false },
    { h:'momentumPanel',   b:'momentumList',      mobileCollapsed: false },
    { h:'volumePanel',     b:'volumeList',        mobileCollapsed: true  },
    { h:'volatilityPanel', b:'volatilityList',    mobileCollapsed: true  },
    { h:'suppPanel',       b:'suppList',          mobileCollapsed: true  },
    { h:'maSysPanel',      b:'maSysList',         mobileCollapsed: true  },
    { h:'fibPanel',        b:'fibBody',           mobileCollapsed: true  },
    { h:'vegasPanel',      b:'vegasList',         mobileCollapsed: true  },
    { h:'elliottPanel',    b:'elliottBody',       mobileCollapsed: true  },
    { h:'liqPanel',        b:'liqContent',        mobileCollapsed: true  },
    { h:'heatPanel',       b:'heatmapContainer',  mobileCollapsed: true  },
    { h:'depthPanel',      b:'depthContent',      mobileCollapsed: true  },
    { h:'vpPanel',         b:'vpContainer',       mobileCollapsed: true  },
    { h:'deltaPanel',      b:'deltaContent',      mobileCollapsed: true  },
    { h:'vpaPanel',        b:'vpaContent',        mobileCollapsed: true  },
    { h:'squarePanel',     b:'squareContent',     mobileCollapsed: true  },
  ];

  panels.forEach(({ h, b, mobileCollapsed }) => {
    const header = document.getElementById(h);
    const body   = document.getElementById(b);
    if (!header || !body) return;

    header.classList.add('collapsible');
    if (!header.querySelector('.panel-collapse-arrow')) {
      const arrow = document.createElement('span');
      arrow.className = 'panel-collapse-arrow';
      arrow.textContent = '▾';
      header.appendChild(arrow);
    }

    const panel = header.closest('.panel');
    const panelBody = panel ? panel.querySelector('.panel-body') : null;
    if (!panelBody) return;

    if (isMobile && mobileCollapsed) {
      header.classList.add('collapsed');
      panelBody.classList.add('collapsed');
    }

    header.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('select')) return;
      const isCollapsed = header.classList.toggle('collapsed');
      panelBody.classList.toggle('collapsed', isCollapsed);
    });
  });
}


window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadPageContent('analysis').then(() => {
    initCollapse();
    setTimeout(loadSymbolList, 100);
    loadAll();
  });

  document.getElementById('intervalSelect').addEventListener('change', loadAll);

  setInterval(() => {
    const dot = document.getElementById('statusDot');
    if (dot && dot.classList.contains('live')) loadAll(true);
  }, 60000);
});
