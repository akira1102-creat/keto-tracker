import { getLocalHistory, getLocalLog, saveLocalLog, calcDayTotals, calcKetoStatus, getLocalProfile } from './store.js';
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
      <div class="page-header"><span style="font-size:24px">\uD83D\uDCC5</span><h1>\u6B77\u53F2\u8A18\u9304</h1></div>
      <div class="empty-state"><div class="empty-icon">\uD83D\uDCED</div><p>\u5C1A\u7121\u6B77\u53F2\u8A18\u9304<br>\u958B\u59CB\u8A18\u9304\u4F60\u7684\u7B2C\u4E00\u9910\u5427\uFF01</p></div>
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

  const carbLimit = profile.carb_limit_g || 25;
  const statusLabel = { keto: '\u5728\u9162\u4E2D', edge: '\u908A\u7DE3\u72C0\u614B', risk: '\u51FA\u9162\u98A8\u96AA' };
  let html = `<div class="page"><div class="page-header"><span style="font-size:24px">\uD83D\uDCC5</span><h1>\u6B77\u53F2\u8A18\u9304</h1></div>`;

  for (const [monthKey, monthLogs] of Object.entries(byMonth)) {
    const [y, m] = monthKey.split('-');
    const monthTitle = new Date(`${y}-${m}-01`).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long' });
    html += `<div class="settings-section-title" style="margin-top:16px">${monthTitle}</div><div class="history-list">`;
    for (const log of monthLogs) {
      const dateLabel = new Date(`${log.date}T00:00:00`).toLocaleDateString('zh-TW', { month: 'long', day: 'numeric', weekday: 'short' });
      const status = log.keto_status || 'keto';
      html += `
      <div class="history-item" data-date="${log.date}">
        <div class="history-date">${dateLabel}</div>
        <div class="history-status"><span class="status-dot ${status}"></span><span style="font-size:14px;font-weight:700">${statusLabel[status] || status}</span></div>
        <div class="history-macros">
          <div class="history-macro-item"><strong>${Math.round(log.total_calories)}</strong> kcal</div>
          <div class="history-macro-item">\u8102 <strong>${(log.total_fat_g || 0).toFixed(1)}g</strong></div>
          <div class="history-macro-item">\u86CB <strong>${(log.total_protein_g || 0).toFixed(1)}g</strong></div>
          <div class="history-macro-item">\u78B3 <strong style="color:${(log.total_carb_g||0) > carbLimit ? 'var(--color-danger)' : 'inherit'}">${(log.total_carb_g || 0).toFixed(1)}g</strong>${(log.total_carb_g||0) > carbLimit ? ' \u26A0\uFE0F' : ''}</div>
        </div>
        <div style="font-size:11px;color:var(--color-text-muted);margin-top:6px">${(log.meals || []).length} \u7B46\u9910\u9EDE</div>
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
  const dateLabel = new Date(`${dateStr}T00:00:00`).toLocaleDateString('zh-TW', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';

  function buildMealRows() {
    return !(log.meals || []).length
      ? '<p class="text-muted" style="font-size:13px">\u7576\u65E5\u7121\u8A18\u9304</p>'
      : `<div class="meal-list">${(log.meals || []).map(m => `
        <div class="meal-item" data-meal-id="${m.id}">
          ${m.image_base64 ? `<img class="meal-thumb" src="data:image/jpeg;base64,${m.image_base64}" alt="${m.food_name}">` : `<div class="meal-thumb-placeholder">\uD83C\uDF7D\uFE0F</div>`}
          <div class="meal-info">
            <div class="meal-name">${m.food_name}</div>
            <div class="meal-macros">\u8102 ${m.fat_g?.toFixed(1)}g \u00B7 \u86CB ${m.protein_g?.toFixed(1)}g \u00B7 \u78B3 ${m.carb_g?.toFixed(1)}g</div>
            ${m.notes ? `<div style="font-size:11px;color:var(--color-text-muted);margin-top:2px">${m.notes}</div>` : ''}
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0">
            <div class="meal-kcal">${Math.round(m.calories)}</div>
            <div style="font-size:10px;color:var(--color-text-muted)">kcal</div>
            <button class="hist-meal-delete" data-id="${m.id}" aria-label="\u522A\u9664" style="background:none;border:none;cursor:pointer;font-size:15px;color:var(--color-text-muted)">\uD83D\uDDD1\uFE0F</button>
          </div>
        </div>`).join('')}</div>`;
  }

  function renderOverlay() {
    overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${dateLabel}</div>
      <div class="card-title">\u9910\u9EDE\u8A73\u60C5</div>
      <div id="modal-meal-list">${buildMealRows()}</div>
      <div class="divider"></div>
      <div class="form-row" style="margin-bottom:12px">
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700">${Math.round(log.total_calories || 0)}</div>
          <div style="font-size:11px;color:var(--color-text-muted)">kcal</div>
        </div>
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700;color:var(--color-fat)">${(log.total_fat_g || 0).toFixed(1)}g</div>
          <div style="font-size:11px;color:var(--color-text-muted)">\u8102\u80AA</div>
        </div>
      </div>
      <div class="form-row" style="margin-bottom:16px">
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700;color:var(--color-protein)">${(log.total_protein_g || 0).toFixed(1)}g</div>
          <div style="font-size:11px;color:var(--color-text-muted)">\u86CB\u767D\u8CEA</div>
        </div>
        <div style="text-align:center;background:var(--color-surface2);border-radius:8px;padding:10px">
          <div style="font-size:22px;font-weight:700;color:var(--color-carb)">${(log.total_carb_g || 0).toFixed(1)}g</div>
          <div style="font-size:11px;color:var(--color-text-muted)">\u6DE8\u78B3\u6C34</div>
        </div>
      </div>
      <button class="btn btn-outline" id="modal-close">\u95DC\u9589</button>
    </div>`;

    overlay.querySelectorAll('.hist-meal-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        if (!confirm('\u78BA\u5B9A\u522A\u9664\u6B64\u9910\u9EDE\uFF1F')) return;
        const mealId = btn.dataset.id;
        await deleteMeal(dateStr, mealId);
        // reload log data
        const updated = getLocalLog(dateStr);
        log.meals = updated.meals;
        log.total_calories = updated.total_calories;
        log.total_fat_g = updated.total_fat_g;
        log.total_protein_g = updated.total_protein_g;
        log.total_carb_g = updated.total_carb_g;
        showToast('\u5DF2\u522A\u9664');
        renderOverlay(); // re-render modal
        _renderHistoryInner(listContainer); // refresh list behind
      });
    });

    overlay.querySelector('#modal-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  }

  renderOverlay();
  document.getElementById('app').appendChild(overlay);
}
