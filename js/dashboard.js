import { getDailyLog, saveDailyLog, calcDayTotals, calcKetoStatus, getTodayStr, getUserProfile } from './firebase.js';
import { showToast } from './camera.js';
import { navigate } from './router.js';

let macroChart = null;

export async function renderDashboard(container) {
  const dateStr = getTodayStr();
  const [log, profile] = await Promise.all([getDailyLog(dateStr), getUserProfile()]);
  const totals = calcDayTotals(log.meals || []);
  const status = calcKetoStatus(totals, profile);
  const goal = profile.daily_calorie_goal || 2000;
  const carbLimit = profile.carb_limit_g || 25;
  const fatGoal = goal * (profile.fat_pct_goal || 70) / 100 / 9;
  const proteinGoal = goal * (profile.protein_pct_goal || 25) / 100 / 4;
  const carbGoal = carbLimit;
  const statusConfig = {
    keto: { label: '🟢 在酮中', cls: 'keto', sub: '維持生酮狀態，繼續保持！' },
    edge: { label: '🟡 邊緣狀態', cls: 'edge', sub: '接近碳水上限，注意飲食' },
    risk: { label: '🔴 出酮風險', cls: 'risk', sub: '碳水攝取過多，調整飲食' },
  };
  const sc = statusConfig[status] || statusConfig.keto;
  const caloriePct = Math.min(100, Math.round(totals.total_calories / goal * 100));
  const fatPct = totals.total_calories > 0 ? Math.round(totals.total_fat_g * 9 / totals.total_calories * 100) : 0;
  const proteinPct = totals.total_calories > 0 ? Math.round(totals.total_protein_g * 4 / totals.total_calories * 100) : 0;
  const carbPct = totals.total_calories > 0 ? Math.round(totals.total_carb_g * 4 / totals.total_calories * 100) : 0;
  const todayLabel = new Date().toLocaleDateString('zh-TW', { timeZone: 'Asia/Macau', month: 'long', day: 'numeric', weekday: 'short' });

  container.innerHTML = `
  <div class="page">
    <div class="page-header"><span style="font-size:24px">📊</span><h1>今日概況</h1><span class="text-muted" style="font-size:13px;margin-left:auto">${todayLabel}</span></div>
    <div class="status-badge ${sc.cls}"><div><div>${sc.label}</div><div style="font-size:13px;font-weight:400;opacity:0.8;margin-top:2px">${sc.sub}</div></div></div>
    <div class="card">
      <div class="card-title">今日熱量</div>
      <div class="calorie-row"><span class="calorie-current">${Math.round(totals.total_calories)}</span><span class="calorie-goal">/ ${goal} kcal</span></div>
      <div class="progress-bar"><div class="progress-fill progress-calorie" style="width:${caloriePct}%"></div></div>
      <div style="font-size:12px;color:var(--color-text-muted);margin-top:6px;text-align:right">${caloriePct}%</div>
    </div>
    <div class="card">
      <div class="card-title">宏量分析</div>
      <div style="display:flex;gap:16px;align-items:flex-start">
        <div class="chart-container" style="width:160px;height:160px;flex-shrink:0">
          <canvas id="macro-chart"></canvas>
          ${totals.total_calories === 0 ? '<div style="position:absolute;font-size:13px;color:var(--color-text-muted)">尚無數據</div>' : ''}
        </div>
        <div style="flex:1">
          <div class="macro-bars">
            <div class="macro-bar-row">
              <div class="macro-bar-header"><div class="macro-bar-label"><span class="macro-dot fat"></span>脂肪</div><span>${totals.total_fat_g.toFixed(1)}g / ${Math.round(fatGoal)}g</span></div>
              <div class="progress-bar"><div class="progress-fill progress-fat" style="width:${Math.min(100, totals.total_fat_g / fatGoal * 100)}%"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${fatPct}% 熱量來源</div>
            </div>
            <div class="macro-bar-row">
              <div class="macro-bar-header"><div class="macro-bar-label"><span class="macro-dot protein"></span>蛋白質</div><span>${totals.total_protein_g.toFixed(1)}g / ${Math.round(proteinGoal)}g</span></div>
              <div class="progress-bar"><div class="progress-fill progress-protein" style="width:${Math.min(100, totals.total_protein_g / proteinGoal * 100)}%"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${proteinPct}% 熱量來源</div>
            </div>
            <div class="macro-bar-row">
              <div class="macro-bar-header"><div class="macro-bar-label"><span class="macro-dot carb"></span>淨碳水</div><span style="color:${totals.total_carb_g > carbLimit ? 'var(--color-danger)' : 'inherit'}">${totals.total_carb_g.toFixed(1)}g / ${carbGoal}g</span></div>
              <div class="progress-bar"><div class="progress-fill progress-carb" style="width:${Math.min(100, totals.total_carb_g / carbGoal * 100)}%;${totals.total_carb_g > carbLimit ? 'background:var(--color-danger)' : ''}"></div></div>
              <div style="font-size:11px;color:var(--color-text-muted);margin-top:3px">${carbPct}% 熱量來源</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="card">
      <div class="card-title" style="display:flex;justify-content:space-between;align-items:center">今日餐點<span style="font-size:12px;color:var(--color-text-muted)">${(log.meals || []).length} 筆記錄</span></div>
      ${renderMealList(log.meals || [], dateStr)}
    </div>
  </div>`;

  initChart(totals);
}

