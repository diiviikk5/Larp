// Synchronizes this embedded app with the local host; no model keys enter the frame.
(() => {
  if (window.parent === window) return;
  const id = location.pathname.split('/').filter(Boolean).at(-2);
  const currentProfile = () => id === 'citylines' ? (typeof demoMode !== 'undefined' && !demoMode ? 'personal' : 'demo') : '';
  let profile = currentProfile();
  const currentKey = () => id === 'citylines' ? (profile === 'demo' ? 'citylines.demo.v1' : 'citylines.family.v1') : id === 'eduspace' ? 'larp.eduspace.workspace.v1' : id === 'studio' ? 'larp.studio.v1' : null;
  let key = currentKey();
  if (!key) return;
  let revision = null, last = null, saving = false;
  const send = (action, data) => parent.postMessage({ type: 'larp-app-bridge', id, action, data, revision, profile }, location.protocol === 'file:' ? '*' : location.origin);
  window.addEventListener('message', (event) => {
    if (event.source !== parent || (location.protocol !== 'file:' && event.origin !== location.origin) || event.data?.type !== 'larp-app-state' || event.data.id !== id || event.data.profile !== profile) return;
    saving = false;
    const snapshot = event.data.snapshot;
    if (!snapshot) return;
    revision = snapshot.revision;
    if (snapshot.data) {
      const next = JSON.stringify(snapshot.data);
      if (localStorage.getItem(key) !== next) {
        localStorage.setItem(key, next);
        if (id === 'citylines') { const url = new URL(location.href); url.searchParams.set('mode', profile); history.replaceState(null, '', url); }
        location.reload(); return;
      }
      last = next;
    } else last = null;
  });
  setInterval(() => {
    if (currentProfile() !== profile) { profile = currentProfile(); key = currentKey(); revision = null; last = null; saving = false; send('read'); return; }
    if (saving) return;
    const current = localStorage.getItem(key);
    if (revision !== null && current && current !== last) {
      try { saving = true; send('save', JSON.parse(current)); } catch { saving = false; }
    } else send('read');
  }, 1800);
  send('read');
})();
