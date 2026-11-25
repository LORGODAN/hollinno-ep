(() => {
  'use strict';

  const $ = (sel) => document.querySelector(sel);
  const state = { cfg: null, user: null, tracks: [], current: null };

  const ICON_PLAY = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>';
  const ICON_PAUSE = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 5h4v14H6zm8 0h4v14h-4z"/></svg>';
  const ICON_LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 9h-1V7a4 4 0 0 0-8 0v2H7a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2zm-7-2a2 2 0 0 1 4 0v2h-4V7z"/></svg>';

  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  async function api(url, opts = {}) {
    const o = { credentials: 'same-origin', method: opts.method || 'GET', headers: {} };
    if (opts.json) {
      o.method = opts.method || 'POST';
      o.headers['Content-Type'] = 'application/json';
      o.body = JSON.stringify(opts.json);
    } else if (opts.body) {
      o.body = opts.body;
      o.method = opts.method || 'POST';
    }
    let res;
    try {
      res = await fetch(url, o);
    } catch {
      const err = new Error('No connection. Check your data or Wi-Fi and try again.');
      err.status = 0;
      throw err;
    }
    let data = {};
    try { data = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
      const err = new Error(data.error || 'Something went wrong. Please try again.');
      err.status = res.status;
      throw err;
    }
    return data;
  }

  const money = (n) => `${state.cfg.ep.currency} ${Number(n).toLocaleString('en-US')}`;
  const nationalPhone = (p) => {
    const d = '0' + String(p || '').slice(3);
    return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : p;
  };
  const fmtTime = (s) => {
    if (!Number.isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    return `${m}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  };

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  const scrollToEl = (sel) => {
    const el = $(sel);
    if (el) el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
  };

  /* ---------- static content from config ---------- */

  function applyConfig() {
    const { artist, ep, theme, socials, poweredBy } = state.cfg;
    const root = document.documentElement.style;
    root.setProperty('--bg', theme.background);
    root.setProperty('--surface', theme.surface);
    root.setProperty('--text', theme.text);
    root.setProperty('--accent', theme.accent);
    root.setProperty('--accent-text', theme.accentText);
    document.querySelector('meta[name="theme-color"]').setAttribute('content', theme.background);

    document.title = `${ep.title} by ${artist.name}`;
    document.querySelector('meta[name="description"]').setAttribute('content', `Stream and download ${ep.title} by ${artist.name}.`);
    $('#brandName').textContent = artist.name;
    $('#coverImg').src = ep.cover;
    $('#coverImg').alt = `Cover of ${ep.title}`;
    $('#epYear').textContent = ep.year ? `EP, ${ep.year}` : 'EP';
    $('#epTitle').textContent = ep.title;
    $('#artistBy').textContent = artist.name;
    $('#tagline').textContent = artist.tagline || '';
    $('#priceNote').textContent = 'One payment. Stream and download as much as you like.';

    $('#aboutHeading').textContent = `About ${artist.name}`;
    const paragraphs = String(artist.bio || '').split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    $('#bio').innerHTML = paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, '<br>')}</p>`).join('');
    $('#about').hidden = !paragraphs.length;

    $('#followHeading').textContent = `Follow ${artist.name}`;
    const icons = window.SOCIAL_ICONS || {};
    const links = (socials || []).filter((s) => s && s.url);
    $('#socials').innerHTML = links
      .map((s) => {
        const icon = icons[s.platform];
        const label = icon ? icon.title : s.platform;
        const glyph = icon
          ? `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icon.path}"/></svg>`
          : esc(String(s.platform).charAt(0).toUpperCase());
        return `<a class="social" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(label)}" title="${esc(label)}">${glyph}</a>`;
      })
      .join('');
    $('#followSection').hidden = !links.length;

    $('#copyright').textContent = `© ${new Date().getFullYear()} ${artist.name}`;
    const pb = poweredBy || {};
    $('#poweredBy').innerHTML = pb.url
      ? `<a href="${esc(pb.url)}" target="_blank" rel="noopener noreferrer">${esc(pb.text)}</a>`
      : esc(pb.text || '');
  }

  /* ---------- state-dependent rendering ---------- */

  const isApproved = () => state.user && state.user.status === 'approved';

  function renderTop() {
    const u = state.user;
    $('#loginBtn').hidden = Boolean(u);
    $('#logoutBtn').hidden = !u;
    const hello = $('#helloName');
    hello.hidden = !u;
    hello.textContent = u ? u.name : '';
  }

  function renderHero() {
    const u = state.user;
    const btn = $('#heroCta');
    if (!u) btn.textContent = `Get the EP for ${money(state.cfg.ep.price)}`;
    else if (u.status === 'approved') btn.textContent = 'Listen and download';
    else if (u.status === 'pending') btn.textContent = 'Payment is being checked';
    else btn.textContent = 'Pay and unlock the EP';
  }

  function renderAccount() {
    const box = $('#account');
    const u = state.user;
    if (!u) {
      box.hidden = true;
      box.innerHTML = '';
      return;
    }
    box.hidden = false;
    const { ep, payment } = state.cfg;

    if (u.status === 'approved') {
      box.innerHTML = `
        <div class="status-line"><span class="dot ok"></span> You are in, ${esc(u.name.split(' ')[0])}</div>
        <p class="sub">Play any song below, or download it to keep. Downloads are unlimited.</p>`;
      return;
    }

    if (u.status === 'pending') {
      box.innerHTML = `
        <div class="status-line"><span class="dot"></span> Payment received, waiting for approval</div>
        <p>We will message you on WhatsApp at <strong>${esc(nationalPhone(u.phone))}</strong> as soon as it is approved. You can close this page and log in again later.</p>
        <button class="btn btn-quiet" id="checkStatus" type="button">Check status</button>`;
      $('#checkStatus').addEventListener('click', async () => {
        await refreshMe();
        if (state.user && state.user.status === 'approved') toast('Approved. Enjoy the EP!');
        else toast('Still waiting for approval.');
      });
      return;
    }

    // registered or rejected: show how to pay
    const methods = payment.methods
      .map(
        (m, i) => `
        <label class="method">
          <input type="radio" name="method" value="${esc(m.id)}" ${i === 0 ? 'checked' : ''}>
          <span class="method-card">
            <span class="method-name">${esc(m.label)}</span>
            <span class="method-number">${esc(m.number)}</span>
            <span class="method-holder">${esc(m.accountName)}</span>
            <button class="btn btn-quiet btn-small copy-btn" type="button" data-copy="${esc(m.number)}">Copy</button>
          </span>
        </label>`
      )
      .join('');
    box.innerHTML = `
      <h2>Unlock the EP</h2>
      ${u.status === 'rejected' ? `<div class="notice"><strong>Payment not approved.</strong> ${esc(u.reject_reason || '')} You can send your proof again below.</div>` : ''}
      <p>${esc(payment.instructions)}</p>
      <p class="pay-total">${esc(money(ep.price))}</p>
      <p class="sub">One payment. Unlimited streams and downloads.</p>
      <form class="pay-form" id="payForm" novalidate>
        <fieldset class="methods"><legend>How did you pay?</legend>${methods}</fieldset>
        <label>Transaction ID
          <input name="transaction_id" type="text" autocomplete="off" autocapitalize="characters" maxlength="60" placeholder="From your payment message">
        </label>
        <label>Screenshot of the payment
          <input name="screenshot" type="file" accept="image/*">
        </label>
        <img class="shot-preview" id="shotPreview" alt="Your screenshot" hidden>
        <p class="form-error" id="payError" role="alert"></p>
        <button class="btn btn-primary" id="paySubmit" type="submit">Send for approval</button>
      </form>`;

    box.querySelectorAll('[data-copy]').forEach((b) =>
      b.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(b.dataset.copy);
          toast('Copied');
        } catch {
          toast('Could not copy. Select the number and copy it.');
        }
      })
    );
    const fileInput = box.querySelector('input[type="file"]');
    fileInput.addEventListener('change', () => {
      const img = $('#shotPreview');
      const f = fileInput.files[0];
      if (f) {
        img.src = URL.createObjectURL(f);
        img.hidden = false;
      } else img.hidden = true;
    });
    $('#payForm').addEventListener('submit', submitPayment);
  }

  function renderTracks() {
    const approved = isApproved();
    $('#tracksHeading').textContent = approved ? 'Your EP' : 'Preview the EP';
    const anyPreview = state.tracks.some((t) => t.preview_url);
    $('#tracksSub').textContent = approved
      ? 'Tap play to stream, or download the songs to keep.'
      : anyPreview
        ? 'Tap play for a short preview. The full songs unlock after payment.'
        : 'Previews are coming soon.';
    const list = $('#trackList');
    if (!state.tracksLoaded) {
      list.innerHTML = '';
      return;
    }
    if (!state.tracks.length) {
      list.innerHTML = '<li class="empty">The songs are being uploaded. Check back soon.</li>';
      return;
    }
    list.innerHTML = state.tracks
      .map((t, i) => {
        const playable = approved || Boolean(t.preview_url);
        const stateText = approved ? '' : t.preview_url ? 'Preview' : 'Unlocks after payment';
        return `
        <li class="track ${playable ? '' : 'is-locked'}" data-index="${i}">
          <button class="icon-btn" type="button" data-play="${i}" aria-label="${playable ? 'Play' : 'Locked:'} ${esc(t.title)}">${playable ? ICON_PLAY : ICON_LOCK}</button>
          <span class="track-title">${esc(t.title)}${stateText ? `<span class="track-state">${esc(stateText)}</span>` : ''}</span>
          ${approved ? `<a class="btn btn-quiet btn-small" href="/api/tracks/${esc(t.id)}/download">Download</a>` : '<span></span>'}
        </li>`;
      })
      .join('');
    markCurrent();
  }

  function renderAll() {
    renderTop();
    renderHero();
    renderAccount();
    renderTracks();
  }

  /* ---------- player ---------- */

  const audio = new Audio();
  audio.preload = 'none';
  const pBtn = $('#pBtn');
  const seek = $('#pSeek');
  pBtn.innerHTML = ICON_PLAY;

  function markCurrent() {
    document.querySelectorAll('.track').forEach((li) => {
      const idx = Number(li.dataset.index);
      const isCur = state.current && state.current.index === idx;
      li.classList.toggle('is-current', Boolean(isCur));
      const btn = li.querySelector('[data-play]');
      if (!li.classList.contains('is-locked')) btn.innerHTML = isCur && !audio.paused ? ICON_PAUSE : ICON_PLAY;
    });
  }

  function lockedClick() {
    if (!state.user) {
      toast('Create an account to unlock the full EP.');
      openAuth('register');
    } else {
      toast('Pay to unlock this song.');
      scrollToEl('#account');
    }
  }

  async function playIndex(i) {
    const track = state.tracks[i];
    if (!track) return;
    if (state.current && state.current.index === i && audio.src) {
      if (audio.paused) audio.play().catch(() => {});
      else audio.pause();
      return;
    }
    let url;
    let mode;
    if (isApproved()) {
      try {
        url = (await api(`/api/tracks/${track.id}/stream`)).url;
        mode = 'full';
      } catch (e) {
        if (e.status === 401 || e.status === 403) await refreshMe();
        toast(e.message);
        return;
      }
    } else if (track.preview_url) {
      url = track.preview_url;
      mode = 'preview';
    } else {
      lockedClick();
      return;
    }
    state.current = { index: i, mode, retried: false };
    audio.src = url;
    $('#player').hidden = false;
    $('#pTitle').textContent = track.title;
    $('#pTag').textContent = mode === 'preview' ? 'Preview' : state.cfg.artist.name;
    audio.play().catch(() => {});
    markCurrent();
  }

  function playNext() {
    if (!state.current) return;
    for (let i = state.current.index + 1; i < state.tracks.length; i++) {
      if (isApproved() || state.tracks[i].preview_url) return playIndex(i);
    }
    state.current = null;
    markCurrent();
  }

  audio.addEventListener('play', () => { document.body.classList.add('is-playing'); pBtn.innerHTML = ICON_PAUSE; markCurrent(); });
  audio.addEventListener('pause', () => { document.body.classList.remove('is-playing'); pBtn.innerHTML = ICON_PLAY; markCurrent(); });
  audio.addEventListener('loadedmetadata', () => { seek.max = audio.duration || 0; $('#pDur').textContent = fmtTime(audio.duration); });
  audio.addEventListener('timeupdate', () => {
    if (!seek.matches(':active')) seek.value = audio.currentTime;
    $('#pCur').textContent = fmtTime(audio.currentTime);
  });
  audio.addEventListener('ended', playNext);
  audio.addEventListener('error', async () => {
    // The streaming link lasts an hour. If it expired mid-listen, fetch a fresh one once.
    const cur = state.current;
    if (!cur || cur.mode !== 'full' || cur.retried || !audio.src) return;
    cur.retried = true;
    const resumeAt = audio.currentTime;
    try {
      const r = await api(`/api/tracks/${state.tracks[cur.index].id}/stream?retry=1`);
      audio.src = r.url;
      audio.currentTime = resumeAt;
      audio.play().catch(() => {});
    } catch (e) {
      toast(e.message);
    }
  });
  seek.addEventListener('input', () => { audio.currentTime = Number(seek.value); });
  pBtn.addEventListener('click', () => {
    if (!audio.src) return;
    if (audio.paused) audio.play().catch(() => {});
    else audio.pause();
  });
  $('#trackList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-play]');
    if (b) playIndex(Number(b.dataset.play));
  });

  function stopPlayer() {
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    state.current = null;
    $('#player').hidden = true;
  }

  /* ---------- auth ---------- */

  const dlg = $('#authDialog');
  const form = $('#authForm');
  let authMode = 'register';

  function setAuthMode(mode) {
    authMode = mode;
    const reg = mode === 'register';
    $('#tabRegister').setAttribute('aria-selected', String(reg));
    $('#tabLogin').setAttribute('aria-selected', String(!reg));
    $('#nameField').hidden = !reg;
    form.password.autocomplete = reg ? 'new-password' : 'current-password';
    $('#authHint').hidden = !reg;
    $('#authSubmit').textContent = reg ? 'Create account' : 'Log in';
    $('#authError').textContent = '';
  }
  function openAuth(mode) {
    setAuthMode(mode);
    if (!dlg.open) dlg.showModal();
    (mode === 'register' ? form.name : form.phone).focus();
  }
  $('#tabRegister').addEventListener('click', () => setAuthMode('register'));
  $('#tabLogin').addEventListener('click', () => setAuthMode('login'));
  $('#loginBtn').addEventListener('click', () => openAuth('login'));
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#authError');
    const btn = $('#authSubmit');
    err.textContent = '';
    const payload = { phone: form.phone.value, password: form.password.value };
    if (authMode === 'register') payload.name = form.name.value;
    if ((authMode === 'register' && !payload.name.trim()) || !payload.phone.trim() || !payload.password) {
      err.textContent = 'Fill in every field.';
      return;
    }
    btn.disabled = true;
    try {
      const r = await api(authMode === 'register' ? '/api/register' : '/api/login', { json: payload });
      state.user = r.user;
      form.reset();
      dlg.close();
      renderAll();
      if (authMode === 'register') toast('Account created. Now pay to unlock the EP.');
      else toast(`Welcome back, ${r.user.name.split(' ')[0]}.`);
      scrollToEl(isApproved() ? '#tracks' : '#account');
    } catch (ex) {
      err.textContent = ex.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('#logoutBtn').addEventListener('click', async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* ignore */ }
    state.user = null;
    stopPlayer();
    renderAll();
    window.scrollTo({ top: 0 });
  });

  $('#heroCta').addEventListener('click', () => {
    const u = state.user;
    if (!u) openAuth('register');
    else scrollToEl(u.status === 'approved' ? '#tracks' : '#account');
  });

  /* ---------- payment submit ---------- */

  async function compressImage(file) {
    if (!file.type.startsWith('image/') || file.size < 800 * 1024) return file;
    try {
      const bmp = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(bmp.width * scale);
      canvas.height = Math.round(bmp.height * scale);
      canvas.getContext('2d').drawImage(bmp, 0, 0, canvas.width, canvas.height);
      const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.85));
      return blob && blob.size < file.size ? new File([blob], 'payment.jpg', { type: 'image/jpeg' }) : file;
    } catch {
      return file;
    }
  }

  async function submitPayment(e) {
    e.preventDefault();
    const f = e.currentTarget;
    const err = $('#payError');
    const btn = $('#paySubmit');
    err.textContent = '';
    const file = f.screenshot.files[0];
    const txn = f.transaction_id.value.trim();
    if (txn.length < 4) { err.textContent = 'Enter the transaction ID from your payment message.'; return; }
    if (!file) { err.textContent = 'Choose a screenshot of your payment.'; return; }
    btn.disabled = true;
    btn.textContent = 'Uploading...';
    try {
      const fd = new FormData();
      fd.append('method', f.method.value);
      fd.append('transaction_id', txn);
      fd.append('screenshot', await compressImage(file));
      await api('/api/payment', { body: fd });
      await refreshMe();
      toast('Sent. We will message you on WhatsApp.');
      scrollToEl('#account');
    } catch (ex) {
      err.textContent = ex.message;
      if (ex.status === 401) await refreshMe();
      btn.disabled = false;
      btn.textContent = 'Send for approval';
    }
  }

  /* ---------- boot ---------- */

  async function refreshMe() {
    try {
      state.user = (await api('/api/me')).user;
    } catch {
      state.user = null;
    }
    renderAll();
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.user && state.user.status === 'pending') refreshMe();
  });

  (async function init() {
    try {
      state.cfg = await api('/api/config');
    } catch (e) {
      document.body.innerHTML = `<p style="padding:2rem;font-family:sans-serif">${esc(e.message)}</p>`;
      return;
    }
    applyConfig();
    setAuthMode('register');
    const [tracks] = await Promise.all([api('/api/tracks').catch(() => ({ tracks: [] })), refreshMe()]);
    state.tracks = tracks.tracks || [];
    state.tracksLoaded = true;
    renderAll();
  })();
})();
