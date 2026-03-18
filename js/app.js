// ── app ──────────────────────────────────────────────────────────────────


// ── 页面动态加载 ──────────────────────────────────────────────────────────────
const _pageCache = {};

async function loadPageContent(page) {
  const containerId = 'page' + page.charAt(0).toUpperCase() + page.slice(1);
  const container = document.getElementById(containerId);
  if (!container) return;

  // 已加载则跳过 fetch，但仍然 resolve
  if (_pageCache[page]) return;

  try {
    const r = await fetch(`pages/${page}.html`);
    if (!r.ok) throw new Error('load failed');
    const content = await r.text();
    container.innerHTML = content;
    _pageCache[page] = true;
    // 等待 DOM 真正渲染完成
    await new Promise(resolve => requestAnimationFrame(() => setTimeout(resolve, 50)));
  } catch(e) {
    console.warn(`Failed to load page: ${page}`, e);
  }
}

function switchPage(page) {
  _currentPage = page;
  // Toggle views
  document.querySelectorAll('.page-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.page-tab').forEach(t => t.classList.remove('active'));
  document.getElementById('page' + page.charAt(0).toUpperCase() + page.slice(1)).classList.add('active');
  // 桌面端 header tab 高亮（可能因 display:none 不可见，但不影响逻辑）
  const headerTab = document.querySelector(`.header [data-page="${page}"]`);
  if (headerTab) headerTab.classList.add('active');

  // Show/hide analysis controls
  const ctrl = document.getElementById('analysisControls');
  const isMob = window.innerWidth <= 768;
  ctrl.style.display = (page === 'analysis' || isMob) ? 'flex' : 'none';

  // 移动端底部tab高亮
  document.querySelectorAll('.mobile-tab').forEach(t => {
    t.classList.toggle('active', t.dataset.page === page);
  });

  // Load page data
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
    // 跟随系统主题，默认浅色
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    applyTheme(prefersDark ? 'dark' : 'light');
  }
  // 监听系统主题变化（仅在用户未手动设置时生效）
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

  // Define which panels are collapsible on desktop vs mobile
  // Format: { headerId, bodyId, defaultCollapsed (mobile) }
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
    // Add arrow if not present
    if (!header.querySelector('.panel-collapse-arrow')) {
      const arrow = document.createElement('span');
      arrow.className = 'panel-collapse-arrow';
      arrow.textContent = '▾';
      header.appendChild(arrow);
    }

    // header의 부모 .panel 안에서 .panel-body 찾기
    const panel = header.closest('.panel');
    const panelBody = panel ? panel.querySelector('.panel-body') : null;
    if (!panelBody) return;

    // Collapse on mobile by default for secondary panels
    if (isMobile && mobileCollapsed) {
      header.classList.add('collapsed');
      panelBody.classList.add('collapsed');
    }

    header.addEventListener('click', (e) => {
      // 버튼 클릭은 무시
      if (e.target.closest('button') || e.target.closest('select')) return;
      const isCollapsed = header.classList.toggle('collapsed');
      panelBody.classList.toggle('collapsed', isCollapsed);
    });
  });
}


// ── 앱 초기화 ─────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  initTheme();
  // 먼저 analysis 페이지 로딩 후 초기화
  loadPageContent('analysis').then(() => {
    initCollapse();
    setTimeout(loadSymbolList, 100);
    loadAll();
  });

  document.getElementById('intervalSelect').addEventListener('change', loadAll);

  // 60초 자동 갱신
  setInterval(() => {
    const dot = document.getElementById('statusDot');
    if (dot && dot.classList.contains('live')) loadAll(true);
  }, 60000);
});
