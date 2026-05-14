import { getLocalProfile, saveLocalProfile, getLocalHistory, getTodayStr } from './store.js';
import { showToast } from './camera.js';

export const APP_VERSION = 'v2.4.1';

export function renderSettings(container) {
  const profile = getLocalProfile();
  const apiKey = localStorage.getItem('keto_claude_api_key') || '';
  const isLoggedIn = !!window.__ketoUser;

  container.innerHTML = `
  <div class="page">
    <div class="page-header"><span style="font-size:24px">\u2699\uFE0F</span><h1>\u8A2D\u5B9A</h1></div>

    <div class="settings-section">
      <div class="settings-section-title">AI \u5206\u6790</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label">Gemini API Key</label>
          <input type="password" id="api-key-input" class="form-input" placeholder="AIza..." value="${apiKey}">
          <div class="form-hint">\u7528\u65BC AI \u5206\u6790\u98DF\u7269\u5716\u7247\uFF0C<a href="https://aistudio.google.com/app/apikey" target="_blank" style="color:var(--color-primary-light)">\u524D\u5F80\u53D6\u5F97 Gemini API Key</a></div>
        </div>
        <button class="btn btn-primary" id="btn-save-api">\u5132\u5B58 API Key</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">\u6BCF\u65E5\u76EE\u6A19</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label">\u6BCF\u65E5\u71B1\u91CF\u76EE\u6A19 (kcal)</label>
          <input type="number" id="s-calorie" class="form-input" value="${profile.daily_calorie_goal || 2000}" min="500" max="5000">
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">\u8102\u80AA\u76EE\u6A19 (%)</label><input type="number" id="s-fat" class="form-input" value="${profile.fat_pct_goal || 70}" min="40" max="90"></div>
          <div class="form-group"><label class="form-label">\u86CB\u767D\u8CEA\u76EE\u6A19 (%)</label><input type="number" id="s-protein" class="form-input" value="${profile.protein_pct_goal || 25}" min="10" max="40"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">\u78B3\u6C34\u4E0A\u9650 (g/\u65E5)</label><input type="number" id="s-carb" class="form-input" value="${profile.carb_limit_g || 25}" min="10" max="100"></div>
          <div class="form-group"><label class="form-label">\u6DE8\u78B3\u6C34\u76EE\u6A19 (%)</label><input type="number" id="s-carb-pct" class="form-input" value="${profile.carb_pct_goal || 5}" min="0" max="20"></div>
        </div>
        <button class="btn btn-primary" id="btn-save-profile">\u5132\u5B58\u76EE\u6A19</button>
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">\u96F2\u7AEF\u540C\u6B65\uFF08\u53EF\u9078\uFF09</div>
      <div class="card">
        ${isLoggedIn
          ? `<div class="settings-item">
              <div>
                <div class="settings-item-label">\u5DF2\u767B\u5165</div>
                <div class="settings-item-value">${window.__ketoUser?.email || ''}</div>
              </div>
              <button class="btn btn-outline btn-sm" id="btn-signout">\u767B\u51FA</button>
            </div>`
          : `<div style="font-size:13px;color:var(--color-text-muted);margin-bottom:12px">\u767B\u5165 Google \u5E33\u865F\u53EF\u5C07\u7D00\u9304\u540C\u6B65\u81F3\u96F2\u7AEF\uFF0C\u8DE8\u88DD\u7F6E\u4F7F\u7528</div>
             <button class="btn btn-outline" id="btn-signin">
               <svg width="16" height="16" viewBox="0 0 48 48" style="flex-shrink:0">
                 <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                 <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                 <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                 <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
               </svg>
               \u7528 Google \u767B\u5165\u4EE5\u555F\u7528\u96F2\u7AEF\u540C\u6B65
             </button>`}
      </div>
    </div>

    <div class="settings-section">
      <div class="settings-section-title">\u8CC7\u6599\u7BA1\u7406</div>
      <div class="card">
        <button class="btn btn-danger" id="btn-clear-today" style="margin-bottom:8px;width:100%">\u6E05\u9664\u4ECA\u65E5\u7D00\u9304</button>
        <button class="btn btn-outline" id="btn-export" style="width:100%">\u532F\u51FA JSON \u5099\u4EFD</button>
      </div>
    </div>

    <div style="text-align:center;padding:20px 0 8px;color:var(--color-text-faint);font-size:12px;letter-spacing:0.04em;">
      Keto Tracker ${APP_VERSION}
    </div>
  </div>`;

  document.getElementById('btn-save-api').addEventListener('click', () => {
    const key = document.getElementById('api-key-input').value.trim();
    if (key) { localStorage.setItem('keto_claude_api_key', key); showToast('\u2713 API Key \u5DF2\u5132\u5B58'); }
    else { localStorage.removeItem('keto_claude_api_key'); showToast('API Key \u5DF2\u6E05\u9664'); }
  });

  document.getElementById('btn-save-profile').addEventListener('click', () => {
    const p = getLocalProfile();
    p.daily_calorie_goal = Number(document.getElementById('s-calorie').value) || 2000;
    p.fat_pct_goal = Number(document.getElementById('s-fat').value) || 70;
    p.protein_pct_goal = Number(document.getElementById('s-protein').value) || 25;
    p.carb_pct_goal = Number(document.getElementById('s-carb-pct').value) || 5;
    p.carb_limit_g = Number(document.getElementById('s-carb').value) || 25;
    saveLocalProfile(p);
    showToast('\u2713 \u76EE\u6A19\u5DF2\u5132\u5B58');
  });

  document.getElementById('btn-signin')?.addEventListener('click', () => {
    const localLogs = getLocalHistory();
    if (localLogs.length > 0) {
      const ok = confirm(
        `\u4F60\u6709 ${localLogs.length} \u7B46\u672C\u6A5F\u8A18\u9304\u3002\n\n` +
        `\u767B\u5165\u5F8C\uFF0C\u96F2\u7AEF\u8A18\u9304\u5C07\u8986\u84CB\u672C\u6A5F\u8A18\u9304\uFF08\u96F2\u7AEF\u70BA\u6E96\uFF09\u3002` +
        `\u5982\u672C\u6A5F\u6709\u91CD\u8981\u8A18\u9304\uFF0C\u5EFA\u8B70\u5148\u9EDE\u64CA\u300C\u532F\u51FA JSON \u5099\u4EFD\u300D\u518D\u767B\u5165\u3002\n\n` +
        `\u78BA\u5B9A\u7E7C\u7E8C\u767B\u5165\uFF1F`
      );
      if (!ok) return;
    }
    const btn = document.getElementById('btn-signin');
    btn.textContent = '\u8DF3\u8F49\u81F3 Google \u767B\u5165\u4E2D...';
    btn.disabled = true;
    window.ketoSignIn().catch(err => {
      console.error('SignIn failed:', err);
      renderSettings(container);
      showToast('\u767B\u5165\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66');
    });
  });

  document.getElementById('btn-signout')?.addEventListener('click', async () => {
    await window.ketoSignOut();
    showToast('\u5DF2\u767B\u51FA');
    renderSettings(container);
  });

  document.getElementById('btn-clear-today')?.addEventListener('click', () => {
    const today = getTodayStr();
    localStorage.removeItem(`keto_log_${today}`);
    showToast('\u2713 \u4ECA\u65E5\u7D00\u9304\u5DF2\u6E05\u9664');
  });

  document.getElementById('btn-export')?.addEventListener('click', () => {
    const logs = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('keto_log_')) {
        try { logs.push(JSON.parse(localStorage.getItem(key))); } catch {}
      }
    }
    logs.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    const blob = new Blob([JSON.stringify({ exported_at: new Date().toISOString(), logs }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `keto-backup-${getTodayStr()}.json`;
    a.click();
  });
}
