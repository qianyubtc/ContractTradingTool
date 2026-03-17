// ── 全局配置 ──────────────────────────────────────────────────────────────────
const API       = 'https://api1.qianyubtc.com';
const BINANCE   = 'https://api.binance.com';
const BINANCE_F = 'https://fapi.binance.com';
const COINGECKO = 'https://api.coingecko.com/api/v3';

// 币种搜索
window._allSymbols = [];
window._symbolDropdownOpen = false;

// CoinGecko 캐시
const _cgCache = {};

// CoinGecko trending/global 캐시
let _trendingCache = null, _trendingTs = 0;
let _globalCache = null, _globalTs = 0;

// 모니터 쿨다운
let _monitorLastLoad = 0;

// 마지막 분석 데이터
let _lastAnalysisData = null;
let _currentPage = 'analysis';

// 라이브 데이터
let _liveData = [];
let _liveSort = 'hot';
let _liveFilter = 'all';

// UA
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/122.0.0.0 Safari/537.36';
