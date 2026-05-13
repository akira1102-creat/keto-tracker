import { getLocalLog, saveLocalLog, calcDayTotals, calcKetoStatus, getTodayStr, getLocalProfile } from './store.js';
import { showToast, deleteMeal } from './camera.js';
import { navigate } from './router.js';

let macroChart = null;

export function renderDashboard(container) {
  const dateStr = getTodayStr();
  const log = getLocalLog(dateStr);
  const profile = getLocalProfile();

  const totals = calcDayTotals(log.meals || []);
  const status = calcKetoStatus(totals, profile);
  const goal = profile.daily_calorie_goal || 2000;
  const carbLimit = profile.carb_limit_g || 25;
  const fatGoal = goal * (profile.fat_pct_goal || 70) / 100 / 9;
  const proteinGoal = goal * (profile.protein_pct_goal || 25) / 100 / 4;

  const statusConfig = {
    keto: { label: '\uD83D\uDFE2 \u5728\u9162\u4E2D', cls: 'keto', sub: '\u78B3\u6C34\u5728\u76EE\u6A19\u5167\uFF0C\u7E7C\u7E8C\u4FDD\u6301\uFF01' },
    edge: { label: '\uD83D\uDFE1 \u908A\u7DE3\u72C0\u614B', cls: 'edge', sub: '\u63A5\u8FD1\u78B3\u6C34\u4E0A\u9650\uFF0C\u6CE8\u610F\u98F2\u98DF' },
    risk: { label: '\uD83D\uDD34 \u51FA\u9162\u98A8\u96AA', cls: 'risk', sub: '\u78B3\u6C34\u651D\u53D6\u904E\u591A\uFF0C\u8ABF\u6574\u98F2\u98DF' },
  };
  const sc = statusConfig[status] || statusConfig.keto;
  const caloriePct = Math.min(100, Math.round(totals.total_calories / goal * 100));
  const fatPct = totals.total_calories > 0 ? Math.round(totals.total_fat_g * 9 / totals.total_calories * 100) : 0;
  const proteinPct = totals.total_calories > 0 ? Math.round(totals.total_protein_g * 4 / totals.total_calories * 100) : 0;
  const carbPct = totals.total_calories > 0 ? Math.round(totals.total_carb_g * 4 / totals.total_calories * 100) : 0;
  const todayLabel = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Macau', month: 'long', day: 'numeric', weekday: 'short' });

  container.innerHTML = `
  <div class="page">
    <div class="page-header">
      <span style="font-size:24px">\uD83D\uDCCA</span>
      <h1>\u4ECA\u65E5\u6982\u6CC1</h1>
      <span class="text-muted" style="font-size:13px;margin-left:auto">${todayLabel}</span>
    </div>
    <div class="status-badge ${sc.cls}">
      <div><div>${sc.label}</div><div style="font-size:13px;font-weight:400;opacity:0.8;margin-top:2px">${sc.sub}</div></div>
    </div>
    <div class="card">
      <div class="card-title">\u4ECA\u65E5\u71B1\u91CF</div>
      <div class="calorie-row">
        <span class="calorie-current">${Math.round(totals.total_calories)}</span>
        <span class="calorie-goal">/ ${goal} kcal</span>
      </div>
      <div class="progress-bar"><div class="progress-fill progress-calorie" style="width:${caloriePct}%"></div></div>
      <div style="font-size:12px;color:var(--color-text-muted);margin-top:6px;text-align:right">${caloriePct}%</div>
    </div>
    <div class="card">
      <div class="card-title">\u5B8F\u91CF\u5206\u6790</div>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div class="chart-container" style="width:160px;height:160px;flex-shrink:0">
          <canvas id="macro-chart"></canvas>
          ${totals.total_calories === 0 ? '<div style="position:absolute;font-size:13px;color:var(--color-text-muted)">' + '\u5C1A\u7121\u6578\u64DA' + '</div>' : ''}
        </div>
        <div style="flex:1">
          <div class="macro-bars">
            <div class="macro-bar-row">
              <div class="macro-bar-header">
                <div class="macro-bar-label"><span class="macro-dot fat"></span>\u8102\u80AA</div>
                <span>${totals.total_fat_g.toFixed(1)}g / ${Math.round(fatGoal)}g</span>
              </div>
              <div class="progress-bar"><div class="progress-fill progress-fat" style="width:${Math.min(100, totals.total_fat_g / fatGoal * 100)}%"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${fatPct}% \u71B1\u91CF\u4F86\u6E90</div>
            </div>
            <div class="macro-bar-row">
              <div class="macro-bar-header">
                <div class="macro-bar-label"><span class="macro-dot protein"></span>\u86CB\u767D\u8CEA</div>
                <span>${totals.total_protein_g.toFixed(1)}g / ${Math.round(proteinGoal)}g</span>
              </div>
              <div class="progress-bar"><div class="progress-fill progress-protein" style="width:${Math.min(100, totals.total_protein_g / proteinGoal * 100)}%"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${proteinPct}% \u71B1\u91CF\u4F86\u6E90</div>
            </div>
            <div class="macro-bar-row">
              <div class="macro-bar-header">
                <div class="macro-bar-label"><span class="macro-dot carb"></span>\u6DE8\u78B3\u6C34</div>
                <span style="color:${totals.total_carb_g > carbLimit ? 'var(--color-danger)' : 'inherit'}">${totals.total_carb_g.toFixed(1)}g / ${carbLimit}g</span>
              </div>
              <div class="progress-bar"><div class="progress-fill progress-carb" style="width:${Math.min(100, totals.total_carb_g / carbLimit * 100)}%;${totals.total_carb_g > carbLimit ? 'background:var(--color-danger)' : ''}"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${carbPct}% \u71B1\u91CF\u4F86\u6E90</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">
        \u4ECA\u65E5\u9910\u9EDE
        <span style="font-size:12px;color:var(--color-text-muted)">${(log.meals || []).length} \u7B46\u8A18\u9304</span>
      </div>
      ${renderMealList(log.meals || [], dateStr)}
    </div>
  </div>`;

  initChart(totals);

  container.querySelectorAll('.meal-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      if (!confirm('\u78BA\u5B9A\u522A\u9664\u6B64\u9910\u9EDE\uFF1F')) return;
      const { id, date } = btn.dataset;
      await deleteMeal(date, id);
      showToast('\u5DF2\u522A\u9664');
      renderDashboard(container);
    });
  });
}

