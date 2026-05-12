import { renderRecord } from './camera.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { navigate, registerPages } from './router.js';

// 通知 HTML 取消硬性 timer
if (window.__clearSplashTimer) window.__clearSplashTimer();

// ===== PWA Install =====
let deferredInstallPrompt = null;
window.addEventListener('beforeinstallprompt', e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  document.getElementById('install-prompt').classList.remove('hidden');
});
document.getElementById('install-btn')?.addEventListener('click', async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  if (outcome === 'accepted') document.getElementById('install-prompt').classList.add('hidden');
  deferredInstallPrompt = null;
});
document.getElementById('install-dismiss')?.addEventListener('click', () => {
  document.getElementById('install-prompt').classList.add('hidden');
});

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/keto-tracker/sw.js').catch(() => {});
}

// ===== Navigation =====
registerPages({ record: renderRecord, dashboard: renderDashboard, history: renderHistory, settings: renderSettings });
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

// ===== Init：直接本地啟動，唔需要登入 =====
function init() {
  // 隱藏 splash，顯示 App
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');
  navigate('record');

  // 背景嘗試初始化 Firebase（唔影響啟動）
  import('./firebase.js').then(({ initFirebase, onAuthChange }) => {
    onAuthChange(user => {
      window.__ketoUser = user || null;
    });
    initFirebase().catch(() => {});
  }).catch(() => {});
}

init();

window.ketoSignOut = async () => {
  const { signOutUser } = await import('./firebase.js');
  await signOutUser();
  window.__ketoUser = null;
};

window.ketoSignIn = async () => {
  const { signInWithGoogle } = await import('./firebase.js');
  return signInWithGoogle();
};
