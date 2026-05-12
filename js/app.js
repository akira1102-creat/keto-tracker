import { renderRecord } from './camera.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { navigate, registerPages } from './router.js';

// 取消 HTML 硬性 fallback timer
if (window.__clearSplashTimer) window.__clearSplashTimer();

// ===== 即刻顯示 App（本地模式） =====
document.getElementById('splash-screen').classList.add('hidden');
document.getElementById('main-content').classList.remove('hidden');
document.getElementById('bottom-nav').classList.remove('hidden');

// ===== Navigation =====
registerPages({ record: renderRecord, dashboard: renderDashboard, history: renderHistory, settings: renderSettings });
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});
navigate('record');

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

// ===== Firebase（背景載入，唔影響主流程） =====
window.__ketoUser = null;
window.ketoSignIn = async () => {
  const { signInWithGoogle } = await import('./firebase.js');
  return signInWithGoogle();
};
window.ketoSignOut = async () => {
  const { signOutUser } = await import('./firebase.js');
  await signOutUser();
  window.__ketoUser = null;
};