function renderMealList(meals, dateStr) {
  if (!meals.length) return `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">\uD83C\uDF7D\uFE0F</div><p>\u4ECA\u65E5\u5C1A\u672A\u8A18\u9304\u4EFB\u4F55\u9910\u9EDE<br>\u9EDE\u64CA\u4E0B\u65B9\u300C\u8A18\u9304\u300D\u958B\u59CB</p></div>`;
  return `<div class="meal-list">${meals.map(m => `
    <div class="meal-item" data-id="${m.id}">
      ${m.image_base64 ? `<img class="meal-thumb" src="data:image/jpeg;base64,${m.image_base64}" alt="${m.food_name}">` : `<div class="meal-thumb-placeholder">\uD83C\uDF7D\uFE0F</div>`}
      <div class="meal-info">
        <div class="meal-name">${m.food_name}</div>
        <div class="meal-time">${formatTime(m.timestamp)}</div>
        <div class="meal-macros">\u8102 ${m.fat_g?.toFixed(1)}g \u00B7 \u86CB ${m.protein_g?.toFixed(1)}g \u00B7 \u78B3 ${m.carb_g?.toFixed(1)}g</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="meal-kcal">${Math.round(m.calories)}</span>
        <span style="font-size:10px;color:var(--color-text-muted)">kcal</span>
        <button class="meal-delete-btn" data-id="${m.id}" data-date="${dateStr}" aria-label="\u522A\u9664\u9910\u9EDE" style="background:none;border:none;cursor:pointer;font-size:16px;padding:2px 4px;color:var(--color-text-muted)">\uD83D\uDDD1\uFE0F</button>
      </div>
    </div>`).join('')}</div>`;
}

function initChart(totals) {
  const canvas = document.getElementById('macro-chart');
  if (!canvas) return;
  if (macroChart) { macroChart.destroy(); macroChart = null; }
  const fatCal = totals.total_fat_g * 9;
  const proteinCal = totals.total_protein_g * 4;
  const carbCal = totals.total_carb_g * 4;
  const total = fatCal + proteinCal + carbCal;
  macroChart = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels: ['\u8102\u80AA', '\u86CB\u767D\u8CEA', '\u78B3\u6C34'],
      datasets: [{ data: total > 0 ? [fatCal, proteinCal, carbCal] : [70, 25, 5], backgroundColor: ['#d4a017', '#4caf50', '#2196f3'], borderWidth: 0, hoverOffset: 4 }]
    },
    options: {
      cutout: '65%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${total > 0 ? Math.round(ctx.raw / total * 100) : ctx.raw}%` } } },
      animation: { duration: 600 },
    }
  });
}

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Macau', hour: '2-digit', minute: '2-digit' });
}
