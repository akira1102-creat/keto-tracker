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

// Persistent top banner shown on every page while analysis is running or just done
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
      'padding:10px 16px',
      'font-size:13px', 'font-weight:600',
      'box-shadow:0 2px 8px rgba(0,0,0,0.15)',
      'transition:background 0.3s',
    ].join(';');
    document.body.appendChild(banner);
  }
  if (s.status === 'running') {
    banner.style.background = 'var(--color-primary, #01696f)';
    banner.style.color = '#fff';
    banner.innerHTML = '<div class="spinner" style="width:16px;height:16px;border-width:2px;border-color:rgba(255,255,255,0.3);border-top-color:#fff;flex-shrink:0"></div><span>AI 分析中⋯可先去其他頁面</span>';
  } else if (s.status === 'done') {
    banner.style.background = 'var(--color-success, #437a22)';
    banner.style.color = '#fff';
    banner.innerHTML = '<span style="font-size:18px">\u2713</span><span>分析完成！<a href="#" id="banner-go-record" style="color:#fff;text-decoration:underline;margin-left:6px">前往儲存</a></span><button id="banner-dismiss" style="margin-left:auto;background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1">\u00d7</button>';
    document.getElementById('banner-go-record')?.addEventListener('click', e => {
      e.preventDefault();
      banner.remove();
      navigate('record');
    });
    document.getElementById('banner-dismiss')?.addEventListener('click', () => {
      window.__ketoAnalysis.status = 'idle';
      updateNavBadge();
      banner.remove();
    });
  }
}

// Expose so app.js / router can re-check on page change
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
          window.__ketoAnalysis.errorMsg = '\u5f8c\u53f0\u4e2d\u65b7\uff0c\u8acb\u91cd\u8a66';
          updateNavBadge();
          updateGlobalAnalysisBanner();
          const analyzingSection = document.getElementById('analyzing-section');
          const manualSection = document.getElementById('manual-section');
          if (analyzingSection) analyzingSection.classList.add('hidden');
          if (manualSection) manualSection.classList.remove('hidden');
          showToast('\u5f8c\u53f0\u4e2d\u65b7\uff0c\u8acb\u91cd\u8a66');
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

