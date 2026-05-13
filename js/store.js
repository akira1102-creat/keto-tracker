// ===== Pure localStorage store — zero network requests =====

function defaultProfile() {
  return {
    daily_calorie_goal: 2000,
    fat_pct_goal: 70,
    protein_pct_goal: 25,
    carb_pct_goal: 5,
    carb_limit_g: 25,
    height_cm: null,
    weight_kg: null,
  };
}

export function getLocalProfile() {
  try { return JSON.parse(localStorage.getItem('keto_profile')) || defaultProfile(); }
  catch { return defaultProfile(); }
}

export function saveLocalProfile(profile) {
  try { localStorage.setItem('keto_profile', JSON.stringify(profile)); } catch {}
}

export function getLocalLog(dateStr) {
  try { return JSON.parse(localStorage.getItem(`keto_log_${dateStr}`)) || emptyLog(dateStr); }
  catch { return emptyLog(dateStr); }
}

export function saveLocalLog(dateStr, data) {
  try { localStorage.setItem(`keto_log_${dateStr}`, JSON.stringify(data)); } catch {}
}

function emptyLog(dateStr) {
  return {
    date: dateStr,
    total_calories: 0,
    total_fat_g: 0,
    total_protein_g: 0,
    total_carb_g: 0,
    keto_status: 'keto',
    meals: [],
  };
}

export function getLocalHistory() {
  const logs = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('keto_log_')) {
        const data = JSON.parse(localStorage.getItem(key));
        if (data?.meals?.length > 0) logs.push(data);
      }
    }
  } catch {}
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

export function calcDayTotals(meals) {
  return meals.reduce((acc, m) => {
    acc.total_calories += m.calories || 0;
    acc.total_fat_g += m.fat_g || 0;
    acc.total_protein_g += m.protein_g || 0;
    acc.total_carb_g += m.carb_g || 0;
    return acc;
  }, { total_calories: 0, total_fat_g: 0, total_protein_g: 0, total_carb_g: 0 });
}

export function calcKetoStatus(totals, profile) {
  const carbLimit = profile.carb_limit_g || 25;
  const carb = totals.total_carb_g || 0;
  const fatPct = totals.total_calories > 0
    ? totals.total_fat_g * 9 / totals.total_calories * 100
    : 100;

  if (carb > 50 || fatPct < 60) return 'risk';
  if (carb > carbLimit || fatPct < 65) return 'edge';
  return 'keto';
}

export function removeMealFromLog(dateStr, mealId) {
  const log = getLocalLog(dateStr);
  log.meals = (log.meals || []).filter(m => m.id !== mealId);
  const totals = calcDayTotals(log.meals);
  Object.assign(log, totals, { date: dateStr, keto_status: calcKetoStatus(totals, getLocalProfile()) });
  saveLocalLog(dateStr, log);
  return log;
}

export function getTodayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Macau' });
}
