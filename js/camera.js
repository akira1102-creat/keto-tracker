import { analyzeImage } from './claude.js';
import { getDailyLog, saveDailyLog, calcDayTotals, calcKetoStatus, getTodayStr, getUserProfile } from './firebase.js';
import { navigate } from './router.js';

const MAX_DIM = 1024;

export function renderRecord(container) {
  container.innerHTML = `
  <div class="page">
    <div class="page-header"><span style="font-size:24px">📷</span><h1>記錄飲食</h1></div>
    <div id="upload-section">
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">🥗</div>
        <div class="upload-title">拍攝或選擇食物圖片</div>
        <div class="upload-sub">支援食物相片 &amp; 營養標籤</div>
        <div class="upload-actions">
          <button class="btn btn-primary" id="btn-camera">📷 拍照</button>
          <button class="btn btn-outline" id="btn-gallery">🖼️ 相簿</button>
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
      <button class="btn btn-primary" id="btn-analyze">🔍 開始分析</button>
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
            <span>份（系統自動換算）</span>
          </div>
          <div class="divider"></div>
          <div class="card-title">微調數值（可選）</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">食物名稱</label><input type="text" id="edit-name" class="form-input"></div>
            <div class="form-group"><label class="form-label">熱量 (kcal)</label><input type="number" id="edit-calories" class="form-input" min="0"></div>
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
        <div class="form-group"><label class="form-label">食物名稱</label><input type="text" id="manual-name" class="form-input" placeholder="例：牛油果沙拉"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">熱量 (kcal)</label><input type="number" id="manual-calories" class="form-input" min="0" placeholder="0"></div>
          <div class="form-group"><label class="form-label">脂肪 (g)</label><input type="number" id="manual-fat" class="form-input" min="0" step="0.1" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">蛋白質 (g)</label><input type="number" id="manual-protein" class="form-input" min="0" step="0.1" placeholder="0"></div>
          <div class="form-group"><label class="form-label">淨碳水 (g)</label><input type="number" id="manual-carb" class="form-input" min="0" step="0.1" placeholder="0"></div>
        </div>
        <button class="btn btn-primary mt-12" id="btn-save-manual">✓ 儲存</button>
      </div>
    </div>
    <button class="btn btn-outline mt-12" id="btn-manual-toggle" style="font-size:13px">✍️ 手動輸入</button>
  </div>`;

  let currentImageBase64 = null;
  let currentMimeType = 'image/jpeg';
  let analysisData = null;

  const uploadSection = document.getElementById('upload-section');
  const previewSection = document.getElementById('preview-section');
  const resultSection = document.getElementById('result-section');
  const manualSection = document.getElementById('manual-section');
  const previewImg = document.getElementById('preview-img');
  const fileCam = document.getElementById('file-camera');
  const fileGal = document.getElementById('file-gallery');

  document.getElementById('btn-camera').addEventListener('click', () => fileCam.click());
  document.getElementById('btn-gallery').addEventListener('click', () => fileGal.click());
  fileCam.addEventListener('change', e => handleFile(e.target.files[0]));
  fileGal.addEventListener('change', e => handleFile(e.target.files[0]));
  document.getElementById('btn-remove-img').addEventListener('click', resetToUpload);
  document.getElementById('btn-analyze').addEventListener('click', doAnalyze);
  document.getElementById('btn-reanalyze').addEventListener('click', () => { resultSection.classList.add('hidden'); previewSection.classList.remove('hidden'); });
  document.getElementById('btn-save-meal').addEventListener('click', saveMeal);
  document.getElementById('btn-save-manual').addEventListener('click', saveManual);
  document.getElementById('btn-manual-toggle').addEventListener('click', () => { manualSection.classList.toggle('hidden'); });
  document.getElementById('serving-multiplier').addEventListener('input', updateServing);

  const zone = document.getElementById('upload-zone');
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('drag-over'); const file = e.dataTransfer.files[0]; if (file?.type.startsWith('image/')) handleFile(file); });

  async function handleFile(file) {
    if (!file) return;
    currentMimeType = file.type || 'image/jpeg';
    const compressed = await compressImage(file);
    currentImageBase64 = compressed;
    previewImg.src = `data:${currentMimeType};base64,${compressed}`;
    uploadSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    previewSection.classList.remove('hidden');
  }

  function resetToUpload() {
    currentImageBase64 = null; analysisData = null; previewImg.src = '';
    uploadSection.classList.remove('hidden');
    previewSection.classList.add('hidden');
    resultSection.classList.add('hidden');
    fileCam.value = ''; fileGal.value = '';
  }

  async function doAnalyze() {
    if (!currentImageBase64) return;
    const apiKey = localStorage.getItem('keto_claude_api_key');
    if (!apiKey) { showToast('請先在設定頁面輸入 Anthropic API Key'); return; }
    const overlay = document.createElement('div');
    overlay.className = 'analyzing-overlay';
    overlay.innerHTML = `<div class="spinner"></div><p>AI 分析中，請稍候…</p>`;
    document.getElementById('app').appendChild(overlay);
    try {
      analysisData = await analyzeImage(currentImageBase64, currentMimeType);
      previewSection.classList.add('hidden');
      renderResult(analysisData);
      resultSection.classList.remove('hidden');
    } catch (err) {
      overlay.remove();
      if (err.message === 'NO_API_KEY') showToast('請先在設定頁面輸入 API Key');
      else if (err.message === 'PARSE_ERROR') showToast('分析結果格式異常，請重試或手動輸入');
      else showToast(`分析失敗：${err.message}`);
      manualSection.classList.remove('hidden');
    } finally { overlay.remove(); }
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
    if (!analysisData) return;
    const mult = parseFloat(document.getElementById('serving-multiplier').value) || 1;
    document.getElementById('r-calories').textContent = Math.round(analysisData.calories * mult);
    document.getElementById('r-fat').textContent = (analysisData.fat_g * mult).toFixed(1);
    document.getElementById('r-protein').textContent = (analysisData.protein_g * mult).toFixed(1);
    document.getElementById('r-carb').textContent = (analysisData.carb_g * mult).toFixed(1);
    document.getElementById('edit-calories').value = Math.round(analysisData.calories * mult);
    document.getElementById('edit-fat').value = (analysisData.fat_g * mult).toFixed(1);
    document.getElementById('edit-protein').value = (analysisData.protein_g * mult).toFixed(1);
    document.getElementById('edit-carb').value = (analysisData.carb_g * mult).toFixed(1);
    document.getElementById('edit-fiber').value = (analysisData.fiber_g * mult).toFixed(1);
  }

  async function saveMeal() {
    const meal = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      food_name: document.getElementById('edit-name').value || analysisData?.food_name || '未知食物',
      calories: Number(document.getElementById('edit-calories').value) || 0,
      fat_g: Number(document.getElementById('edit-fat').value) || 0,
      protein_g: Number(document.getElementById('edit-protein').value) || 0,
      carb_g: Number(document.getElementById('edit-carb').value) || 0,
      fiber_g: Number(document.getElementById('edit-fiber').value) || 0,
      image_base64: currentImageBase64 ? await makeThumbnail(currentImageBase64, currentMimeType) : null,
      source: 'camera',
      notes: analysisData?.notes || '',
    };
    await persistMeal(meal);
  }

  async function saveManual() {
    const name = document.getElementById('manual-name').value.trim();
    if (!name) { showToast('請輸入食物名稱'); return; }
    const meal = {
      id: Date.now().toString(),
      timestamp: new Date().toISOString(),
      food_name: name,
      calories: Number(document.getElementById('manual-calories').value) || 0,
      fat_g: Number(document.getElementById('manual-fat').value) || 0,
      protein_g: Number(document.getElementById('manual-protein').value) || 0,
      carb_g: Number(document.getElementById('manual-carb').value) || 0,
      fiber_g: 0, image_base64: null, source: 'manual', notes: '',
    };
    await persistMeal(meal);
  }

  async function persistMeal(meal) {
    const dateStr = getTodayStr();
    const log = await getDailyLog(dateStr);
    log.meals = log.meals || [];
    log.meals.push(meal);
    const totals = calcDayTotals(log.meals);
    const profile = await getUserProfile();
    Object.assign(log, totals, { date: dateStr, keto_status: calcKetoStatus(totals, profile) });
    await saveDailyLog(dateStr, log);
    showToast('✓ 餐點已儲存');
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
  if (!toast) { toast = document.createElement('div'); toast.className = 'save-indicator'; document.getElementById('app').appendChild(toast); }
  toast.textContent = msg;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), duration);
}