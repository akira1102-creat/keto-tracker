import { getHistoryLogs, getDailyLog } from './firebase.js';

export async function renderHistory(container) {
  container.innerHTML = `<div class="page"><div class="flex-center" style="padding:48px 0"><div class="spinner"></div></div></div>`;

  const logs = await getHistoryLogs(3);

  if (!logs.length) {
    container.innerHTML = `
    <div class="page">
      <div class="page-header"><span style="font-size:24px">📅</span><h1>歷史記錄</h1></div>
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <p>尚無歷史記錄<br>開始記錄你的第一餐吧！</p>
      </div>
    </div>`;
    return;
  }

  // Group by month
  const byMonth = {};
  for (const log of logs) {
    const [y, m] = log.date.split('-');
    const key = `${y}-${m}`;
    if (!byMonth[key]) byMonth[key] = [];
    byMonth[key].push(log);
  }

  const statusLabel = { keto: '在酮中', edge: '邊緣狀態', risk: '出酮風險' };

  let html = `
  <div class="page">
    <div class="page-header"><span style="font-size:24px">📅</span><h1>歷史記錄</h1></div>`;

  for (const [monthKey, monthLogs] of Object.entries(byMonth)) {
    const [y, m] = monthKey.split('-');
    const monthTitle = new Date(`${y}-${m}-01`).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
    html += `
    <div class="settings-section-title" style="margin-top:16px">${monthTitle}</div>
    <div class="history-list">`;
    for (const log of monthLogs) {
      const dateObj = new Date(`${log.date}T00:00:00`);
      const dateLabel = dateObj.toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
      const status = log.keto_status || 'keto';
      const fatPct = log.total_calories > 0 ? Math.round(log.total_fat_g * 9 / log.total_calories * 100) : 0;
      html += `
      <div class="history-item" data-date="${log.date}">
        <div class="history-date">${dateLabel}</div>
        <div class="history-status">
          <span class="status-dot ${status}"></span>
          <span style="font-size:14px;font-weight:700">${statusLabel[status] || status}</span>
        </div>
        <div class="history-macros">
          <div class="history-macro-item"><strong>${Math.round(log.total_calories)}</strong> kcal</div>
          <div class="history-macro-item">脂 <strong>${log.total_fat_g?.toFixed(1) || 0}g</strong></div>
          <div class="history-macro-item">蛋 <strong>${log.total_protein_g?.toFixed(1) || 0}g</strong></div>
          <div class="history-macro-item">碳 <strong>${log.total_carb_g?.toFixed(1) || 0}g</strong> <span style="color:${log.total_carb_g > 25 ? 'var(--color-danger)' : 'inherit'}">${log.total_carb_g > 25 ? '⚠️' : ''}</span></div>
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px">${(log.meals || []).length} 筆餐點</div>
      </div>`;
    }
    html += `</div>`;
  }
  html += `</div>`;
  container.innerHTML = html;

  // Click to expand day detail
  container.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => showDayDetail(item.dataset.date));
  });
}

async function showDayDetail(dateStr) {
  const log = await getDailyLog(dateStr);
  const dateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
  <div class="modal">
    <div class="modal-title">${dateLabel}</div>
    <div class="card-title">餐點詳情</div>
    ${(log.meals || []).length === 0
      ? '<p class="text-muted" style="font-size:13px">當日無記錄</p>'
      : `<div class="meal-list">
        ${(log.meals || []).map(m => `
        <div class="meal-item">
          ${m.image_base64
            ? `<img class="meal-thumb" src="data:image/jpeg;base64,${m.image_base64}" alt="${m.food_name}">`
            : `<div class="meal-thumb-placeholder">🍽️</div>`}
          <div class="meal-info">
            <div class="meal-name">${m.food_name}</div>
            <div class="meal-macros">脂 ${m.fat_g?.toFixed(1)}g · 蛋 ${m.protein_g?.toFixed(1)}g · 碳 ${m.carb_g?.toFixed(1)}g</div>
            ${m.notes ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${m.notes}</div>` : ''}
          </div>
          <div style="text-align:right;flex-shrink:0">
            <div class="meal-kcal">${Math.round(m.calories)}</div>
            <div style="font-size:10px;color:var(--color-text-muted)">kcal</div>
          </div>
        </div>`).join('')}
      </div>`}
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

  document.getElementById('app').appendChild(overlay);
  overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
}
