import { analyzeImage } from './claude.js';
import { getLocalLog, saveLocalLog, calcDayTotals, calcKetoStatus, getTodayStr, getLocalProfile } from './store.js';
import { navigate } from './router.js';

const MAX_DIM = 1024;

window.__ketoAnalysis = window.__ketoAnalysis || {
  status: 'idle',
  data: null,
  errorMsg: '',
  imageBase64: null,
  imageMime: 'image/jpeg',
};

export function updateNavBadge() {
  const badge = document.querySelector('.nav-btn[data-page="record"] .nav-badge');
  if (!badge) return;
  const s = window.__ketoAnalysis;
  if (s.status === 'running') {
    badge.className = 'nav-badge running'; badge.textContent = '\u2026';
  } else if (s.status === 'done') {
    badge.className = 'nav-badge done'; badge.textContent = '\u2713';
  } else {
    badge.className = 'nav-badge'; badge.textContent = '';
  }
}

// 全頁面頂部 banner：分析中 / 分析完成
function updateGlobalAnalysisBanner() {
  const s = window.__ketoAnalysis;
  let banner = document.getElementById('keto-analysis-banner');
  if (s.status === 'idle' || s.status === 'error') {
    if (banner) banner.remove();
    return;
  }
  if (!banner) {
    banner = document.createElement('div');
    banner.id = 'keto-analysis-banner';
    banner.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'display:flex', 'align-items:center', 'gap:10px',
      'padding:12px 16px',
      'font-size:14px', 'font-weight:600',
      'box-shadow:0 2px 8px rgba(0,0,0,0.18)',
      'transition:background 0.3s',
      'cursor:pointer',
    ].join(';');
    document.body.appendChild(banner);
  }
  if (s.status === 'running') {
    banner.style.background = 'var(--color-primary, #01696f)';
    banner.style.color = '#fff';
    banner.innerHTML = '<div class="spinner" style="width:18px;height:18px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;flex-shrink:0"></div><span>AI 分析中⋯可先去其他頁面</span>';
  } else if (s.status === 'done') {
    banner.style.background = '#1a7a2e';
    banner.style.color = '#fff';
    banner.innerHTML = `
      <span style="font-size:22px;flex-shrink:0">✅</span>
      <span style="flex:1">分析完成！點此前往儲存</span>
      <button id="banner-dismiss" style="background:rgba(255,255,255,0.25);border:none;color:#fff;font-size:13px;font-weight:600;padding:4px 10px;border-radius:6px;cursor:pointer;flex-shrink:0">✕ 關閉</button>
    `;
    // 點 banner 本體跳去記錄頁
    banner.onclick = e => {
      if (e.target.id === 'banner-dismiss') return;
      navigate('record');
    };
    document.getElementById('banner-dismiss')?.addEventListener('click', e => {
      e.stopPropagation();
      window.__ketoAnalysis.status = 'idle';
      updateNavBadge();
      banner.remove();
    });
    // 震動提示（如支援）
    try { if (navigator.vibrate) navigator.vibrate([100, 50, 100]); } catch {}
  }
}

// 暴露給 app.js / router 在換頁時重新檢查
window.__updateAnalysisBanner = updateGlobalAnalysisBanner;

let _bgCheckTimer = null;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') {
    const s = window.__ketoAnalysis;
    updateGlobalAnalysisBanner();
    if (s.status === 'running') {
      clearTimeout(_bgCheckTimer);
      _bgCheckTimer = setTimeout(() => {
        if (window.__ketoAnalysis.status === 'running') {
          window.__ketoAnalysis.status = 'error';
          window.__ketoAnalysis.errorMsg = '後台中斷，請重試';
          updateNavBadge();
          updateGlobalAnalysisBanner();
          const analyzingSection = document.getElementById('analyzing-section');
          const manualSection = document.getElementById('manual-section');
          if (analyzingSection) analyzingSection.classList.add('hidden');
          if (manualSection) manualSection.classList.remove('hidden');
          showToast('後台中斷，請重試');
        }
      }, 3000);
    }
  } else {
    if (window.__ketoAnalysis.status === 'running') window.__ketoAnalysis._bgAt = Date.now();
  }
});

