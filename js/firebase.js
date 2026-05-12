import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCoAVgCDo1vh-YI3IWv7nm5nVav7hdqjoc",
  authDomain: "akira-project-508eb.firebaseapp.com",
  projectId: "akira-project-508eb",
  storageBucket: "akira-project-508eb.firebasestorage.app",
  messagingSenderId: "19932489246",
  appId: "1:19932489246:web:46ad2fd86929eb4ba5700f"
};

let db = null;
let auth = null;
let currentUser = undefined;
let _authCallback = null;

export function onAuthChange(fn) { _authCallback = fn; }

export async function initFirebase() {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  auth = getAuth(app);

  onAuthStateChanged(auth, user => {
    currentUser = user;
    if (_authCallback) _authCallback(user);
  });

  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      currentUser = result.user;
      if (_authCallback) _authCallback(result.user);
    }
  } catch (e) {
    console.warn('getRedirectResult error:', e.code, e.message);
  }

  return new Promise(resolve => {
    const unsub = onAuthStateChanged(auth, user => {
      unsub();
      resolve(user);
    });
    setTimeout(() => resolve(null), 8000);
  });
}

function needsRedirect() {
  const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  return isStandalone || isIOS;
}

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  if (needsRedirect()) {
    await signInWithRedirect(auth, provider);
  } else {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  }
}

export async function signOutUser() { await signOut(auth); }
export function getCurrentUser() { return currentUser; }
export function isSignedIn() { return !!currentUser; }

// ===== Sync status =====
function saveSyncTime() {
  try { localStorage.setItem('keto_last_sync', new Date().toISOString()); } catch {}
}
export function getLastSyncTime() {
  try { return localStorage.getItem('keto_last_sync'); } catch { return null; }
}

// ===== User Profile =====
export async function getUserProfile() {
  if (!db || !currentUser) return getLocalProfile();
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'data', 'profile'));
    if (snap.exists()) { saveLocalProfile(snap.data()); return snap.data(); }
    return getLocalProfile();
  } catch { return getLocalProfile(); }
}

export async function saveUserProfile(profile) {
  saveLocalProfile(profile);
  if (!db || !currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'data', 'profile'), profile, { merge: true });
    saveSyncTime();
  } catch (e) { console.warn('Profile save failed:', e); }
}

// ===== Daily Logs =====
export async function getDailyLog(dateStr) {
  // Always try Firestore first when logged in
  if (db && currentUser) {
    try {
      const snap = await getDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr));
      if (snap.exists()) {
        saveLocalLog(dateStr, snap.data()); // update local cache
        return snap.data();
      }
    } catch (e) { console.warn('getDailyLog Firestore error:', e); }
  }
  return getLocalLog(dateStr);
}

export async function saveDailyLog(dateStr, logData) {
  saveLocalLog(dateStr, logData);
  if (!db || !currentUser) {
    // Queue for later sync
    try {
      const q = JSON.parse(localStorage.getItem('keto_offline_queue') || '[]');
      const idx = q.findIndex(i => i.dateStr === dateStr);
      if (idx >= 0) q[idx] = { dateStr, logData }; else q.push({ dateStr, logData });
      localStorage.setItem('keto_offline_queue', JSON.stringify(q));
    } catch {}
    return;
  }
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr), logData, { merge: true });
    saveSyncTime();
    window.dispatchEvent(new CustomEvent('keto-synced'));
  } catch (e) { console.warn('Log save failed:', e); }
}

export async function getHistoryLogs(months = 3) {
  if (db && currentUser) {
    try {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const colRef = collection(db, 'users', currentUser.uid, 'daily_logs');
      const q = query(colRef, where('date', '>=', cutoffStr), orderBy('date', 'desc'), limit(100));
      const snap = await getDocs(q);
      const remote = snap.docs.map(d => d.data());
      if (remote.length > 0) return remote;
    } catch (e) { console.warn('getHistoryLogs error:', e); }
  }
  return getLocalHistory();
}

// Upload all local logs to Firestore (run once after first login)
export async function uploadLocalToFirestore() {
  if (!db || !currentUser) return;
  const logs = getLocalHistory();
  if (!logs.length) return;
  const batch = logs.map(log =>
    setDoc(doc(db, 'users', currentUser.uid, 'daily_logs', log.date), log, { merge: true })
  );
  try {
    await Promise.all(batch);
    saveSyncTime();
    window.dispatchEvent(new CustomEvent('keto-synced'));
    console.log(`[keto] uploaded ${logs.length} local logs to Firestore`);
  } catch (e) { console.warn('uploadLocalToFirestore error:', e); }
}

// ===== Local Storage =====
export function getLocalProfile() {
  try { return JSON.parse(localStorage.getItem('keto_profile')) || defaultProfile(); }
  catch { return defaultProfile(); }
}
function saveLocalProfile(p) {
  try { localStorage.setItem('keto_profile', JSON.stringify(p)); } catch {}
}
function defaultProfile() {
  return { daily_calorie_goal: 2000, fat_pct_goal: 70, protein_pct_goal: 25, carb_pct_goal: 5, carb_limit_g: 25, height_cm: null, weight_kg: null };
}
export function getLocalLog(dateStr) {
  try { return JSON.parse(localStorage.getItem(`keto_log_${dateStr}`)) || emptyLog(dateStr); }
  catch { return emptyLog(dateStr); }
}
function saveLocalLog(dateStr, data) {
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
        if (data?.meals?.length > 0) logs.push(data);
      }
    }
  } catch {}
  return logs.sort((a, b) => b.date.localeCompare(a.date));
}

// ===== Helpers =====
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
  const fatPct = totals.total_calories > 0 ? (totals.total_fat_g * 9 / totals.total_calories * 100) : 100;
  if (totals.total_carb_g > 50 || fatPct < 60) return 'risk';
  if (totals.total_carb_g > (profile.carb_limit_g || 25) || fatPct < 65) return 'edge';
  return 'keto';
}
export function getTodayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Macau' });
}
export async function syncOfflineQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem('keto_offline_queue') || '[]');
    if (!queue.length || !db || !currentUser) return;
    for (const item of queue) await saveDailyLog(item.dateStr, item.logData);
    localStorage.removeItem('keto_offline_queue');
  } catch {}
}
window.addEventListener('online', syncOfflineQueue);
