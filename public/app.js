const narrowDocs = window.matchMedia('(max-width: 959px)');
const docMenus = document.querySelectorAll('.docs-sidebar, .article-toc details');
function setDocMenus() { docMenus.forEach(menu => { menu.open = !narrowDocs.matches; }); }
setDocMenus();
narrowDocs.addEventListener('change', setDocMenus);

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
const sharing = document.querySelector('[data-share-slug]');
sharing?.addEventListener('click', async event => {
  const create = event.target.closest('[data-create-share]');
  const revoke = event.target.closest('[data-revoke-share]');
  if (!create && !revoke) return;
  const status = sharing.querySelector('[data-share-status]');
  const result = sharing.querySelector('.share-result');
  const input = sharing.querySelector('[data-share-url]');
  const buttons = sharing.querySelectorAll('button');
  buttons.forEach(button => { button.disabled = true; });
  status.textContent = create ? 'Creating share link…' : 'Revoking share link…';
  try {
    const response = await fetch(`/api/lessons/${sharing.dataset.shareSlug}/share`, { method: create ? 'POST' : 'DELETE' });
    const data = await response.json();
    if (!response.ok) throw new Error(response.status === 401 ? 'Your session expired. Sign in again to manage sharing.' : data.error || 'Unable to update sharing. Try again.');
    result.hidden = !create;
    input.value = create ? data.url : '';
    if (create) {
      status.textContent = 'Share link created. Copy it below.';
      input.focus();
      input.select();
      try { await navigator.clipboard.writeText(data.url); status.textContent = 'Share link copied. It opens this lesson only.'; } catch { /* The visible input remains available for manual copying. */ }
    } else status.textContent = 'Your share link has been revoked.';
  } catch (error) { status.textContent = error.message; }
  finally { buttons.forEach(button => { button.disabled = false; }); }
});
