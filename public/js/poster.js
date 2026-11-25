/* Thank-you poster maker.
 * Everything happens in the fan's browser: the photo is drawn onto a canvas and saved as an image.
 * The photo is never uploaded to the server. */
(() => {
  'use strict';

  const W = 1080;
  const H = 1920;
  const FRAME = { x: 90, y: 500, w: 900, h: 830 };
  const SERIF = '"Instrument Serif", Georgia, serif';
  const SANS = 'system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

  const S = {
    mounted: false, userId: null, cfg: null, toast: () => {},
    img: null, zoom: 1, ox: 0, oy: 0, bw: true, name: '', nameTouched: false,
    cover: null, raf: 0, fontsReady: false,
    el: {},
  };

  const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const slug = (s) => String(s || 'poster').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'poster';
  const dims = (im) => ({ w: im.naturalWidth || im.width, h: im.naturalHeight || im.height });

  /* ---------- drawing ---------- */

  function fitFont(ctx, text, maxW, startSize, weight, family) {
    let size = startSize;
    ctx.font = `${weight} ${size}px ${family}`;
    while (size > 30 && ctx.measureText(text).width > maxW) {
      size -= 4;
      ctx.font = `${weight} ${size}px ${family}`;
    }
  }

  function toGrayscale(ctx, x, y, w, h) {
    const data = ctx.getImageData(x, y, w, h);
    const p = data.data;
    for (let i = 0; i < p.length; i += 4) {
      let v = 0.299 * p[i] + 0.587 * p[i + 1] + 0.114 * p[i + 2];
      v = (v - 128) * 1.12 + 132;
      v = v < 0 ? 0 : v > 255 ? 255 : v;
      p[i] = p[i + 1] = p[i + 2] = v;
    }
    ctx.putImageData(data, x, y);
  }

  function drawPhoto(ctx) {
    const { x, y, w, h } = FRAME;
    if (S.img) {
      const { w: iw, h: ih } = dims(S.img);
      const scale = Math.max(w / iw, h / ih) * S.zoom;
      const dw = iw * scale;
      const dh = ih * scale;
      const maxX = Math.max(0, (dw - w) / 2);
      const maxY = Math.max(0, (dh - h) / 2);
      S.ox = clamp(S.ox, -maxX, maxX);
      S.oy = clamp(S.oy, -maxY, maxY);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, w, h);
      ctx.clip();
      ctx.drawImage(S.img, x + (w - dw) / 2 + S.ox, y + (h - dh) / 2 + S.oy, dw, dh);
      ctx.restore();
      if (S.bw) toGrayscale(ctx, x, y, w, h);
    } else {
      ctx.fillStyle = '#101010';
      ctx.fillRect(x, y, w, h);
      ctx.save();
      ctx.setLineDash([16, 14]);
      ctx.strokeStyle = 'rgba(255,255,255,0.35)';
      ctx.lineWidth = 3;
      ctx.strokeRect(x + 30, y + 30, w - 60, h - 60);
      ctx.restore();
      ctx.fillStyle = 'rgba(237,237,237,0.7)';
      ctx.textAlign = 'center';
      ctx.font = `italic 84px ${SERIF}`;
      ctx.fillText('Your photo here', x + w / 2, y + h / 2 + 24);
      ctx.textAlign = 'left';
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
  }

  function draw() {
    S.raf = 0;
    const ctx = S.ctx;
    const cfg = S.cfg;
    if (!ctx || !cfg) return;
    const muted = 'rgba(237,237,237,0.72)';

    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    const glow = ctx.createRadialGradient(540, 900, 60, 540, 900, 880);
    glow.addColorStop(0, 'rgba(255,255,255,0.20)');
    glow.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, W, H);

    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#ededed';
    ctx.font = `italic 112px ${SERIF}`;
    ctx.fillText('Thank you,', 90, 230);
    const name = S.name.trim() || 'friend';
    fitFont(ctx, name, 900, 200, 'normal', SERIF);
    ctx.fillText(name, 90, 420);

    drawPhoto(ctx);

    ctx.fillStyle = muted;
    ctx.font = `500 52px ${SANS}`;
    ctx.fillText('for getting', 90, 1425);
    ctx.fillStyle = '#ededed';
    fitFont(ctx, cfg.ep.title, 900, 150, 'normal', SERIF);
    ctx.fillText(cfg.ep.title, 90, 1555);
    ctx.fillStyle = muted;
    ctx.font = `500 52px ${SANS}`;
    ctx.fillText(`the new EP by ${cfg.artist.name}`, 90, 1632);

    ctx.fillStyle = 'rgba(255,255,255,0.2)';
    ctx.fillRect(90, 1690, 900, 2);
    if (S.cover && S.cover.complete && S.cover.naturalWidth) ctx.drawImage(S.cover, 90, 1728, 150, 150);
    ctx.fillStyle = muted;
    ctx.font = `500 40px ${SANS}`;
    ctx.fillText('Stream and download at', 272, 1775);
    ctx.fillStyle = '#ededed';
    fitFont(ctx, location.host, 718, 58, '700', SANS);
    ctx.fillText(location.host, 272, 1845);
  }

  function schedule() {
    if (!S.raf) S.raf = requestAnimationFrame(draw);
  }

  /* ---------- photo loading ---------- */

  function downscale(im) {
    const { w, h } = dims(im);
    const longest = Math.max(w, h);
    if (longest <= 2000) return im;
    const k = 2000 / longest;
    const c = document.createElement('canvas');
    c.width = Math.round(w * k);
    c.height = Math.round(h * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    return c;
  }

  function loadUrl(url) {
    return new Promise((resolve, reject) => {
      const im = new Image();
      im.onload = () => {
        S.img = downscale(im);
        S.zoom = 1;
        S.ox = 0;
        S.oy = 0;
        S.el.zoom.value = '1';
        S.el.zoom.disabled = false;
        S.el.save.disabled = false;
        S.el.drag.hidden = false;
        S.el.hint.textContent = 'Drag the photo to move it. Use the slider to zoom.';
        schedule();
        resolve();
      };
      im.onerror = () => reject(new Error('That photo could not be opened. Try a JPG or PNG photo.'));
      im.src = url;
    });
  }

  /* ---------- saving and sharing ---------- */

  function toBlob() {
    return new Promise((resolve) => S.el.canvas.toBlob(resolve, 'image/jpeg', 0.92));
  }
  const fileName = () => `${slug(S.cfg.artist.name)}-thank-you.jpg`;

  async function save() {
    if (!S.img) return;
    draw();
    const blob = await toBlob();
    if (!blob) {
      S.toast('Could not make the poster. Try a smaller photo.');
      return;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = fileName();
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
    S.toast('Poster saved. Now post it on your status!');
  }

  async function share() {
    if (!S.img) return;
    draw();
    const blob = await toBlob();
    if (!blob) return;
    const file = new File([blob], fileName(), { type: 'image/jpeg' });
    try {
      await navigator.share({
        files: [file],
        text: `I just got ${S.cfg.ep.title} by ${S.cfg.artist.name}. Get yours: ${location.origin}`,
      });
    } catch (e) {
      if (e && e.name !== 'AbortError') S.toast('Could not open sharing. Use Download poster instead.');
    }
  }

  const canShareFiles = () => {
    try {
      return Boolean(navigator.share && navigator.canShare && navigator.canShare({ files: [new File(['x'], 'a.jpg', { type: 'image/jpeg' })] }));
    } catch {
      return false;
    }
  };

  /* ---------- UI ---------- */

  function build(root) {
    root.innerHTML = `
      <div class="poster-wrap">
        <label>Your photo
          <input type="file" id="posterFile" accept="image/*">
        </label>
        <div class="poster-preview">
          <canvas id="posterCanvas" width="${W}" height="${H}" role="img" aria-label="Preview of your thank-you poster"></canvas>
          <div class="poster-drag" id="posterDrag" hidden></div>
        </div>
        <label>Zoom
          <input type="range" id="posterZoom" min="1" max="3" step="0.01" value="1" disabled>
        </label>
        <label class="check"><input type="checkbox" id="posterBw" checked> Black and white, like the cover</label>
        <label>Name on the poster
          <input type="text" id="posterName" maxlength="24" autocomplete="off">
        </label>
        <p class="hint" id="posterHint">Choose a photo first, then drag it inside the frame to place your face.</p>
        <div class="poster-actions">
          <button class="btn btn-primary" id="posterSave" type="button" disabled>Download poster</button>
          <button class="btn btn-quiet" id="posterShare" type="button" hidden>Share to status</button>
        </div>
      </div>`;
    const q = (id) => root.querySelector(id);
    S.el = {
      file: q('#posterFile'), canvas: q('#posterCanvas'), drag: q('#posterDrag'), zoom: q('#posterZoom'),
      bw: q('#posterBw'), name: q('#posterName'), hint: q('#posterHint'), save: q('#posterSave'), share: q('#posterShare'),
    };
    S.ctx = S.el.canvas.getContext('2d', { willReadFrequently: true });
    S.el.name.value = S.name;
    S.el.bw.checked = S.bw;
    S.el.share.hidden = !canShareFiles();

    let lastUrl = null;
    S.el.file.addEventListener('change', async () => {
      const f = S.el.file.files[0];
      if (!f) return;
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(f);
      try {
        await loadUrl(lastUrl);
      } catch (e) {
        S.toast(e.message);
      }
    });
    S.el.zoom.addEventListener('input', () => { S.zoom = Number(S.el.zoom.value); schedule(); });
    S.el.bw.addEventListener('change', () => { S.bw = S.el.bw.checked; schedule(); });
    S.el.name.addEventListener('input', () => { S.name = S.el.name.value; S.nameTouched = true; schedule(); });
    S.el.save.addEventListener('click', save);
    S.el.share.addEventListener('click', share);

    let last = null;
    const drag = S.el.drag;
    drag.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      drag.setPointerCapture(e.pointerId);
      last = { x: e.clientX, y: e.clientY };
    });
    drag.addEventListener('pointermove', (e) => {
      if (!last) return;
      const k = W / S.el.canvas.getBoundingClientRect().width;
      S.ox += (e.clientX - last.x) * k;
      S.oy += (e.clientY - last.y) * k;
      last = { x: e.clientX, y: e.clientY };
      schedule();
    });
    const end = () => { last = null; };
    drag.addEventListener('pointerup', end);
    drag.addEventListener('pointercancel', end);
  }

  function ensureAssets() {
    const fonts = document.fonts && document.fonts.load
      ? Promise.all([
          document.fonts.load(`112px ${SERIF}`),
          document.fonts.load(`italic 112px ${SERIF}`),
          document.fonts.load(`700 40px ${SANS}`),
        ]).catch(() => {})
      : Promise.resolve();
    if (!S.cover && S.cfg.ep.cover) {
      S.cover = new Image();
      S.cover.onload = schedule;
      S.cover.src = S.cfg.ep.cover;
    }
    fonts.then(() => { S.fontsReady = true; schedule(); });
  }

  window.EPPoster = {
    mount(root, { cfg, user, toast }) {
      S.cfg = cfg;
      S.toast = toast || (() => {});
      if (S.userId !== user.id) {
        // A different person is using the page: start fresh so nobody sees someone else's photo.
        S.userId = user.id;
        S.img = null;
        S.zoom = 1;
        S.ox = 0;
        S.oy = 0;
        S.nameTouched = false;
        S.mounted = false;
      }
      if (!S.nameTouched) S.name = firstName(user.name);
      if (!S.mounted) {
        build(root);
        S.mounted = true;
        ensureAssets();
      } else if (S.el.name) {
        S.el.name.value = S.name;
      }
      schedule();
    },
    loadUrl, // used for testing with a sample image
    get canvas() { return S.el.canvas; },
  };
})();
