import { renderRecord } from './camera.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory } from './history.js';
import { renderSettings } from './settings.js';
import { navigate, registerPages } from './router.js';

if (window.__clearSplashTimer) window.__clearSplashTimer();

function showApp() {
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');
}

try {
  showApp();

  registerPages({ record: renderRecord, dashboard: renderDashboard, history: renderHistory, settings: renderSettings });

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => navigate(btn.dataset.page));
  });

  navigate('record');

  function updateNavBadge() {
    const s = window.__ketoAnalysis;
    const recordBtn = document.querySelector('.nav-btn[data-page="record"]');
    if (!recordBtn) return;
    let badge = recordBtn.querySelector('.nav-badge');
    if (s.status === 'idle' || !s.status) {
      if (badge) badge.remove();
      return;
    }
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'nav-badge';
      recordBtn.appendChild(badge);
    }
    if (s.status === 'running') {
      badge.className = 'nav-badge running';
      badge.textContent = '\u2026';
    } else if (s.status === 'done') {
      badge.className = 'nav-badge done';
      badge.textContent = '\u2713';
    } else if (s.status === 'error') {
      badge.className = 'nav-badge running';
      badge.textContent = '!';
    }
  }

  setInterval(updateNavBadge, 1000);

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

} catch (err) {
  console.error('[keto] app init error:', err);
  showApp();
}

// ===== Service Worker =====
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/keto-tracker/sw.js').catch(() => {});
}

// ===== Firebase =====
window.__ketoUser = null;
let _firebaseReady = null;

function refreshSettingsIfVisible() {
  const settingsEl = document.getElementById('page-settings');
  if (settingsEl && !settingsEl.classList.contains('hidden')) {
    renderSettings(settingsEl);
  }
}

function ensureFirebase() {
  if (!_firebaseReady) {
    _firebaseReady = import('./firebase.js').then(({ initFirebase, onAuthChange }) => {
      onAuthChange(user => {
        const prev = window.__ketoUser;
        window.__ketoUser = user || null;
        // Re-render settings if auth state actually changed
        if (!!prev !== !!user) refreshSettingsIfVisible();
      });
      return initFirebase();
    });
  }
  return _firebaseReady;
}

ensureFirebase().then(user => {
  if (user) {
    window.__ketoUser = user;
    refreshSettingsIfVisible();
  }
}).catch(() => {});

window.ketoSignIn = async () => {
  const { signInWithGoogle } = await ensureFirebase().then(() => import('./firebase.js'));
  await signInWithGoogle();
};

window.ketoSignOut = async () => {
  const { signOutUser } = await import('./firebase.js');
  await signOutUser();
  window.__ketoUser = null;
};