function renderMealList(meals, dateStr) {
  if (!meals.length) return `<div class="empty-state" style="padding:24px 0"><div class="empty-icon">🍽️</div><p>今日尚未記錄任何餐點<br>點擊下方「記錄」開始</p></div>`;
  return `<div class="meal-list">${meals.map(m => `
    <div class="meal-item" data-id="${m.id}">
      ${m.image_base64 ? `<img class="meal-thumb" src="data:image/jpeg;base64,${m.image_base64}" alt="${m.food_name}">` : `<div class="meal-thumb-placeholder">🍽️</div>`}
      <div class="meal-info">
        <div class="meal-name">${m.food_name}</div>
        <div class="meal-time">${formatTime(m.timestamp)}</div>
        <div class="meal-macros">脂 ${m.fat_g?.toFixed(1)}g · 蛋 ${m.protein_g?.toFixed(1)}g · 碳 ${m.carb_g?.toFixed(1)}g</div>
      </div>
      <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
        <span class="meal-kcal">${Math.round(m.calories)}</span>
        <span style="font-size:10px;color:var(--color-text-muted)">kcal</span>
        <button class="meal-delete-btn" data-id="${m.id}" data-date="${dateStr}">🗑️</button>
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
      labels: ['脂肪', '蛋白質', '碳水'],
      datasets: [{ data: total > 0 ? [fatCal, proteinCal, carbCal] : [70, 25, 5], backgroundColor: ['#d4a017', '#4caf50', '#2196f3'], borderWidth: 0, hoverOffset: 4 }]
    },
    options: { cutout: '65%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${total > 0 ? Math.round(ctx.raw / total * 100) : ctx.raw}%` } } }, animation: { duration: 600 } }
  });
}

document.addEventListener('click', async e => {
  const btn = e.target.closest('.meal-delete-btn');
  if (!btn) return;
  const { id, date } = btn.dataset;
  if (!confirm('確定刪除此餐點？')) return;
  const log = await getDailyLog(date);
  log.meals = (log.meals || []).filter(m => m.id !== id);
  const totals = calcDayTotals(log.meals);
  const profile = await getUserProfile();
  Object.assign(log, totals, { date, keto_status: calcKetoStatus(totals, profile) });
  await saveDailyLog(date, log);
  navigate('dashboard');
});

function formatTime(ts) {
  if (!ts) return '';
  return new Date(ts).toLocaleTimeString('zh-TW', { timeZone: 'Asia/Macau', hour: '2-digit', minute: '2-digit' });
}