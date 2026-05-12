import { getLocalProfile, saveLocalProfile } from './store.js';
import { getTodayStr } from './store.js';
import { showToast } from './camera.js';

const APP_VERSION = 'v2.3.3';

export function renderSettings(container) {
  const profile = getLocalProfile();
  const apiKey = localStorage.getItem('keto_claude_api_key') || '';
  const isLoggedIn = !!window.__ketoUser;

  container.innerHTML = `
  <div class="page">
    <div class="page-header"><span style="font-size:24px">⚙️</span><h1>設定</h1></div>

    <div class="settings-section">
      <div class="settings-section-title">AI 分析</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label">Gemini API Key</label>
          <input type="password" id="api-key-input" class="form-input" placeholder="AIza..." value="${apiKey}">
          <div class="form-hint">用於 AI 分析食物圖片，<a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--color-primary-light)">前往取得 Gemini API Key</a></div>
        </div>
        <button class="btn btn-primary" id="btn-save-api">儲存 API Key</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">每日目標</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label">每日熱量目標 (kcal)</label>
          <input type="number" id="s-calorie" class="form-input" value="${profile.daily_calorie_goal || 2000}" min="500" max="5000">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">脂肪目標 (%)</label>
            <input type="number" id="s-fat" class="form-input" value="${profile.fat_pct_goal || 70}" min="40" max="90">
          </div>
          <div class="form-group">
            <label class="form-label">蛋白質目標 (%)</label>
            <input type="number" id="s-protein" class="form-input" value="${profile.protein_pct_goal || 25}" min="10" max="40">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">碳水上限 (g/日)</label>
            <input type="number" id="s-carb" class="form-input" value="${profile.carb_limit_g || 25}" min="10" max="100">
          </div>
          <div class="form-group">
            <label class="form-label">淨碳水目標 (%)</label>
            <input type="number" id="s-carb-pct" class="form-input" value="${profile.carb_pct_goal || 5}" min="0" max="20">
          </div>
        </div>
        <button class="btn btn-primary" id="btn-save-profile">儲存目標</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">雲端同步（可選）</div>
      <div class="card">
        ${isLoggedIn
          ? `<div class="settings-item">
              <div>
                <div class="settings-item-label">已登入</div>
                <div class="settings-item-value">${window.__ketoUser?.email || ''}</div>
              </div>
              <button class="btn btn-outline btn-sm" id="btn-signout">登出</button>
            </div>`
          : `<div style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">登入 Google 帳號可將紀錄同步至雲端，跨裝置使用</div>
             <button class="btn btn-outline" id="btn-signin">
               <svg width="16" height="16" viewBox="0 0 48 48" style="flex-shrink:0">
                 <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                 <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                 <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                 <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
               </svg>
               用 Google 登入以啟用雲端同步
             </button>`}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">資料管理</div>
      <div class="card">
        <button class="btn btn-danger" id="btn-clear-today" style="margin-bottom:8px;width:100%">清除今日紀錄</button>
        <button class="btn btn-outline" id="btn-export" style="width:100%">匯出 JSON 備份</button>
      </div>
    </div>

    <div style="text-align:center;padding:20px 0 8px;color:var(--color-text-faint);font-size:12px;letter-spacing:0.04em;">
      Keto Tracker ${APP_VERSION}
    </div>
  </div>`;

  document.getElementById('btn-save-api').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) { localStorage.setItem('keto_claude_api_key', key); showToast('✓ API Key 已儲存'); }
    else { localStorage.removeItem('keto_claude_api_key'); showToast('API Key 已清除'); }
  });

  document.getElementById('btn-save-profile').addEventListener('click', () => {
    const p = getLocalProfile();
    p.daily_calorie_goal = Number(document.getElementById('s-calorie').value) || 2000;
    p.fat_pct_goal = Number(document.getElementById('s-fat').value) || 70;
    p.protein_pct_goal = Number(document.getElementById('s-protein').value) || 25;
    p.carb_pct_goal = Number(document.getElementById('s-carb-pct').value) || 5;
    p.carb_limit_g = Number(document.getElementById('s-carb').value) || 25;
    saveLocalProfile(p);
    showToast('✓ 目標已儲存');
  });

  document.getElementById('btn-signin')?.addEventListener('click', () => {
    const btn = document.getElementById('btn-signin');
    btn.innerHTML = '登入中...';
    btn.disabled = true;
    window.ketoSignIn().catch(err => {
      console.error('SignIn failed:', err);
      btn.innerHTML = '登入失敗：' + (err?.message || err?.code || '請重試');
      btn.disabled = false;
    });
  });

  document.getElementById('btn-signout')?.addEventListener('click', async () => {
    await window.ketoSignOut();
    showToast('已登出');
    import('./settings.js').then(m => m.renderSettings(container));
  });

  document.getElementById('btn-clear-today')?.addEventListener('click', () => {
    if (!confirm('確定清除今日所有紀錄？')) return;
    const dateStr = getTodayStr();
    localStorage.removeItem(`keto_log_${dateStr}`);
    showToast('今日紀錄已清除');
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    const data = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith('keto_')) data[k] = localStorage.getItem(k);
    }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keto-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
  });
}
