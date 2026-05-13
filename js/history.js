import { getLocalHistory, getLocalLog, calcKetoStatus, getLocalProfile } from './store.js';
import { showToast, deleteMeal } from './camera.js';
import { navigate } from './router.js';

export function renderHistory(container) {
  _renderHistoryInner(container);
}

function _renderHistoryInner(container) {
  const logs = getLocalHistory();
  const profile = getLocalProfile();

  if (!logs.length) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header"><span style="font-size:24px">📅</span><h1>歷史記錄</h1></div>
      <div class="empty-state"><div class="empty-icon">🍭</div><p>尚無歷史記錄<br>開始記錄你的第一餐吧！</p></div>
    </div>`;
    return;
  }

  const byMonth = {};
  for (const log of logs) {
    const [y, m] = log.date.split('-');
    const key = `${y}-${m}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(log);
  }

  function getStatusDisplay(log) {
    const status = calcKetoStatus(log, profile);
    if (status === 'risk') return { dot: 'risk', label: '🔴 出酮風險', labelClass: 'status-risk' };
    if (status === 'edge') return { dot: 'edge', label: '🟡 邊緣狀態', labelClass: 'status-edge' };
    return { dot: 'keto', label: '🟢 生酮中', labelClass: 'status-keto' };
  }

  let html = `<div class="page"><div class="page-header"><span style="font-size:24px">📅</span><h1>歷史記錄</h1></div>`;

  for (const [monthKey, monthLogs] of Object.entries(byMonth)) {
    const [y, m] = monthKey.split('-');
    const monthTitle = new Date(`${y}-${m}-01`).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
    html += `<div class="settings-section-title" style="margin-top:16px">${monthTitle}</div><div class="history-list">`;
    for (const log of monthLogs) {
      const dateLabel = new Date(`${log.date}T00:00:00`).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
      const sd = getStatusDisplay(log);
      const carbOver = (log.total_carb_g || 0) > carbLimit;
      html += `
      <div class="history-item" data-date="${log.date}">
        <div class="history-date">${dateLabel}</div>
        <div class="history-status"><span class="status-dot ${sd.dot}"></span><span style="font-size:14px;font-weight:700">${sd.label}</span></div>
        <div class="history-macros">
          <div class="history-macro-item"><strong>${Math.round(log.total_calories)}</strong> kcal</div>
          <div class="history-macro-item">脂 <strong>${(log.total_fat_g || 0).toFixed(1)}g</strong></div>
          <div class="history-macro-item">蛋 <strong>${(log.total_protein_g || 0).toFixed(1)}g</strong></div>
          <div class="history-macro-item">碳 <strong style="color:${carbOver ? 'var(--color-danger)' : 'inherit'}">${(log.total_carb_g || 0).toFixed(1)}g</strong>${carbOver ? ' ⚠️' : ''}</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px">${(log.meals || []).length} 筆餐點</div>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  container.innerHTML = html;

  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => showDayDetail(item.dataset.date, container));
  });
}

function showDayDetail(dateStr, listContainer) {
  const log = getLocalLog(dateStr);
  const profile = getLocalProfile();
  const carbLimit = profile.carb_limit_g || 25;
  const dateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  function buildMealRows() {
    if (!(log.meals || []).length)
      return '<p class="text-muted" style="font-size:13px">當日無記錄</p>';
    return `<div class="meal-list">${(log.meals || []).map(m => `
      <div class="meal-item" data-meal-id="${m.id}">
        ${m.image_base64 ? `<img class="meal-thumb" src="data:image/jpeg;base64,${m.image_base64}" alt="${m.food_name}">` : `<div class="meal-thumb-placeholder">🍽️</div>`}
        <div class="meal-info">
          <div class="meal-name">${m.food_name}</div>
          <div class="meal-macros">脂 ${m.fat_g?.toFixed(1)}g · 蛋 ${m.protein_g?.toFixed(1)}g · 碳 ${m.carb_g?.toFixed(1)}g</div>
          ${m.notes ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${m.notes}</div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
          <div class="meal-kcal">${Math.round(m.calories)}</div>
          <div style="font-size:10px;color:var(--color-text-muted)">kcal</div>
          <button class="hist-meal-delete" data-id="${m.id}" aria-label="刪除"
            style="background:var(--color-danger,#e53e3e);border:none;color:#fff;font-size:12px;font-weight:600;padding:3px 8px;border-radius:6px;cursor:pointer;margin-top:2px">
            🗑 刪除
          </button>
        </div>
      </div>`).join('')}</div>`;
  }

  function renderOverlay() {
    const carb = log.total_carb_g || 0;
    let ketoStatusHtml = '';
    if (carb <= carbLimit) {
      ketoStatusHtml = `<div style="text-align:center;background:#e8f5e9;border-radius:8px;padding:8px;margin-bottom:12px;font-weight:700;color:#1a7a2e">🟢 碳水 ${carb.toFixed(1)}g ≤ ${carbLimit}g — 生酮狀態正常</div>`;
    } else {
      ketoStatusHtml = `<div style="text-align:center;background:#fff3e0;border-radius:8px;padding:8px;margin-bottom:12px;font-weight:700;color:#e65100">⚠️ 碳水 ${carb.toFixed(1)}g 超出上限 ${carbLimit}g</div>`;
    }

    overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${dateLabel}</div>
      ${ketoStatusHtml}
      <div class="card-title">餐點詳情</div>
      <div id="modal-meal-list">${buildMealRows()}</div>
      <div class="divider"></div>
      <div class="form-row" style="margin-bottom:12px">
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700">${Math.round(log.total_calories || 0)}</div>
          <div style="font-size:11px;color:var(--color-text-muted)">kcal</div>
        </div>
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700;color:var(--color-fat)">${(log.total_fat_g || 0).toFixed(1)}g</div>
          <div style="font-size:11px;color:var(--color-text-muted)">脂肪</div>
        </div>
      </div>
      <div class="form-row" style="margin-bottom:16px">
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700;color:var(--color-protein)">${(log.total_protein_g || 0).toFixed(1)}g</div>
          <div style="font-size:11px;color:var(--color-text-muted)">蛋白質</div>
        </div>
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700;color:var(--color-carb)">${(log.total_carb_g || 0).toFixed(1)}g</div>
          <div style="font-size:11px;color:var(--color-text-muted)">淨碳水</div>
        </div>
      </div>
      <button class="btn btn-outline" id="modal-close">關閉</button>
    </div>`;

    overlay.querySelectorAll('.hist-meal-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('確定刪除此餐點？')) return;
        const mealId = btn.dataset.id;
        await deleteMeal(dateStr, mealId);
        const updated = getLocalLog(dateStr);
        log.meals = updated.meals;
        log.total_calories = updated.total_calories;
        log.total_fat_g = updated.total_fat_g;
        log.total_protein_g = updated.total_protein_g;
        log.total_carb_g = updated.total_carb_g;
        showToast('已刪除');
        renderOverlay();
        _renderHistoryInner(listContainer);
      });
    });

    overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  renderOverlay();
  document.getElementById('app').appendChild(overlay);
}
