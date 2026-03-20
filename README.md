## ContractTradingTool（CTBox）

一个“纯前端页面 + Node/Express 轻量 API 代理”的合约数据看板工具。前端负责展示与指标计算，后端负责拉取交易所/第三方数据并做简单缓存与跨域支持。

> 免责声明：本项目仅用于学习与信息聚合展示，不构成任何投资建议。加密资产波动极大，请自行评估风险。

## 功能概览

- **合约分析**：K 线 + 指标聚合（趋势/动量/波动/量能等），并给出综合评分与信号展示
- **事件合约**：面向事件的快捷视图（依赖前端逻辑）
- **数据监控**：资金费率/持仓等监控面板（部分数据通过后端 `/api/proxy` 拉取）
- **计算器**：常用计算工具页
- **广场直播**：后端 `routes/live.js` 提供数据源（当前有占位配置，需补齐）

## 环境要求

- **Node.js**：建议使用 **LTS 版本（20/22）**（本项目依赖 `puppeteer`；非 LTS 版本下 `npm install` 偶发出现 npm 内部报错）
- **npm**：随 Node 自带

## 安装

后端依赖安装在 `js/` 目录（该目录包含 `package.json`）。

```bash
cd js
npm install
```

## 启动与使用

本项目分为两部分：**后端 API** 与 **前端静态页面**。推荐先启动后端，再打开前端页面。

### 1) 启动后端 API（必需）

后端默认监听 `3000` 端口，提供 `/api/*` 接口给前端调用。

```bash
# 在项目根目录
node server.js
```

启动后验证：

- `GET /ping`：`http://localhost:3000/ping`
- 例：`GET /api/ticker?symbol=BTCUSDT`：`http://localhost:3000/api/ticker?symbol=BTCUSDT`

### 2) 配置前端 API 地址（必需）

前端通过全局变量 `API` 指向后端地址，位置在 `js/config.js`：

- **本地开发**：把 `API` 设置为 `http://localhost:3000`
- **同域部署**（前后端同域同端口反代）：可以设置为空字符串 `''`

示例：

```js
const API = 'http://localhost:3000';
```

### 3) 运行前端页面

前端是静态站点（`index.html` + `pages/` + `css/` + `js/`）。你可以用任意静态服务器启动，也可以直接双击打开 `index.html`（但某些浏览器的本地 `file://` 可能限制 `fetch`）。

推荐方式（任选其一）：

```bash
# 方式 A：用 npx 临时起一个静态服务器（推荐）
npx http-server . -p 5173

# 方式 B：Python
python3 -m http.server 5173
```

然后打开：

- `http://localhost:5173`

## 目录结构

```text
.
├─ index.html              # 前端入口（多页容器 + 顶部/底部导航）
├─ pages/                  # 各页面片段（analysis / event / monitor / live / calc）
├─ css/style.css           # 全局样式
├─ js/                     # 前端脚本 +（历史原因）后端依赖包清单
│  ├─ config.js            # 前端配置（API 基址、名称映射等）
│  ├─ api.js               # 前端 API 调用封装（调用 /api/*）
│  ├─ analysis.js          # 合约分析页主逻辑
│  ├─ indicators.js        # 指标计算
│  ├─ render.js            # UI 渲染与组件拼装
│  ├─ monitor.js           # 监控页逻辑
│  ├─ event.js             # 事件页逻辑
│  ├─ calc.js              # 计算器页逻辑
│  ├─ app.js               # 页面切换、主题、初始化
│  └─ package.json         # 后端依赖（express/node-fetch/puppeteer 等）
├─ routes/                 # 后端路由（Express Router）
│  ├─ market.js            # /api/ticker /api/klines /api/depth（Binance/OKX）
│  ├─ futures.js           # /api/funding /api/oi /api/ls /api/force（Binance Futures）
│  ├─ sentiment.js         # /api/fg /api/cg /api/trending /api/global（Alternative/Coingecko）
│  ├─ news.js              # /api/news（RSS 聚合，当前需补 RSS 源）
│  ├─ proxy.js             # /api/proxy（白名单代理，当前需补允许域名）
│  └─ live.js              # /api/live（直播数据抓取，当前需补数据源）
├─ services/
│  ├─ fetch.js             # node-fetch + 简单缓存封装
│  └─ cache.js             # Map TTL 缓存
├─ server.js               # 后端启动入口（本仓库新增，路径正确）
└─ README.md
```

## 重要文件/配置说明

- **`js/config.js`**
  - **`API`**：前端请求的后端基址（必须配置）
  - `nameMap` / `nameMapVpa`：指标与模块显示名称映射
- **`server.js`**
  - 后端入口，挂载所有 `routes/` 到 `/api`
  - 默认端口 `3000`（可自行修改）
- **`routes/proxy.js`**
  - `ALLOWED`：代理白名单域名列表（当前是占位 `['']`，需要补齐你允许代理的域名）
- **`routes/news.js`**
  - `RSS_SOURCES`：RSS 数据源列表（当前是占位，需要补齐）
- **`routes/live.js`**
  - 抓取页面/接口地址（当前是空字符串占位，需要补齐真实来源）

## 常见问题（FAQ）

- **`npm install` 报 `Exit handler never called!`？**
  - 这通常是 npm/Node 版本兼容性或安装进程异常退出导致。建议切换到 **Node LTS（20/22）** 后重试安装（如用 `nvm` / `fnm` 管理版本）。
- **启动了前端但一直报错/无数据？**
  - 确认后端 `server.js` 正在运行，且 `js/config.js` 的 `API` 指向正确（如 `http://localhost:3000`）。
- **`/api/proxy` 返回 `domain not allowed`？**
  - 需要在 `routes/proxy.js` 的 `ALLOWED` 中添加目标域名白名单。
- **新闻与直播接口返回空列表？**
  - `routes/news.js` 的 `RSS_SOURCES` 与 `routes/live.js` 的抓取 URL 当前是占位，需要你补齐数据源。

