// Central router — avoids circular imports between app.js and page modules
const _handlers = {};
let _currentPage = 'record';

export function registerPages(handlers) {
  Object.assign(_handlers, handlers);
}

export function navigate(page) {
  _currentPage = page;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.page === page);
  });
  const main = document.getElementById('main-content');
  main.innerHTML = '';
  if (_handlers[page]) {
    try {
      _handlers[page](main);
    } catch (err) {
      console.error(`[keto] render error on page "${page}":`, err);
      main.innerHTML = `<div class="page"><div class="empty-state" style="padding:48px 0"><div style="font-size:32px">⚠️</div><p>頁面載入失敗<br><small style="color:var(--color-text-muted)">${err.message}</small></p></div></div>`;
    }
  }
}

export function currentPage() { return _currentPage; }
