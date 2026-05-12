import { initFirebase } from './firebase.js';
import { renderRecord } from './camera.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { navigate, registerPages } from './router.js';

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
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}

// ===== Navigation =====
registerPages({ record: renderRecord, dashboard: renderDashboard, history: renderHistory, settings: renderSettings });

document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

// ===== Init =====
async function init() {
  try {
    await initFirebase();
  } catch (e) {
    console.warn('Firebase init, running offline:', e.message);
  }
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');
  navigate('record');
}

init();