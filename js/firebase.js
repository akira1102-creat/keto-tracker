import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, updateDoc, collection, query, where, orderBy, limit, getDocs, deleteDoc } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

let db = null;
let auth = null;
let currentUser = null;

export async function initFirebase() {
  const cfg = getFirebaseConfig();
  if (!cfg) throw new Error('No Firebase config');
  const app = initializeApp(cfg);
  db = getFirestore(app);
  auth = getAuth(app);
  await signInAnon();
}

async function signInAnon() {
  return new Promise((resolve, reject) => {
    onAuthStateChanged(auth, user => {
      if (user) { currentUser = user; resolve(user); }
    });
    signInAnonymously(auth).catch(reject);
  });
}

export function getCurrentUser() { return currentUser; }
export function getDB() { return db; }

export function getFirebaseConfig() {
  try {
    const raw = localStorage.getItem('keto_firebase_config');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function setFirebaseConfig(cfg) {
  localStorage.setItem('keto_firebase_config', JSON.stringify(cfg));
}

export async function getUserProfile() {
  if (!db || !currentUser) return getLocalProfile();
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'data', 'profile'));
    return snap.exists() ? snap.data() : getLocalProfile();
  } catch { return getLocalProfile(); }
}

export async function saveUserProfile(profile) {
  saveLocalProfile(profile);
  if (!db || !currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'data', 'profile'), profile, { merge: true });
  } catch (e) { console.warn('Profile save failed:', e); }
}

export async function getDailyLog(dateStr) {
  const local = getLocalLog(dateStr);
  if (!db || !currentUser) return local;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr));
    if (snap.exists()) return snap.data();
    return local;
  } catch { return local; }
}

export async function saveDailyLog(dateStr, logData) {
  saveLocalLog(dateStr, logData);
  if (!db || !currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr), logData, { merge: true });
  } catch (e) { console.warn('Log save failed:', e); }
}

export async function getHistoryLogs(months = 3) {
  const local = getLocalHistory();
  if (!db || !currentUser) return local;
  try {
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - months);
    const cutoffStr = cutoff.toISOString().split('T')[0];
    const colRef = collection(db, 'users', currentUser.uid, 'daily_logs');
    const q = query(colRef, where('date', '>=', cutoffStr), orderBy('date', 'desc'), limit(100));
    const snap = await getDocs(q);
    return snap.docs.map(d => d.data());
  } catch { return local; }
}

export function getLocalProfile() {
  try {
    const raw = localStorage.getItem('keto_profile');
    return raw ? JSON.parse(raw) : defaultProfile();
  } catch { return defaultProfile(); }
}
function saveLocalProfile(p) {
  localStorage.setItem('keto_profile', JSON.stringify(p));
}
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

export function getLocalLog(dateStr) {
  try {
    const raw = localStorage.getItem(`keto_log_${dateStr}`);
    return raw ? JSON.parse(raw) : emptyLog(dateStr);
  } catch { return emptyLog(dateStr); }
}
function saveLocalLog(dateStr, data) {
  localStorage.setItem(`keto_log_${dateStr}`, JSON.stringify(data));
}
function emptyLog(dateStr) {
  return { date: dateStr, total_calories: 0, total_fat_g: 0, total_protein_g: 0, total_carb_g: 0, keto_status: 'keto', meals: [] };
}

export function getLocalHistory() {
  const logs = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('keto_log_')) {
      try {
        const data = JSON.parse(localStorage.getItem(key));
        if (data.meals?.length > 0) logs.push(data);
      } catch {}
    }
  }
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
  const fatPct = totals.total_calories > 0
    ? (totals.total_fat_g * 9 / totals.total_calories * 100) : 100;
  if (totals.total_carb_g > 50 || fatPct < 60) return 'risk';
  if (totals.total_carb_g > carbLimit || fatPct < 65) return 'edge';
  return 'keto';
}

export function getTodayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Macau' });
}

export async function syncOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem('keto_offline_queue') || '[]');
  if (!queue.length || !db || !currentUser) return;
  for (const item of queue) {
    try {
      await saveDailyLog(item.dateStr, item.logData);
    } catch {}
  }
  localStorage.removeItem('keto_offline_queue');
}

window.addEventListener('online', syncOfflineQueue);