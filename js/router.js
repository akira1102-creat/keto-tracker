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
  if (_handlers[page]) _handlers[page](main);
}

export function currentPage() { return _currentPage; }
