import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js';
import { getFirestore, doc, getDoc, setDoc, collection, query, orderBy, limit, getDocs } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js';
import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, signOut, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js';
import { getLocalProfile, saveLocalProfile, getLocalLog, saveLocalLog, getLocalHistory, getTodayStr } from './store.js';

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
// Queue of user values received before _authCallback was set
let _pendingAuthUser = undefined;

export function onAuthChange(fn) {
  _authCallback = fn;
  // If auth already fired before the callback was registered, replay it now
  if (_pendingAuthUser !== undefined) {
    fn(_pendingAuthUser);
    _pendingAuthUser = undefined;
  }
}

export async function initFirebase() {
  const app = initializeApp(FIREBASE_CONFIG);
  db = getFirestore(app);
  auth = getAuth(app);

  onAuthStateChanged(auth, user => {
    currentUser = user;
    if (_authCallback) {
      _authCallback(user);
    } else {
      // Store latest value so onAuthChange() can replay it
      _pendingAuthUser = user;
    }
  });

  // Handle redirect result (iOS PWA / standalone)
  try {
    const result = await getRedirectResult(auth);
    if (result?.user) {
      currentUser = result.user;
      if (_authCallback) _authCallback(result.user);
      else _pendingAuthUser = result.user;
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

function queueOfflineLog(dateStr, logData) {
  try {
    const queue = JSON.parse(localStorage.getItem('keto_offline_queue') || '[]');
    const idx = queue.findIndex(item => item.dateStr === dateStr);
    if (idx >= 0) queue[idx] = { dateStr, logData };
    else queue.push({ dateStr, logData });
    localStorage.setItem('keto_offline_queue', JSON.stringify(queue));
  } catch {}
}

// ===== User Profile =====
export async function getUserProfile() {
  // Cloud-first: try to get from cloud and sync to local
  if (db && currentUser) {
    try {
      const snap = await getDoc(doc(db, 'users', currentUser.uid, 'data', 'profile'));
      if (snap.exists()) {
        const profile = snap.data();
        saveLocalProfile(profile);
        return profile;
      }
    } catch { return getLocalProfile(); }
  }
  return getLocalProfile();
}

export async function saveUserProfile(profile) {
  saveLocalProfile(profile);
  if (!db || !currentUser) return;
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'data', 'profile'), profile, { merge: true });
    saveSyncTime();
  } catch (e) {
    console.warn('Profile save failed:', e);
  }
}

// ===== Daily Logs =====
export async function getDailyLog(dateStr) {
  // Cloud-first: try to get from cloud and sync to local
  if (db && currentUser) {
    try {
      const snap = await getDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr));
      if (snap.exists()) {
        const cloudLog = snap.data();
        saveLocalLog(dateStr, cloudLog);
        return cloudLog;
      }
    } catch (e) { console.warn('getDailyLog Firestore error:', e); }
  }
  return getLocalLog(dateStr);
}

export async function saveDailyLog(dateStr, logData) {
  const data = { ...logData, date: dateStr };
  saveLocalLog(dateStr, data);
  if (!db || !currentUser) {
    queueOfflineLog(dateStr, data);
    return;
  }
  try {
    await setDoc(doc(db, 'users', currentUser.uid, 'daily_logs', dateStr), data, { merge: true });
    saveSyncTime();
    window.dispatchEvent(new CustomEvent('keto-synced'));
  } catch (e) {
    console.warn('Log save failed:', e);
    queueOfflineLog(dateStr, data);
  }
}

export async function getHistoryLogs(months = 3) {
  // Cloud-first: always try to sync latest from cloud first
  if (db && currentUser) {
    try {
      const cutoff = new Date();
      cutoff.setMonth(cutoff.getMonth() - months);
      const cutoffStr = cutoff.toISOString().split('T')[0];
      const colRef = collection(db, 'users', currentUser.uid, 'daily_logs');
      const q = query(colRef, orderBy('__name__', 'desc'), limit(200));
      const snap = await getDocs(q);
      const remote = snap.docs
        .filter(d => d.id >= cutoffStr)
        .map(d => ({ date: d.id, ...d.data() }));
      
      // Sync remote logs to local to ensure consistency
      for (const log of remote) {
        saveLocalLog(log.date, log);
      }
      
      if (remote.length > 0) return remote;
    } catch (e) { console.warn('getHistoryLogs error:', e); }
  }
  return getLocalHistory();
}

// Download all cloud logs to local storage (cloud-first strategy)
export async function downloadCloudToLocal() {
  if (!db || !currentUser) return;
  try {
    const colRef = collection(db, 'users', currentUser.uid, 'daily_logs');
    const q = query(colRef, orderBy('__name__', 'desc'), limit(1000));
    const snap = await getDocs(q);
    const cloudLogs = snap.docs.map(d => ({ date: d.id, ...d.data() }));
    
    for (const log of cloudLogs) {
      saveLocalLog(log.date, log);
    }
    
    console.log(`[keto] downloaded ${cloudLogs.length} logs from Firestore to local`);
  } catch (e) {
    console.warn('downloadCloudToLocal error:', e);
  }
}

// Upload all local logs to Firestore (run once after first login)
export async function uploadLocalToFirestore() {
  if (!db || !currentUser) return;
  const logs = getLocalHistory();
  if (!logs.length) return;
  const results = await Promise.allSettled(logs.map(log =>
    setDoc(doc(db, 'users', currentUser.uid, 'daily_logs', log.date), { ...log, date: log.date }, { merge: true })
  ));

  const failed = results.filter(r => r.status === 'rejected');
  if (failed.length === 0) {
    saveSyncTime();
    window.dispatchEvent(new CustomEvent('keto-synced'));
    console.log(`[keto] uploaded ${logs.length} local logs to Firestore`);
  } else {
    console.warn(`[keto] uploadLocalToFirestore failed for ${failed.length} logs`);
  }
}

export async function syncOfflineQueue() {
  try {
    const queue = JSON.parse(localStorage.getItem('keto_offline_queue') || '[]');
    if (!queue.length || !db || !currentUser) return;
    const remaining = [];
    for (const item of queue) {
      try {
        await setDoc(doc(db, 'users', currentUser.uid, 'daily_logs', item.dateStr), item.logData, { merge: true });
      } catch (e) {
        console.warn('syncOfflineQueue failed for', item.dateStr, e);
        remaining.push(item);
      }
    }
    if (remaining.length) {
      localStorage.setItem('keto_offline_queue', JSON.stringify(remaining));
    } else {
      localStorage.removeItem('keto_offline_queue');
      saveSyncTime();
      window.dispatchEvent(new CustomEvent('keto-synced'));
    }
  } catch {}
}
window.addEventListener('online', syncOfflineQueue);
