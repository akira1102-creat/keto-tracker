# CLAUDE.md — keto-tracker 開發規範

## ⚠️ 必讀：每次修改後強制執行

**每次對任何檔案作出修改並 commit 之前，必須先 bump `sw.js` 的 Cache 版本號。**

---

## Service Worker Cache 版本規則

### 版本格式

```
v<major>.<minor>.<patch>
```

例：`v2.1.6` → 下次改動變成 `v2.1.7`

### 位置

檔案：`sw.js`，第一行：

```js
const CACHE_VERSION = 'v2.1.7'; // ← 每次改動都要 +1 patch
```

### Bump 規則

| 情況 | 動作 |
|------|------|
| 任何 JS / CSS / HTML 修改 | patch +1（例 v2.1.6 → v2.1.7） |
| 新增重要功能 | minor +1，patch 歸零（例 v2.2.0） |
| 結構性重寫 | major +1，其餘歸零（例 v3.0.0） |

### 為何重要

不 bump 版本 → 用家瀏覽器繼續使用舊 Service Worker 快取 → 新代碼無法生效 → 用家看到的永遠是舊版本。

---

## Commit 前 Checklist

每次 commit 前確認以下全部完成：

- [ ] `sw.js` 第一行 `CACHE_VERSION` 已 bump
- [ ] `sw.js` 的 `STATIC_ASSETS` 陣列包含所有新增的靜態檔案路徑
- [ ] 所有新增的 `js/*.js`、`css/*.css`、新 HTML 頁面都已加入 `STATIC_ASSETS`

---

## STATIC_ASSETS 維護

每次新增靜態檔案，必須同步加入 `sw.js` 的 `STATIC_ASSETS`：

```js
const STATIC_ASSETS = [
  '/keto-tracker/',
  '/keto-tracker/index.html',
  '/keto-tracker/css/style.css',
  '/keto-tracker/js/app.js',
  '/keto-tracker/js/store.js',
  '/keto-tracker/js/camera.js',
  '/keto-tracker/js/claude.js',
  '/keto-tracker/js/dashboard.js',
  '/keto-tracker/js/history.js',
  '/keto-tracker/js/settings.js',
  '/keto-tracker/js/router.js',
  '/keto-tracker/manifest.json',
  // ← 新增檔案加在這裡
];
```

---

## 專案結構

```
keto-tracker/
├── index.html          # 主入口，含 splash screen 與 fallback timer
├── manifest.json       # PWA manifest，icons 路徑用 PNG
├── sw.js               # Service Worker，每次改動必須 bump CACHE_VERSION
├── css/
│   └── style.css
├── js/
│   ├── app.js          # 初始化、routing、PWA install prompt
│   ├── router.js       # 頁面切換，避免循環 import
│   ├── store.js        # localStorage 讀寫，零網絡請求
│   ├── camera.js       # 記錄頁面（拍照 / 上傳 / 手動輸入 / 日期選擇）
│   ├── claude.js       # Gemini Vision API 呼叫與 JSON 解析
│   ├── dashboard.js    # 今日總覽
│   ├── history.js      # 歷史記錄
│   ├── settings.js     # 設定（Gemini API Key、每日目標、資料管理）
│   └── firebase.js     # 雲端同步（lazy import，不影響主載入）
└── icons/
    ├── android-chrome-192x192.png
    ├── android-chrome-512x512.png
    ├── apple-touch-icon.png
    ├── favicon-96x96.png
    └── favicon.ico
```

---

## 技術注意事項

### API Key 儲存

- Key 存於 `localStorage` 的 `keto_claude_api_key`
- 實際呼叫的是 **Google Gemini API**（非 Anthropic）
- 設定頁面 label 為「Gemini API Key」，取得連結：https://aistudio.google.com/app/apikey

### 日期處理

- 所有日期字串格式：`YYYY-MM-DD`（澳門時區）
- 統一使用 `getTodayStr()` from `store.js`
- 記錄頁支援補錄過去日期，上限為今日

### localStorage Key 命名

| Key | 內容 |
|-----|------|
| `keto_profile` | 用戶目標設定 |
| `keto_log_YYYY-MM-DD` | 當日餐點記錄 |
| `keto_claude_api_key` | Gemini API Key |

### Firebase

- `firebase.js` 採用 **lazy import**，只在用戶主動登入時才載入
- 絕對不可在 `app.js` 頂層 `import firebase.js`，否則會阻塞主載入

---

## 生酮判斷邏輯（`store.js`）

```
keto_status = 'risk'  → 淨碳水 > 50g 或 脂肪熱量佔比 < 60%
keto_status = 'edge'  → 淨碳水 > carb_limit_g 或 脂肪熱量佔比 < 65%
keto_status = 'keto'  → 其餘情況（正常入酮）
```