// ===== Cloud save helper =====
async function saveLogCloud(dateStr, log) {
  saveLocalLog(dateStr, log);
  if (window.__ketoUser) {
    try {
      const { saveDailyLog } = await import('./firebase.js');
      await saveDailyLog(dateStr, log);
    } catch (e) {
      console.warn('[keto] cloud save failed, queued locally:', e);
    }
  }
}

// 刪除指定日期的餐點並同步
export async function deleteMeal(dateStr, mealId) {
  const log = getLocalLog(dateStr);
  log.meals = (log.meals || []).filter(m => m.id !== mealId);
  const totals = calcDayTotals(log.meals);
  const profile = getLocalProfile();
  Object.assign(log, totals, { date: dateStr, keto_status: calcKetoStatus(totals, profile) });
  await saveLogCloud(dateStr, log);
}

export function renderRecord(container) {
  const todayStr = getTodayStr();
  const s = window.__ketoAnalysis;

  container.innerHTML = `
  <div class="page">
    <div class="page-header">
      <span style="font-size:24px">📷</span>
      <h1>記錄飲食</h1>
    </div>

    <div class="card" style="margin-bottom:12px;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">📅</span>
        <label class="form-label" for="record-date" style="margin:0;font-weight:600">記錄日期</label>
        <input type="date" id="record-date" class="form-input" value="${todayStr}" max="${todayStr}" style="flex:1;min-width:0">
      </div>
      <div id="date-hint" style="font-size:12px;color:var(--color-text-muted);margin-top:6px;margin-left:26px">📍 今日</div>
    </div>

    <div id="upload-section">
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">🥗</div>
        <div class="upload-title">拍攝或選擇食物圖片</div>
        <div class="upload-sub">支援食物相片 &amp; 營養標籤</div>
        <div class="upload-actions">
          <button class="btn btn-primary" id="btn-camera">📷 拍照</button>
          <button class="btn btn-outline" id="btn-gallery">🖼️ 相冊</button>
        </div>
      </div>
      <input type="file" id="file-camera" accept="image/*" capture="environment" style="display:none">
      <input type="file" id="file-gallery" accept="image/*" style="display:none">
    </div>

    <div id="preview-section" class="hidden">
      <div class="image-preview">
        <img id="preview-img" src="" alt="食物圖片">
        <button class="image-preview-remove" id="btn-remove-img">✕</button>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="btn-analyze" style="flex:1">🔍 開始分析</button>
      </div>
    </div>

    <div id="analyzing-section" class="hidden">
      <div class="card" style="display:flex;align-items:center;gap:14px;padding:18px 16px">
        <div class="spinner" style="width:28px;height:28px;border-width:3px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:15px">AI 分析中…</div>
          <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">可先去其他頁面查看資料</div>
        </div>
      </div>
    </div>

    <div id="result-section" class="hidden">
      <div class="result-card">
        <div class="result-header">
          <div>
            <div class="result-food-name" id="result-name"></div>
            <div class="result-serving" id="result-serving"></div>
          </div>
          <span class="confidence-chip" id="result-confidence"></span>
        </div>
        <div class="result-body">
          <div id="result-risk-badge" class="keto-risk-badge"></div>
          <div class="macro-grid">
            <div class="macro-item"><div class="macro-label">熱量</div><div><span class="macro-value calorie" id="r-calories">0</span><span class="macro-unit"> kcal</span></div></div>
            <div class="macro-item"><div class="macro-label">脂肪</div><div><span class="macro-value fat" id="r-fat">0</span><span class="macro-unit"> g</span></div></div>
            <div class="macro-item"><div class="macro-label">蛋白質</div><div><span class="macro-value protein" id="r-protein">0</span><span class="macro-unit"> g</span></div></div>
            <div class="macro-item"><div class="macro-label">淨碳水</div><div><span class="macro-value carb" id="r-carb">0</span><span class="macro-unit"> g</span></div></div>
          </div>
          <div id="result-notes" class="result-notes hidden"></div>
          <div class="serving-adjuster">
            <label for="serving-multiplier">實際份量</label>
            <input type="number" id="serving-multiplier" class="form-input" value="1" min="0.1" max="10" step="0.1" style="max-width:80px">
            <span>份</span>
          </div>
          <div class="divider"></div>
          <div class="card-title">微調數值（可選）</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">食物名稱</label><input type="text" id="edit-name" class="form-input"></div>
            <div class="form-group"><label class="form-label">熱量 (kcal)<span style="font-size:10px;color:var(--color-text-muted)"> 留空=自動計算</span></label><input type="number" id="edit-calories" class="form-input" min="0" placeholder="留空自動計算"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">脂肪 (g)</label><input type="number" id="edit-fat" class="form-input" min="0" step="0.1"></div>
            <div class="form-group"><label class="form-label">蛋白質 (g)</label><input type="number" id="edit-protein" class="form-input" min="0" step="0.1"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">淨碳水 (g)</label><input type="number" id="edit-carb" class="form-input" min="0" step="0.1"></div>
            <div class="form-group"><label class="form-label">膳食纖維 (g)</label><input type="number" id="edit-fiber" class="form-input" min="0" step="0.1"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn btn-outline" id="btn-reanalyze">重新分析</button>
        <button class="btn btn-primary" id="btn-save-meal">✓ 儲存餐點</button>
      </div>
    </div>

    <div id="manual-section" class="hidden">
      <div class="card">
        <div class="card-title">手動輸入</div>
        <div class="form-group"><label class="form-label">食物名稱</label><input type="text" id="manual-name" class="form-input" placeholder="例：牧油果沙拉"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">熱量 (kcal)<span style="font-size:10px;color:var(--color-text-muted)"> 留空=自動計算</span></label><input type="number" id="manual-calories" class="form-input" min="0" placeholder="留空自動計算"></div>
          <div class="form-group"><label class="form-label">脂肪 (g)</label><input type="number" id="manual-fat" class="form-input" min="0" step="0.1" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">蛋白質 (g)</label><input type="number" id="manual-protein" class="form-input" min="0" step="0.1" placeholder="0"></div>
          <div class="form-group"><label class="form-label">淨碳水 (g)</label><input type="number" id="manual-carb" class="form-input" min="0" step="0.1" placeholder="0"></div>
        </div>
        <p style="font-size:11px;color:var(--color-text-muted);margin-top:4px">💡 熱量留空時系統會從脂肪×9 + 蛋白質×4 + 碳水×4 自動計算</p>
        <button class="btn btn-primary mt-12" id="btn-save-manual">✓ 儲存</button>
      </div>
    </div>

    <button class="btn btn-outline mt-12" id="btn-manual-toggle" style="font-size:13px">✍️ 手動輸入</button>
  </div>`;

  let currentImageBase64 = s.imageBase64 || null;
  let currentMimeType = s.imageMime || 'image/jpeg';
  let analysisData = s.data || null;

  const uploadSection = document.getElementById('upload-section');
  const previewSection = document.getElementById('preview-section');
  const analyzingSection = document.getElementById('analyzing-section');
  const resultSection = document.getElementById('result-section');
  const manualSection = document.getElementById('manual-section');
  const previewImg = document.getElementById('preview-img');
  const fileCam = document.getElementById('file-camera');
  const fileGal = document.getElementById('file-gallery');
  const recordDateInput = document.getElementById('record-date');
  const dateHint = document.getElementById('date-hint');

  if (s.status === 'running') {
    uploadSection.classList.add('hidden');
    analyzingSection.classList.remove('hidden');
    if (currentImageBase64) previewImg.src = `data:${currentMimeType};base64,${currentImageBase64}`;
  } else if (s.status === 'done' && s.data) {
    uploadSection.classList.add('hidden');
    renderResult(s.data);
    resultSection.classList.remove('hidden');
    analysisData = s.data;
  } else if (s.status === 'error') {
    manualSection.classList.remove('hidden');
  }
  if (s.status === 'done') updateNavBadge();

  function updateDateHint() {
    const val = recordDateInput.value;
    if (val === todayStr) {
      dateHint.textContent = '📍 今日';
      dateHint.style.color = 'var(--color-text-muted)';
    } else {
      dateHint.textContent = `↗️ 輸入 ${val} 的記錄`;
      dateHint.style.color = 'var(--color-warning)';
    }
  }
  recordDateInput.addEventListener('change', updateDateHint);
  function getSelectedDate() { return recordDateInput.value || todayStr; }

  document.getElementById('btn-camera').addEventListener('click', () => fileCam.click());
  document.getElementById('btn-gallery').addEventListener('click', () => fileGal.click());
  fileCam.addEventListener('change', e => handleFile(e.target.files[0]));
  fileGal.addEventListener('change', e => handleFile(e.target.files[0]));
  document.getElementById('btn-remove-img').addEventListener('click', resetToUpload);
  document.getElementById('btn-analyze').addEventListener('click', doAnalyze);
  document.getElementById('btn-reanalyze').addEventListener('click', () => {
    resultSection.classList.add('hidden');
    window.__ketoAnalysis.status = 'idle';
    window.__ketoAnalysis.data = null;
    updateNavBadge();
    updateGlobalAnalysisBanner();
    uploadSection.classList.remove('hidden');
  });
  document.getElementById('btn-save-meal').addEventListener('click', saveMeal);
  document.getElementById('btn-save-manual').addEventListener('click', saveManual);
  document.getElementById('btn-manual-toggle').addEventListener('click', () => manualSection.classList.toggle('hidden'));
  document.getElementById('serving-multiplier')?.addEventListener('input', updateServing);

  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => {
    e.preventDefault(); zone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file?.type.startsWith('image/')) handleFile(file);
  });

  async function handleFile(file) {
    if (!file) return;
    currentMimeType = file.type || 'image/jpeg';
    currentImageBase64 = await compressImage(file);
    window.__ketoAnalysis.imageBase64 = currentImageBase64;
    window.__ketoAnalysis.imageMime = currentMimeType;
    previewImg.src = `data:${currentMimeType};base64,${currentImageBase64}`;
    uploadSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    analyzingSection.classList.add('hidden');
    previewSection.classList.remove('hidden');
  }

  function resetToUpload() {
    currentImageBase64 = null; analysisData = null; previewImg.src = '';
    window.__ketoAnalysis.status = 'idle';
    window.__ketoAnalysis.data = null;
    window.__ketoAnalysis.imageBase64 = null;
    updateNavBadge();
    updateGlobalAnalysisBanner();
    uploadSection.classList.remove('hidden');
    previewSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    analyzingSection.classList.add('hidden');
    fileCam.value = ''; fileGal.value = '';
  }

  async function doAnalyze() {
    if (!currentImageBase64) return;
    const apiKey = localStorage.getItem('keto_claude_api_key');
    if (!apiKey) { showToast('請先在設定頁面輸入 Gemini API Key'); return; }
    previewSection.classList.add('hidden');
    analyzingSection.classList.remove('hidden');
    window.__ketoAnalysis.status = 'running';
    window.__ketoAnalysis.data = null;
    window.__ketoAnalysis.errorMsg = '';
    window.__ketoAnalysis._bgAt = null;
    updateNavBadge();
    updateGlobalAnalysisBanner();
    try {
      const result = await analyzeImage(currentImageBase64, currentMimeType);
      clearTimeout(_bgCheckTimer);
      if (window.__ketoAnalysis.status !== 'running') return;
      analysisData = result;
      window.__ketoAnalysis.status = 'done';
      window.__ketoAnalysis.data = result;
      updateNavBadge();
      updateGlobalAnalysisBanner();
      analyzingSection.classList.add('hidden');
      renderResult(result);
      resultSection.classList.remove('hidden');
    } catch (err) {
      clearTimeout(_bgCheckTimer);
      if (window.__ketoAnalysis.status === 'error') return;
      let msg = '分析失敗，請重試';
      if (err.message === 'NO_API_KEY') msg = '請先設定 API Key';
      else if (err.message === 'PARSE_ERROR') msg = 'AI 回傳格式異常，請重試';
      else if (/timeout|time.?out|timedout/i.test(err.message)) msg = '分析逾時，請重試';
      else if (/network|fetch|failed to fetch/i.test(err.message)) msg = '網絡中斷，請重試';
      else if (/AbortError/i.test(err.name)) msg = '後台中斷，請重試';
      window.__ketoAnalysis.status = 'error';
      window.__ketoAnalysis.errorMsg = msg;
      updateNavBadge();
      updateGlobalAnalysisBanner();
      analyzingSection.classList.add('hidden');
      showToast(msg);
      manualSection.classList.remove('hidden');
    }
  }

  function renderResult(data) {
    document.getElementById('result-name').textContent = data.food_name;
    document.getElementById('result-serving').textContent = data.estimated_serving;
    const confMap = { high: '高信心', medium: '中信心', low: '低信心' };
    document.getElementById('result-confidence').textContent = confMap[data.confidence] || data.confidence;
    const riskBadge = document.getElementById('result-risk-badge');
    const riskMap = { low: ['🟢 生酮風險低', 'low'], medium: ['🟡 生酮風險中', 'medium'], high: ['🔴 生酮風險高', 'high'] };
    const [label, cls] = riskMap[data.keto_risk] || ['🟡 未知', 'medium'];
    riskBadge.textContent = label; riskBadge.className = `keto-risk-badge ${cls}`;
    document.getElementById('r-calories').textContent = Math.round(data.calories);
    document.getElementById('r-fat').textContent = data.fat_g.toFixed(1);
    document.getElementById('r-protein').textContent = data.protein_g.toFixed(1);
    document.getElementById('r-carb').textContent = data.carb_g.toFixed(1);
    const notesEl = document.getElementById('result-notes');
    if (data.notes) { notesEl.textContent = `📝 ${data.notes}`; notesEl.classList.remove('hidden'); }
    document.getElementById('edit-name').value = data.food_name;
    document.getElementById('edit-calories').value = Math.round(data.calories);
    document.getElementById('edit-fat').value = data.fat_g.toFixed(1);
    document.getElementById('edit-protein').value = data.protein_g.toFixed(1);
    document.getElementById('edit-carb').value = data.carb_g.toFixed(1);
    document.getElementById('edit-fiber').value = data.fiber_g.toFixed(1);
    document.getElementById('serving-multiplier').value = 1;
  }

  function updateServing() {
    const data = window.__ketoAnalysis.data || analysisData;
    if (!data) return;
    const mult = parseFloat(document.getElementById('serving-multiplier').value) || 1;
    document.getElementById('r-calories').textContent = Math.round(data.calories * mult);
    document.getElementById('r-fat').textContent = (data.fat_g * mult).toFixed(1);
    document.getElementById('r-protein').textContent = (data.protein_g * mult).toFixed(1);
    document.getElementById('r-carb').textContent = (data.carb_g * mult).toFixed(1);
    document.getElementById('edit-calories').value = Math.round(data.calories * mult);
    document.getElementById('edit-fat').value = (data.fat_g * mult).toFixed(1);
    document.getElementById('edit-protein').value = (data.protein_g * mult).toFixed(1);
    document.getElementById('edit-carb').value = (data.carb_g * mult).toFixed(1);
    document.getElementById('edit-fiber').value = (data.fiber_g * mult).toFixed(1);
  }

  // 熱量留空時從三大營養素自動計算
  function resolveCalories(caloriesInput, fat, protein, carb) {
    const v = parseFloat(caloriesInput);
    if (v > 0) return v;
    return Math.round(fat * 9 + protein * 4 + carb * 4);
  }

  async function saveMeal() {
    const dateStr = getSelectedDate();
    const data = window.__ketoAnalysis.data || analysisData;
    const fat = Number(document.getElementById('edit-fat').value) || 0;
    const protein = Number(document.getElementById('edit-protein').value) || 0;
    const carb = Number(document.getElementById('edit-carb').value) || 0;
    const caloriesRaw = document.getElementById('edit-calories').value;
    const meal = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      food_name: document.getElementById('edit-name').value || data?.food_name || '未知食物',
      calories: resolveCalories(caloriesRaw, fat, protein, carb),
      fat_g: fat,
      protein_g: protein,
      carb_g: carb,
      fiber_g: Number(document.getElementById('edit-fiber').value) || 0,
      image_base64: currentImageBase64 ? await makeThumbnail(currentImageBase64, currentMimeType) : null,
      source: 'camera',
      notes: data?.notes || '',
    };
    window.__ketoAnalysis.status = 'idle';
    window.__ketoAnalysis.data = null;
    window.__ketoAnalysis.imageBase64 = null;
    updateNavBadge();
    updateGlobalAnalysisBanner();
    await persistMeal(meal, dateStr);
  }

  async function saveManual() {
    const name = document.getElementById('manual-name').value.trim();
    if (!name) { showToast('請輸入食物名稱'); return; }
    const dateStr = getSelectedDate();
    const fat = Number(document.getElementById('manual-fat').value) || 0;
    const protein = Number(document.getElementById('manual-protein').value) || 0;
    const carb = Number(document.getElementById('manual-carb').value) || 0;
    const caloriesRaw = document.getElementById('manual-calories').value;
    await persistMeal({
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      food_name: name,
      calories: resolveCalories(caloriesRaw, fat, protein, carb),
      fat_g: fat,
      protein_g: protein,
      carb_g: carb,
      fiber_g: 0, image_base64: null, source: 'manual', notes: '',
    }, dateStr);
  }

  async function persistMeal(meal, dateStr) {
    const log = getLocalLog(dateStr);
    log.meals = log.meals || [];
    log.meals.push(meal);
    const totals = calcDayTotals(log.meals);
    const profile = getLocalProfile();
    Object.assign(log, totals, { date: dateStr, keto_status: calcKetoStatus(totals, profile) });
    await saveLogCloud(dateStr, log);
    const isToday = dateStr === todayStr;
    showToast(isToday ? '✓ 餐點已儲存' : `✓ 已輸入 ${dateStr} 的記錄`);
    setTimeout(() => navigate('dashboard'), 800);
  }
}

async function compressImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_DIM || height > MAX_DIM) {
        if (width > height) { height = Math.round(height * MAX_DIM / width); width = MAX_DIM; }
        else { width = Math.round(width * MAX_DIM / height); height = MAX_DIM; }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.85).split(',')[1]);
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

async function makeThumbnail(base64, mime) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const size = 200;
      let { width, height } = img;
      const ratio = Math.min(size / width, size / height);
      width = Math.round(width * ratio); height = Math.round(height * ratio);
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      resolve(canvas.toDataURL('image/jpeg', 0.7).split(',')[1]);
    };
    img.onerror = () => resolve(null);
    img.src = `data:${mime};base64,${base64}`;
  });
}

export function showToast(msg, duration = 2500) {
  let toast = document.querySelector('.save-indicator');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'save-indicator';
    document.getElementById('app').appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}
