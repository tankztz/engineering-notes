document.querySelectorAll('form[role="search"]').forEach(form => {
  form.addEventListener('submit', () => {
    const button = form.querySelector('button');
    button.textContent = 'Searching…';
    button.disabled = true;
    form.setAttribute('aria-busy', 'true');
  });
});
window.addEventListener('pageshow', () => {
  document.querySelectorAll('form[role="search"]').forEach(form => {
    form.querySelector('button').textContent = 'Search';
    form.querySelector('button').disabled = false;
    form.removeAttribute('aria-busy');
  });
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey && !event.target.closest('input, textarea, [contenteditable]')) {
    event.preventDefault();
    document.querySelector('#main-query, #header-query')?.focus();
  }
});
document.querySelector('[data-copy-link]')?.addEventListener('click', async () => {
  const status = document.querySelector('[data-copy-status]');
  try { await navigator.clipboard.writeText(location.href); status.textContent = 'Link copied'; }
  catch { status.textContent = 'Copy the URL from your address bar'; }
});
