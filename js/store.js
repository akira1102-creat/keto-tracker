// ===== Pure localStorage store — zero network requests =====

function defaultProfile() {
  return { daily_calorie_goal: 2000, fat_pct_goal: 70, protein_pct_goal: 25, carb_pct_goal: 5, carb_limit_g: 25, height_cm: null, weight_kg: null };
}

export function getLocalProfile() {
  try { return JSON.parse(localStorage.getItem('keto_profile')) || defaultProfile(); }
  catch { return defaultProfile(); }
}

export function saveLocalProfile(p) {
  try { localStorage.setItem('keto_profile', JSON.stringify(p)); } catch {}
}

export function getLocalLog(dateStr) {
  try { return JSON.parse(localStorage.getItem(`keto_log_${dateStr}`)) || emptyLog(dateStr); }
  catch { return emptyLog(dateStr); }
}

export function saveLocalLog(dateStr, data) {
  try { localStorage.setItem(`keto_log_${dateStr}`, JSON.stringify(data)); } catch {}
}

function emptyLog(dateStr) {
  return { date: dateStr, total_calories: 0, total_fat_g: 0, total_protein_g: 0, total_carb_g: 0, keto_status: 'keto', meals: [] };
}

export function getLocalHistory() {
  const logs = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith('keto_log_')) {
        const data = JSON.parse(localStorage.getItem(key));
        if (data) logs.push(data);
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

// Keto status: 只睇碳水是否符合用戶設定值
// 在限額內 = 生酮正常；超出限額 = 邊緣；超出2倍 = 風險
export function calcKetoStatus(totals, profile) {
  const carbLimit = profile.carb_limit_g || 25;
  const carb = totals.total_carb_g || 0;
  if (carb <= carbLimit) return 'keto';          // 符合設定 = 生酮OK
  if (carb <= carbLimit * 1.5) return 'edge';    // 超出但<=1.5倍 = 邊緣
  return 'risk';                                  // 超出1.5倍以上 = 風險
}

export function getTodayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Macau' });
}