// Delete a meal from a given date and sync
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
      <span style="font-size:24px">\uD83D\uDCF7</span>
      <h1>\u8A18\u9304\u98F2\u98DF</h1>
    </div>

    <div class="card" style="margin-bottom:12px;padding:12px 14px">
      <div style="display:flex;align-items:center;gap:10px">
        <span style="font-size:16px">\uD83D\uDCC5</span>
        <label class="form-label" for="record-date" style="margin:0;font-weight:600">\u8A18\u9304\u65E5\u671F</label>
        <input type="date" id="record-date" class="form-input" value="${todayStr}" max="${todayStr}" style="flex:1;min-width:0">
      </div>
      <div id="date-hint" style="font-size:12px;color:var(--color-text-muted);margin-top:6px;margin-left:26px">\uD83D\uDCCD \u4ECA\u65E5</div>
    </div>

    <div id="upload-section">
      <div class="upload-zone" id="upload-zone">
        <div class="upload-icon">\uD83E\uDD57</div>
        <div class="upload-title">\u62CD\u651D\u6216\u9078\u64C7\u98DF\u7269\u5716\u7247</div>
        <div class="upload-sub">\u652F\u63F4\u98DF\u7269\u76F8\u7247 &amp; \u71DF\u990A\u6A19\u7C64</div>
        <div class="upload-actions">
          <button class="btn btn-primary" id="btn-camera">\uD83D\uDCF7 \u62CD\u7167</button>
          <button class="btn btn-outline" id="btn-gallery">\uD83D\uDDBC\uFE0F \u76F8\u7C3F</button>
        </div>
      </div>
      <input type="file" id="file-camera" accept="image/*" capture="environment" style="display:none">
      <input type="file" id="file-gallery" accept="image/*" style="display:none">
    </div>

    <div id="preview-section" class="hidden">
      <div class="image-preview">
        <img id="preview-img" src="" alt="\u98DF\u7269\u5716\u7247">
        <button class="image-preview-remove" id="btn-remove-img">\u2715</button>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn btn-primary" id="btn-analyze" style="flex:1">\uD83D\uDD0D \u958B\u59CB\u5206\u6790</button>
      </div>
    </div>

    <div id="analyzing-section" class="hidden">
      <div class="card" style="display:flex;align-items:center;gap:14px;padding:18px 16px">
        <div class="spinner" style="width:28px;height:28px;border-width:3px;flex-shrink:0"></div>
        <div style="flex:1">
          <div style="font-weight:700;font-size:15px">AI \u5206\u6790\u4E2D\u2026</div>
          <div style="font-size:12px;color:var(--color-text-muted);margin-top:2px">\u53EF\u5148\u53BB\u5176\u4ED6\u9801\u9762\u67E5\u770B\u8CC7\u6599</div>
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
            <div class="macro-item"><div class="macro-label">\u71B1\u91CF</div><div><span class="macro-value calorie" id="r-calories">0</span><span class="macro-unit"> kcal</span></div></div>
            <div class="macro-item"><div class="macro-label">\u8102\u80AA</div><div><span class="macro-value fat" id="r-fat">0</span><span class="macro-unit"> g</span></div></div>
            <div class="macro-item"><div class="macro-label">\u86CB\u767D\u8CEA</div><div><span class="macro-value protein" id="r-protein">0</span><span class="macro-unit"> g</span></div></div>
            <div class="macro-item"><div class="macro-label">\u6DE8\u78B3\u6C34</div><div><span class="macro-value carb" id="r-carb">0</span><span class="macro-unit"> g</span></div></div>
          </div>
          <div id="result-notes" class="result-notes hidden"></div>
          <div class="serving-adjuster">
            <label for="serving-multiplier">\u5BE6\u969B\u4EFD\u91CF</label>
            <input type="number" id="serving-multiplier" class="form-input" value="1" min="0.1" max="10" step="0.1" style="max-width:80px">
            <span>\u4EFD</span>
          </div>
          <div class="divider"></div>
          <div class="card-title">\u5FAE\u8ABF\u6578\u5024\uFF08\u53EF\u9078\uFF09</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">\u98DF\u7269\u540D\u7A31</label><input type="text" id="edit-name" class="form-input"></div>
            <div class="form-group"><label class="form-label">\u71B1\u91CF (kcal)<span style="font-size:10px;color:var(--color-text-muted)"> \u7A7A\u767D=\u81EA\u52D5\u8A08\u7B97</span></label><input type="number" id="edit-calories" class="form-input" min="0" placeholder="\u7559\u7A7A\u81EA\u52D5\u8A08\u7B97"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">\u8102\u80AA (g)</label><input type="number" id="edit-fat" class="form-input" min="0" step="0.1"></div>
            <div class="form-group"><label class="form-label">\u86CB\u767D\u8CEA (g)</label><input type="number" id="edit-protein" class="form-input" min="0" step="0.1"></div>
          </div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">\u6DE8\u78B3\u6C34 (g)</label><input type="number" id="edit-carb" class="form-input" min="0" step="0.1"></div>
            <div class="form-group"><label class="form-label">\u81B3\u98DF\u7E96\u7DAD (g)</label><input type="number" id="edit-fiber" class="form-input" min="0" step="0.1"></div>
          </div>
        </div>
      </div>
      <div style="display:flex;gap:10px;margin-top:12px">
        <button class="btn btn-outline" id="btn-reanalyze">\u91CD\u65B0\u5206\u6790</button>
        <button class="btn btn-primary" id="btn-save-meal">\u2713 \u5132\u5B58\u9910\u9EDE</button>
      </div>
    </div>

    <div id="manual-section" class="hidden">
      <div class="card">
        <div class="card-title">\u624B\u52D5\u8F38\u5165</div>
        <div class="form-group"><label class="form-label">\u98DF\u7269\u540D\u7A31</label><input type="text" id="manual-name" class="form-input" placeholder="\u4F8B\uFF1A\u7267\u6CB9\u679C\u6C99\u62C9"></div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">\u71B1\u91CF (kcal)<span style="font-size:10px;color:var(--color-text-muted)"> \u7A7A\u767D=\u81EA\u52D5\u8A08\u7B97</span></label><input type="number" id="manual-calories" class="form-input" min="0" placeholder="\u7559\u7A7A\u81EA\u52D5\u8A08\u7B97"></div>
          <div class="form-group"><label class="form-label">\u8102\u80AA (g)</label><input type="number" id="manual-fat" class="form-input" min="0" step="0.1" placeholder="0"></div>
        </div>
        <div class="form-row">
          <div class="form-group"><label class="form-label">\u86CB\u767D\u8CEA (g)</label><input type="number" id="manual-protein" class="form-input" min="0" step="0.1" placeholder="0"></div>
          <div class="form-group"><label class="form-label">\u6DE8\u78B3\u6C34 (g)</label><input type="number" id="manual-carb" class="form-input" min="0" step="0.1" placeholder="0"></div>
        </div>
        <button class="btn btn-primary mt-12" id="btn-save-manual">\u2713 \u5132\u5B58</button>
      </div>
    </div>

    <button class="btn btn-outline mt-12" id="btn-manual-toggle" style="font-size:13px">\u270D\uFE0F \u624B\u52D5\u8F38\u5165</button>
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
      dateHint.textContent = '\uD83D\uDCCD \u4ECA\u65E5';
      dateHint.style.color = 'var(--color-text-muted)';
    } else {
      dateHint.textContent = `\u2197\uFE0F \u8F38\u5165 ${val} \u7684\u8A18\u9304`;
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
    if (!apiKey) { showToast('\u8ACB\u5148\u5728\u8A2D\u5B9A\u9801\u9762\u8F38\u5165 Gemini API Key'); return; }
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
      let msg = '\u5206\u6790\u5931\u6557\uFF0C\u8ACB\u91CD\u8A66';
      if (err.message === 'NO_API_KEY') msg = '\u8ACB\u5148\u8A2D\u5B9A API Key';
      else if (err.message === 'PARSE_ERROR') msg = 'AI \u56DE\u50B3\u683C\u5F0F\u7570\u5E38\uFF0C\u8ACB\u91CD\u8A66';
      else if (/timeout|time.?out|timedout/i.test(err.message)) msg = '\u5206\u6790\u903E\u6642\uFF0C\u8ACB\u91CD\u8A66';
      else if (/network|fetch|failed to fetch/i.test(err.message)) msg = '\u7DB2\u7D61\u4E2D\u65B7\uFF0C\u8ACB\u91CD\u8A66';
      else if (/AbortError/i.test(err.name)) msg = '\u5F8C\u53F0\u4E2D\u65B7\uFF0C\u8ACB\u91CD\u8A66';
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
    const confMap = { high: '\u9AD8\u4FE1\u5FC3', medium: '\u4E2D\u4FE1\u5FC3', low: '\u4F4E\u4FE1\u5FC3' };
    document.getElementById('result-confidence').textContent = confMap[data.confidence] || data.confidence;
    const riskBadge = document.getElementById('result-risk-badge');
    const riskMap = { low: ['\uD83D\uDFE2 \u751F\u9162\u98A8\u96AA\u4F4E', 'low'], medium: ['\uD83D\uDFE1 \u751F\u9162\u98A8\u96AA\u4E2D', 'medium'], high: ['\uD83D\uDD34 \u751F\u9162\u98A8\u96AA\u9AD8', 'high'] };
    const [label, cls] = riskMap[data.keto_risk] || ['\uD83D\uDFE1 \u672A\u77E5', 'medium'];
    riskBadge.textContent = label; riskBadge.className = `keto-risk-badge ${cls}`;
    document.getElementById('r-calories').textContent = Math.round(data.calories);
    document.getElementById('r-fat').textContent = data.fat_g.toFixed(1);
    document.getElementById('r-protein').textContent = data.protein_g.toFixed(1);
    document.getElementById('r-carb').textContent = data.carb_g.toFixed(1);
    const notesEl = document.getElementById('result-notes');
    if (data.notes) { notesEl.textContent = `\uD83D\uDCDD ${data.notes}`; notesEl.classList.remove('hidden'); }
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

  // Auto-calc calories from macros if left blank
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
      food_name: document.getElementById('edit-name').value || data?.food_name || '\u672A\u77E5\u98DF\u7269',
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
    if (!name) { showToast('\u8ACB\u8F38\u5165\u98DF\u7269\u540D\u7A31'); return; }
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
    showToast(isToday ? '\u2713 \u9910\u9EDE\u5DF2\u5132\u5B58' : `\u2713 \u5DF2\u8F38\u5165 ${dateStr} \u7684\u8A18\u9304`);
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
