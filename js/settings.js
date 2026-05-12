import { getUserProfile, saveUserProfile, getFirebaseConfig, setFirebaseConfig } from './firebase.js';
import { showToast } from './camera.js';

export async function renderSettings(container) {
  const profile = await getUserProfile();
  const fbConfig = getFirebaseConfig();
  const apiKey = localStorage.getItem('keto_claude_api_key') || '';

  container.innerHTML = `
  <div class="page">
    <div class="page-header"><span style="font-size:24px">⚙️</span><h1>設定</h1></div>

    <!-- API Keys -->
    <div class="settings-section">
      <div class="settings-section-title">AI 分析設定</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label">Anthropic API Key</label>
          <input type="password" id="s-api-key" class="form-input" value="${apiKey}" placeholder="sk-ant-...">
          <div class="form-hint">儲存於本機，不會上傳至伺服器</div>
        </div>
        <div class="api-key-display ${apiKey ? 'set' : ''}" id="api-key-status">
          ${apiKey ? '✓ 已設定 API Key' : '尚未設定 API Key'}
        </div>
      </div>
    </div>

    <!-- Keto Goals -->
    <div class="settings-section">
      <div class="settings-section-title">每日目標</div>
      <div class="card">
        <div class="form-group">
          <label class="form-label">每日熱量目標 (kcal)</label>
          <input type="number" id="s-calorie-goal" class="form-input" value="${profile.daily_calorie_goal || 2000}" min="500" max="5000" step="50">
        </div>
        <div class="form-group">
          <label class="form-label">碳水日上限 (g)</label>
          <input type="number" id="s-carb-limit" class="form-input" value="${profile.carb_limit_g || 25}" min="5" max="200" step="1">
        </div>
        <div class="card-title" style="margin-top:12px">生酮宏量比例目標</div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">脂肪 (%)</label>
            <input type="number" id="s-fat-pct" class="form-input" value="${profile.fat_pct_goal || 70}" min="1" max="99" step="1">
          </div>
          <div class="form-group">
            <label class="form-label">蛋白質 (%)</label>
            <input type="number" id="s-protein-pct" class="form-input" value="${profile.protein_pct_goal || 25}" min="1" max="99" step="1">
          </div>
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">碳水 (%)</label>
            <input type="number" id="s-carb-pct" class="form-input" value="${profile.carb_pct_goal || 5}" min="1" max="99" step="1">
          </div>
          <div class="form-group">
            <label class="form-label" style="color:var(--color-text-muted);font-size:11px;margin-top:20px">三者加總應 = 100%</label>
          </div>
        </div>
        <div id="pct-warning" class="text-warning hidden" style="font-size:12px;margin-bottom:8px">⚠️ 比例加總不等於 100%</div>
      </div>
    </div>

    <!-- Body Info -->
    <div class="settings-section">
      <div class="settings-section-title">個人資料</div>
      <div class="card">
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">身高 (cm)</label>
            <input type="number" id="s-height" class="form-input" value="${profile.height_cm || ''}" min="100" max="250" placeholder="選填">
          </div>
          <div class="form-group">
            <label class="form-label">體重 (kg)</label>
            <input type="number" id="s-weight" class="form-input" value="${profile.weight_kg || ''}" min="20" max="300" step="0.1" placeholder="選填">
          </div>
        </div>
      </div>
    </div>

    <!-- Firebase Config -->
    <div class="settings-section">
      <div class="settings-section-title">Firebase 雲端同步（選填）</div>
      <div class="card">
        <div class="form-hint" style="margin-bottom:12px">不設定亦可使用，數據將儲存於本機</div>
        <div class="form-group">
          <label class="form-label">API Key</label>
          <input type="text" id="fb-api-key" class="form-input" value="${fbConfig?.apiKey || ''}" placeholder="AIza...">
        </div>
        <div class="form-group">
          <label class="form-label">Auth Domain</label>
          <input type="text" id="fb-auth-domain" class="form-input" value="${fbConfig?.authDomain || ''}" placeholder="xxx.firebaseapp.com">
        </div>
        <div class="form-group">
          <label class="form-label">Project ID</label>
          <input type="text" id="fb-project-id" class="form-input" value="${fbConfig?.projectId || ''}" placeholder="your-project-id">
        </div>
        <div class="form-group">
          <label class="form-label">Storage Bucket</label>
          <input type="text" id="fb-storage-bucket" class="form-input" value="${fbConfig?.storageBucket || ''}" placeholder="xxx.appspot.com">
        </div>
        <div class="form-row">
          <div class="form-group">
            <label class="form-label">Messaging Sender ID</label>
            <input type="text" id="fb-msg-id" class="form-input" value="${fbConfig?.messagingSenderId || ''}">
          </div>
          <div class="form-group">
            <label class="form-label">App ID</label>
            <input type="text" id="fb-app-id" class="form-input" value="${fbConfig?.appId || ''}">
          </div>
        </div>
      </div>
    </div>

    <button class="btn btn-primary mt-8" id="btn-save-settings">💾 儲存所有設定</button>
    <div style="height:16px"></div>
  </div>`;

  // PCT total warning
  ['s-fat-pct','s-protein-pct','s-carb-pct'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', checkPctTotal);
  });

  document.getElementById('btn-save-settings').addEventListener('click', async () => {
    const apiKeyVal = document.getElementById('s-api-key').value.trim();
    if (apiKeyVal) {
      localStorage.setItem('keto_claude_api_key', apiKeyVal);
      document.getElementById('api-key-status').textContent = '✓ 已設定 API Key';
      document.getElementById('api-key-status').classList.add('set');
    }

    const fat = parseInt(document.getElementById('s-fat-pct').value) || 70;
    const protein = parseInt(document.getElementById('s-protein-pct').value) || 25;
    const carb = parseInt(document.getElementById('s-carb-pct').value) || 5;
    if (fat + protein + carb !== 100) {
      showToast('⚠️ 宏量比例加總不等於 100%');
      return;
    }

    const newProfile = {
      daily_calorie_goal: parseInt(document.getElementById('s-calorie-goal').value) || 2000,
      carb_limit_g: parseInt(document.getElementById('s-carb-limit').value) || 25,
      fat_pct_goal: fat,
      protein_pct_goal: protein,
      carb_pct_goal: carb,
      height_cm: parseFloat(document.getElementById('s-height').value) || null,
      weight_kg: parseFloat(document.getElementById('s-weight').value) || null,
    };
    await saveUserProfile(newProfile);

    // Firebase config
    const fbApiKey = document.getElementById('fb-api-key').value.trim();
    if (fbApiKey) {
      setFirebaseConfig({
        apiKey: fbApiKey,
        authDomain: document.getElementById('fb-auth-domain').value.trim(),
        projectId: document.getElementById('fb-project-id').value.trim(),
        storageBucket: document.getElementById('fb-storage-bucket').value.trim(),
        messagingSenderId: document.getElementById('fb-msg-id').value.trim(),
        appId: document.getElementById('fb-app-id').value.trim(),
      });
    }

    showToast('✓ 設定已儲存');
  });
}

function checkPctTotal() {
  const fat = parseInt(document.getElementById('s-fat-pct').value) || 0;
  const protein = parseInt(document.getElementById('s-protein-pct').value) || 0;
  const carb = parseInt(document.getElementById('s-carb-pct').value) || 0;
  document.getElementById('pct-warning').classList.toggle('hidden', fat + protein + carb === 100);
}
