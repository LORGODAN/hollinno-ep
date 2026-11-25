(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = { cfg: null, tab: 'overview', payFilter: 'pending', users: [], rejectId: null, rejectCard: null };

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opts = {}) {
    const o = { credentials: 'same-origin', method: opts.method || 'GET', headers: {} };
    if (opts.json) {
      o.method = opts.method || 'POST';
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(opts.json);
    }
    let res;
    try {
      res = await fetch(url, o);
    } catch {
      throw Object.assign(new Error('No connection. Check your internet and try again.'), { status: 0 });
    }
    let data = {};
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) throw Object.assign(new Error(data.error || 'Something went wrong.'), { status: res.status });
    return data;
  }

  // Uploads with a progress callback (fetch cannot report upload progress).
  function upload(url, formData, onProgress) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', url);
      xhr.withCredentials = true;
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100)); };
      xhr.onerror = () => reject(new Error('Upload failed. Check your internet and try again.'));
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* ignore */ }
        if (xhr.status >= 200 && xhr.status < 300) resolve(data);
        else reject(new Error(data.error || 'Upload failed.'));
      };
      xhr.send(formData);
    });
  }

  const money = (n) => `${state.cfg.ep.currency} ${Number(n).toLocaleString('en-US')}`;
  const fmtDate = (s) =>
    s ? new Date(s).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';
  const nationalPhone = (p) => {
    const d = '0' + String(p || '').slice(3);
    return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p;
  };
  const fill = (tpl, vars) => String(tpl).replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? vars[k] : m));
  const waLink = (phone, text) => `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ''}`;
  const waVars = (extra) => ({ ep: state.cfg.ep.title, site: location.origin, ...extra });

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- login / boot ---------- */

  function showLogin() {
    $('#loginView').hidden = false;
    $('#dashView').hidden = true;
    $('#logoutBtn').hidden = true;
  }
  function showDash() {
    $('#loginView').hidden = true;
    $('#dashView').hidden = false;
    $('#logoutBtn').hidden = false;
    setTab(state.tab);
  }

  $('#loginForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.currentTarget;
    const err = $('#loginError');
    err.textContent = '';
    try {
      const { user } = await api('/api/login', { json: { phone: f.phone.value, password: f.password.value } });
      if (user.role !== 'admin') {
        await api('/api/logout', { method: 'POST' });
        err.textContent = 'This account is not an admin account.';
        return;
      }
      f.reset();
      showDash();
    } catch (ex) {
      err.textContent = ex.message;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
    showLogin();
  });

  // If a session expires while working, go back to the login screen.
  function handleAuthError(ex) {
    if (ex && (ex.status === 401 || ex.status === 403)) {
      toast('Please log in again.');
      showLogin();
      return true;
    }
    return false;
  }

  /* ---------- tabs ---------- */

  document.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', () => setTab(b.dataset.tab)));

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('[data-tab]').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === tab)));
    const box = $('#tabContent');
    box.innerHTML = '<p class="empty">Loading...</p>';
    const render = { overview: renderOverview, payments: renderPayments, fans: renderFans, tracks: renderTracks }[tab];
    render().catch((ex) => {
      if (!handleAuthError(ex)) box.innerHTML = `<p class="form-error">${esc(ex.message)}</p>`;
    });
  }

  function setBadge(n) {
    const el = $('#pendingBadge');
    el.textContent = n;
    el.hidden = !n;
  }
  async function refreshBadge() {
    try {
      setBadge((await api('/api/admin/stats')).stats.fans_pending);
    } catch { /* ignore */ }
  }
  setInterval(() => { if (!$('#dashView').hidden && document.visibilityState === 'visible') refreshBadge(); }, 90000);

  /* ---------- overview ---------- */

  async function renderOverview() {
    const { stats: s, tracks, recent, price } = await api('/api/admin/stats');
    setBadge(s.fans_pending);
    const cards = [
      ['Waiting for approval', s.fans_pending, 'hot'],
      ['Approved fans', s.fans_approved, ''],
      ['Total downloads', s.downloads_total, 'hot'],
      ['Fans who downloaded', s.downloaders_unique, ''],
      ['Total plays', s.plays_total, ''],
      ['Estimated income', money(s.fans_approved * price), ''],
      ['Signed up, not paid', s.fans_registered, ''],
      ['Rejected', s.fans_rejected, ''],
      ['All sign-ups', s.fans_total, ''],
    ];
    $('#tabContent').innerHTML = `
      <div class="stat-grid">
        ${cards.map(([label, num, cls]) => `<div class="stat ${cls}"><div class="stat-num">${esc(num)}</div><div class="stat-label">${esc(label)}</div></div>`).join('')}
      </div>
      <h2 class="sec-title">By song</h2>
      <div class="rows">
        ${tracks.length ? tracks.map((t) => `
          <div class="row"><div class="row-main"><div class="row-title">${esc(t.position)}. ${esc(t.title)}</div></div>
          <div class="row-meta nums">${esc(t.plays)} plays, ${esc(t.downloads)} downloads</div></div>`).join('') : '<p class="empty">No songs yet. Add them in the Songs tab.</p>'}
      </div>
      <h2 class="sec-title">Latest downloads</h2>
      <div class="rows">
        ${recent.length ? recent.map((r) => `
          <div class="row"><div class="row-main"><div class="row-title">${esc(r.name)}</div>
          <div class="row-meta">${esc(nationalPhone(r.phone))}</div></div>
          <div class="row-meta">${esc(r.track)}<br>${esc(fmtDate(r.created_at))}</div></div>`).join('') : '<p class="empty">No downloads yet.</p>'}
      </div>`;
  }

  /* ---------- payments ---------- */

  async function renderPayments() {
    const { payments } = await api(`/api/admin/payments?status=${state.payFilter}`);
    if (state.payFilter === 'pending') setBadge(payments.length);
    const filters = ['pending', 'approved', 'rejected']
      .map((f) => `<button class="btn btn-small ${f === state.payFilter ? 'btn-primary' : 'btn-quiet'}" data-filter="${f}" type="button">${f[0].toUpperCase() + f.slice(1)}</button>`)
      .join('');
    const empty = { pending: 'Nothing waiting. All caught up.', approved: 'No approved payments yet.', rejected: 'No rejected payments.' }[state.payFilter];
    $('#tabContent').innerHTML = `
      <div class="toolbar">${filters}</div>
      ${payments.length ? payments.map(payCard).join('') : `<p class="empty">${empty}</p>`}`;

    document.querySelectorAll('[data-filter]').forEach((b) =>
      b.addEventListener('click', () => { state.payFilter = b.dataset.filter; setTab('payments'); })
    );
  }

  function payCard(p) {
    const shot = p.screenshot_url
      ? `<button class="pay-shot" type="button" data-img="${esc(p.screenshot_url)}" aria-label="Enlarge screenshot"><img src="${esc(p.screenshot_url)}" alt="Payment screenshot" loading="lazy"></button>`
      : '<div class="pay-shot row-meta" style="display:grid;place-items:center">No image</div>';
    const actions =
      p.status === 'pending'
        ? `<div class="pay-actions">
             <button class="btn btn-primary btn-small" type="button" data-approve>Approve</button>
             <button class="btn btn-danger btn-small" type="button" data-reject>Reject</button>
           </div>`
        : `<p><span class="badge ${esc(p.status)}">${esc(p.status)}</span> <span class="row-meta">${esc(fmtDate(p.reviewed_at))}</span></p>
           ${p.reject_reason ? `<p class="row-meta">${esc(p.reject_reason)}</p>` : ''}`;
    return `
      <article class="pay-card" data-id="${esc(p.id)}" data-name="${esc(p.name)}" data-phone="${esc(p.phone)}">
        ${shot}
        <div class="pay-info">
          <h3>${esc(p.name)}</h3>
          <p>${esc(nationalPhone(p.phone))}<br>Paid with ${esc(p.method)}</p>
          <p>Transaction ID: <span class="txn">${esc(p.transaction_id)}</span></p>
          <p class="row-meta">Sent ${esc(fmtDate(p.created_at))}</p>
          ${actions}
        </div>
      </article>`;
  }

  function doneState(card, label, message) {
    const phone = card.dataset.phone;
    card.querySelector('.pay-info').innerHTML = `
      <h3>${esc(card.dataset.name)}</h3>
      <p><strong>${esc(label)}.</strong> Now tell them on WhatsApp:</p>
      <div class="pay-actions">
        <a class="btn btn-primary btn-small" href="${esc(waLink(phone, message))}" target="_blank" rel="noopener">Message on WhatsApp</a>
      </div>`;
  }

  $('#tabContent').addEventListener('click', async (e) => {
    const img = e.target.closest('[data-img]');
    if (img) {
      $('#imageFull').src = img.dataset.img;
      $('#imageDialog').showModal();
      return;
    }
    const card = e.target.closest('.pay-card');
    if (!card) return;

    if (e.target.closest('[data-approve]')) {
      if (!confirm(`Approve ${card.dataset.name}'s payment? They will get access to the EP.`)) return;
      const btn = e.target.closest('button');
      btn.disabled = true;
      try {
        await api(`/api/admin/payments/${card.dataset.id}/approve`, { method: 'POST' });
        doneState(card, 'Approved', fill(state.cfg.messages.approved, waVars({ name: card.dataset.name.split(' ')[0] })));
        refreshBadge();
      } catch (ex) {
        btn.disabled = false;
        if (!handleAuthError(ex)) toast(ex.message);
      }
    } else if (e.target.closest('[data-reject]')) {
      state.rejectCard = card;
      $('#rejectReason').value = '';
      $('#rejectDialog').showModal();
    }
  });

  const REASONS = ['Transaction ID not found', 'Amount is too low', 'Screenshot is unclear', 'Payment was not received'];
  $('#rejectChips').innerHTML = REASONS.map((r) => `<button class="chip" type="button">${esc(r)}</button>`).join('');
  $('#rejectChips').addEventListener('click', (e) => {
    const chip = e.target.closest('.chip');
    if (chip) $('#rejectReason').value = chip.textContent;
  });
  $('#rejectConfirm').addEventListener('click', async () => {
    const card = state.rejectCard;
    if (!card) return;
    const btn = $('#rejectConfirm');
    btn.disabled = true;
    try {
      const { reason } = await api(`/api/admin/payments/${card.dataset.id}/reject`, {
        json: { reason: $('#rejectReason').value },
      });
      $('#rejectDialog').close();
      doneState(card, 'Rejected', fill(state.cfg.messages.rejected, waVars({ name: card.dataset.name.split(' ')[0], reason })));
      refreshBadge();
    } catch (ex) {
      if (!handleAuthError(ex)) toast(ex.message);
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- fans ---------- */

  async function renderFans() {
    state.users = (await api('/api/admin/users')).users;
    $('#tabContent').innerHTML = `
      <div class="toolbar">
        <input type="search" id="fanSearch" placeholder="Search name or phone" aria-label="Search fans">
        <button class="btn btn-quiet btn-small" id="exportCsv" type="button">Download list (CSV)</button>
      </div>
      <div class="rows" id="fanRows"></div>`;
    const draw = () => {
      const q = $('#fanSearch').value.trim().toLowerCase();
      const digits = q.replace(/\D/g, '').replace(/^0/, '');
      const list = state.users.filter((u) => !q || u.name.toLowerCase().includes(q) || (digits && u.phone.includes(digits)));
      $('#fanRows').innerHTML = list.length
        ? list.map(fanRow).join('')
        : '<p class="empty">No fans match.</p>';
    };
    $('#fanSearch').addEventListener('input', draw);
    $('#exportCsv').addEventListener('click', exportCsv);
    draw();
  }

  function fanRow(u) {
    return `
      <div class="row" data-id="${esc(u.id)}" data-name="${esc(u.name)}" data-phone="${esc(u.phone)}">
        <div class="row-main">
          <div class="row-title">${esc(u.name)} <span class="badge ${esc(u.status)}">${esc(u.status)}</span></div>
          <div class="row-meta nums">${esc(nationalPhone(u.phone))}<br>Joined ${esc(fmtDate(u.created_at))}, ${esc(u.plays)} plays, ${esc(u.downloads)} downloads</div>
        </div>
        <div class="row-actions">
          <a class="btn btn-quiet btn-small" href="${esc(waLink(u.phone))}" target="_blank" rel="noopener">WhatsApp</a>
          <button class="btn btn-quiet btn-small" type="button" data-reset>Reset password</button>
          ${u.status === 'approved' ? '<button class="btn btn-danger btn-small" type="button" data-revoke>Remove access</button>' : ''}
        </div>
      </div>`;
  }

  function exportCsv() {
    const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [['Name', 'Phone', 'Status', 'Plays', 'Downloads', 'Joined']].concat(
      state.users.map((u) => [u.name, '+' + u.phone, u.status, u.plays, u.downloads, u.created_at])
    );
    const blob = new Blob([rows.map((r) => r.map(cell).join(',')).join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'fans.csv';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  $('#tabContent').addEventListener('click', async (e) => {
    const row = e.target.closest('.row[data-id]');
    if (!row) return;
    const name = row.dataset.name;

    if (e.target.closest('[data-reset]')) {
      if (!confirm(`Make a new password for ${name}? Their old password stops working.`)) return;
      try {
        const r = await api(`/api/admin/users/${row.dataset.id}/reset-password`, { method: 'POST' });
        const msg = fill(state.cfg.messages.reset, waVars({ name: name.split(' ')[0], password: r.password }));
        $('#resultTitle').textContent = `New password for ${name}`;
        $('#resultBody').innerHTML = `
          <div class="pw-box">${esc(r.password)}</div>
          <p class="hint">Send it to them now. It is only shown once.</p>
          <div class="dialog-actions">
            <a class="btn btn-primary" href="${esc(waLink(r.phone, msg))}" target="_blank" rel="noopener">Send on WhatsApp</a>
          </div>`;
        $('#resultDialog').showModal();
      } catch (ex) {
        if (!handleAuthError(ex)) toast(ex.message);
      }
    } else if (e.target.closest('[data-revoke]')) {
      if (!confirm(`Remove ${name}'s access to the EP? They can pay again to get it back.`)) return;
      try {
        await api(`/api/admin/users/${row.dataset.id}/revoke`, { method: 'POST' });
        toast('Access removed.');
        setTab('fans');
      } catch (ex) {
        if (!handleAuthError(ex)) toast(ex.message);
      }
    }
  });

  /* ---------- songs ---------- */

  async function renderTracks() {
    const { tracks } = await api('/api/admin/tracks');
    $('#tabContent').innerHTML = `
      <form class="upload-form" id="uploadForm" novalidate>
        <label>Song title
          <input name="title" type="text" maxlength="100" placeholder="e.g. Night Bus">
        </label>
        <label>Track number
          <input name="position" type="number" min="1" placeholder="Leave empty to add at the end">
        </label>
        <label class="full">Full song (MP3 is best)
          <input name="audio" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac">
        </label>
        <label class="full">Preview clip for the public (optional, 20 to 30 seconds)
          <input name="preview" type="file" accept="audio/*,.mp3,.m4a,.aac,.wav,.ogg,.flac">
        </label>
        <p class="form-error full" id="uploadError" role="alert"></p>
        <button class="btn btn-primary" id="uploadBtn" type="submit">Add song</button>
      </form>
      <h2 class="sec-title">On the site now</h2>
      <div class="rows">
        ${tracks.length ? tracks.map((t) => `
          <div class="row" data-track="${esc(t.id)}" data-title="${esc(t.title)}">
            <div class="row-main">
              <div class="row-title">${esc(t.position)}. ${esc(t.title)}</div>
              <div class="row-meta">${t.has_preview ? 'Has a public preview' : 'No preview clip'}, ${esc(t.plays)} plays, ${esc(t.downloads)} downloads</div>
            </div>
            <div class="row-actions"><button class="btn btn-danger btn-small" type="button" data-delete>Delete</button></div>
          </div>`).join('') : '<p class="empty">No songs yet. Add the first one above.</p>'}
      </div>`;

    $('#uploadForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = e.currentTarget;
      const err = $('#uploadError');
      const btn = $('#uploadBtn');
      err.textContent = '';
      if (!f.title.value.trim()) { err.textContent = 'Enter the song title.'; return; }
      if (!f.audio.files[0]) { err.textContent = 'Choose the full song file.'; return; }
      const fd = new FormData();
      fd.append('title', f.title.value.trim());
      if (f.position.value) fd.append('position', f.position.value);
      fd.append('audio', f.audio.files[0]);
      if (f.preview.files[0]) fd.append('preview', f.preview.files[0]);
      btn.disabled = true;
      try {
        await upload('/api/admin/tracks', fd, (pct) => { btn.textContent = pct < 100 ? `Uploading ${pct}%` : 'Saving...'; });
        toast('Song added.');
        setTab('tracks');
      } catch (ex) {
        err.textContent = ex.message;
        btn.disabled = false;
        btn.textContent = 'Add song';
      }
    });
  }

  $('#tabContent').addEventListener('click', async (e) => {
    const del = e.target.closest('[data-delete]');
    if (!del) return;
    const row = del.closest('[data-track]');
    if (!confirm(`Delete "${row.dataset.title}"? Its files and its play and download counts are removed for good.`)) return;
    try {
      await api(`/api/admin/tracks/${row.dataset.track}`, { method: 'DELETE' });
      toast('Song deleted.');
      setTab('tracks');
    } catch (ex) {
      if (!handleAuthError(ex)) toast(ex.message);
    }
  });

  /* ---------- start ---------- */

  (async function init() {
    try {
      state.cfg = await api('/api/config');
      $('#adminBrand').textContent = `${state.cfg.artist.name}, admin`;
      const t = state.cfg.theme;
      const root = document.documentElement.style;
      root.setProperty('--bg', t.background);
      root.setProperty('--surface', t.surface);
      root.setProperty('--text', t.text);
      root.setProperty('--accent', t.accent);
      root.setProperty('--accent-text', t.accentText);
      document.title = `Admin, ${state.cfg.ep.title}`;
    } catch (ex) {
      $('#loginView').hidden = false;
      $('#loginError').textContent = ex.message;
      return;
    }
    try {
      const { user } = await api('/api/me');
      if (user.role === 'admin') showDash();
      else showLogin();
    } catch {
      showLogin();
    }
  })();
})();
