import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, where, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';

const FIREBASE_CONFIG = {
  apiKey: "AIzaSyCoAVgCDo1vh-YI3IWv7nm5nVav7hdqjoc",
  // Use GitHub Pages as authDomain so signInWithRedirect doesn't bounce through firebaseapp.com
  authDomain: "akira1102-creat.github.io",
  projectId: "akira-project-508eb",
  storageBucket: "akira-project-508eb.firebasestorage.app",
  messagingSenderId: "19932489246",
  appId: "1:19932489246:web:46ad2fd86929eb4ba5700f"
};

let db = null;
let auth = null;
let currentUser = undefined;
let _authCallback = null;

export function onAuthChange(fn) {
  _authCallback = fn;
}

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

export async function signInWithGoogle() {
  const provider = new GoogleAuthProvider();
  await signInWithRedirect(auth, provider);
}

export async function signOutUser() {
  await signOut(auth);
}

export function getCurrentUser() { return currentUser; }
export function isSignedIn() { return !!currentUser; }

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
  } catch (e) { console.warn('Profile save failed:', e); }
}

// ===== Daily Logs =====
export async function getDailyLog(dateStr) {
  const local = getLocalLog(dateStr);
  if (!db || !currentUser) return local;
  try {
    const snap = await getDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr));
    return snap.exists() ? snap.data() : local;
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
    const remote = snap.docs.map(d => d.data());
    return remote.length > 0 ? remote : local;
  } catch { return local; }
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
