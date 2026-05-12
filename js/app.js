import { initFirebase, onAuthChange, signInWithGoogle, signOutUser } from './firebase.js';
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
  navigator.serviceWorker.register('/keto-tracker/sw.js').catch(() => {});
}

// ===== Navigation =====
registerPages({ record: renderRecord, dashboard: renderDashboard, history: renderHistory, settings: renderSettings });
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => navigate(btn.dataset.page));
});

// ===== Helpers =====
function hideSplash() {
  document.getElementById('splash-screen').classList.add('hidden');
}
function showApp() {
  document.getElementById('main-content').classList.remove('hidden');
  document.getElementById('bottom-nav').classList.remove('hidden');
}
function hideApp() {
  document.getElementById('main-content').classList.add('hidden');
  document.getElementById('bottom-nav').classList.add('hidden');
}

// ===== Auth UI =====
function showAuthOverlay() {
  let overlay = document.getElementById('auth-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'auth-overlay';
    overlay.style.cssText = 'position:fixed;inset:0;background:#0f1412;display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:9999;gap:24px;';
    overlay.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 192 192" width="72" height="72">
        <rect width="192" height="192" rx="38" fill="#0f1412"/>
        <circle cx="96" cy="96" r="72" fill="none" stroke="#1a5c38" stroke-width="3" opacity="0.5"/>
        <path d="M96 38 C96 38 118 62 118 82 C118 100 108 108 108 108 C108 90 96 84 88 72 C84 88 90 100 84 112 C76 104 72 94 72 82 C72 62 96 38 96 38Z" fill="#4caf50" opacity="0.95"/>
        <path d="M96 58 C96 58 110 74 110 86 C110 96 104 102 104 102 C104 90 96 84 91 76 C89 86 93 94 89 103 C84 97 82 90 82 84 C82 70 96 58 96 58Z" fill="#d4a017" opacity="0.9"/>
        <path d="M80 128 C80 128 88 118 96 120 C104 118 112 128 112 128 C112 128 104 138 96 136 C88 138 80 128 80 128Z" fill="#1a5c38" stroke="#4caf50" stroke-width="1.5"/>
      </svg>
      <div style="color:#cdccca;font-size:1.25rem;font-weight:700;">酮食記</div>
      <div style="color:#797876;font-size:0.9rem;">登入以同步你的飲食記錄</div>
      <button id="google-signin-btn" style="display:flex;align-items:center;gap:12px;background:#fff;color:#3c4043;border:none;border-radius:8px;padding:12px 24px;font-size:1rem;font-weight:600;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.3);">
        <svg width="20" height="20" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
        </svg>
        用 Google 帳號登入
      </button>
      <div style="color:#5a5957;font-size:0.8rem;">資料加密儲存，只有你能存取</div>
    `;
    document.body.appendChild(overlay);
    document.getElementById('google-signin-btn').addEventListener('click', async () => {
      const btn = document.getElementById('google-signin-btn');
      btn.textContent = '登入中...';
      btn.disabled = true;
      try {
        await signInWithGoogle();
      } catch (e) {
        btn.textContent = '登入失敗，請重試';
        btn.disabled = false;
      }
    });
  }
  overlay.style.display = 'flex';
}

function hideAuthOverlay() {
  const overlay = document.getElementById('auth-overlay');
  if (overlay) overlay.style.display = 'none';
}

// ===== Init =====
async function init() {
  // 安全保護：5秒內如果 Firebase 未回應，直接顯示登入畫面
  const safetyTimer = setTimeout(() => {
    hideSplash();
    showAuthOverlay();
  }, 5000);

  try {
    // 設定 auth state 監聽器（只登記一次）
    onAuthChange(user => {
      clearTimeout(safetyTimer);
      hideSplash();
      if (user) {
        hideAuthOverlay();
        showApp();
        navigate('record');
      } else {
        hideApp();
        showAuthOverlay();
      }
    });

    await initFirebase();
  } catch (e) {
    clearTimeout(safetyTimer);
    console.warn('Firebase init failed, running offline:', e.message);
    hideSplash();
    showApp();
    navigate('record');
  }
}

init();

window.ketoSignOut = async () => {
  await signOutUser();
};
