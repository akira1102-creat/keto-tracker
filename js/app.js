import { renderRecord } from './camera.js';
import { renderDashboard } from './dashboard.js';
import { renderHistory } from './history.js';
import { renderSettings, APP_VERSION } from './settings.js';
import { navigate, registerPages, currentPage } from './router.js';

// ===== Version check: auto-clear cache when version changes =====
(async () => {
  const savedVersion = localStorage.getItem('keto_app_version');
  if (savedVersion !== APP_VERSION) {
    console.log(`[keto] Version changed: ${savedVersion} → ${APP_VERSION}, clearing Service Worker cache...`);
    localStorage.setItem('keto_app_version', APP_VERSION);
    // Unregister all service workers to force cache refresh
    if ('serviceWorker' in navigator) {
      try {
        const registrations = await navigator.serviceWorker.getRegistrations();
        for (const reg of registrations) {
          await reg.unregister();
        }
        console.log('[keto] Service Workers unregistered, reloading...');
        // Reload after a short delay to ensure SW is unregistered
        setTimeout(() => location.reload(), 500);
      } catch (e) {
        console.warn('[keto] Failed to unregister SW:', e);
      }
    }
  }
})();

if (window.__clearSplashTimer) window.__clearSplashTimer();

function showApp() {
  document.getElementById('splash-screen').classList.add('hidden');
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');
}

// ===== Sync status bar =====
function updateSyncBar(state, timeStr) {
  let bar = document.getElementById('sync-status-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'sync-status-bar';
    bar.style.cssText = `
      position: fixed; top: 0; left: 0; right: 0; z-index: 999;
      font-size: 11px; text-align: center; padding: 3px 12px;
      transition: opacity 0.4s; pointer-events: none;
      font-family: var(--font-body, sans-serif);
      letter-spacing: 0.02em;
    `;
    document.body.prepend(bar);
  }
  if (state === 'syncing') {
    bar.style.background = 'var(--color-primary)';
    bar.style.color = '#fff';
    bar.style.opacity = '1';
    bar.textContent = '⟳ 同步中...';
  } else if (state === 'done') {
    bar.style.background = 'var(--color-success)';
    bar.style.color = '#fff';
    bar.style.opacity = '1';
    bar.textContent = `✓ 已同步  ${timeStr || ''}`;
    setTimeout(() => { bar.style.opacity = '0'; }, 3000);
  } else if (state === 'error') {
    bar.style.background = 'var(--color-error)';
    bar.style.color = '#fff';
    bar.style.opacity = '1';
    bar.textContent = '✕ 同步失敗';
    setTimeout(() => { bar.style.opacity = '0'; }, 4000);
  } else {
    bar.style.opacity = '0';
  }
}

function formatSyncTime(isoStr) {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
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

  window.addEventListener('keto-analysis-change', updateNavBadge);
  updateNavBadge();

  // Listen for sync events from firebase.js
  window.addEventListener('keto-synced', () => {
    import('./firebase.js').then(({ getLastSyncTime }) => {
      updateSyncBar('done', formatSyncTime(getLastSyncTime()));
    });
  });

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
    _firebaseReady = import('./firebase.js').then(async ({ initFirebase, onAuthChange, downloadCloudToLocal, syncOfflineQueue, getLastSyncTime }) => {

      let _syncedUid = null;

      function doSync(user) {
        if (!user || _syncedUid === user.uid) return;
        _syncedUid = user.uid;
        updateSyncBar('syncing');
        downloadCloudToLocal()
          .then(() => syncOfflineQueue())
          .then(() => {
            updateSyncBar('done', formatSyncTime(getLastSyncTime()));
            navigate(currentPage());
          })
          .catch(() => updateSyncBar('error'));
      }

      onAuthChange(user => {
        window.__ketoUser = user || null;
        if (!user) _syncedUid = null;
        refreshSettingsIfVisible();
        doSync(user);
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
