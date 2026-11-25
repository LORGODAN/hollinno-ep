require('dotenv').config({ quiet: true });
const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { ZipArchive } = require('archiver');
const fs = require('fs');
const { Readable } = require('stream');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const config = require('./config');

const {
  SUPABASE_URL,
  SUPABASE_SERVICE_KEY,
  JWT_SECRET,
  ADMIN_PHONE,
  ADMIN_PASSWORD,
  ADMIN_NAME = 'Admin',
  PORT = 3000,
  NODE_ENV,
} = process.env;
const isProd = NODE_ENV === 'production';

for (const [key, value] of Object.entries({ SUPABASE_URL, SUPABASE_SERVICE_KEY, JWT_SECRET })) {
  if (!value) {
    console.error(`Missing setting ${key}. Copy .env.example to .env and fill it in (or add it on Render).`);
    process.exit(1);
  }
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const supabaseOrigin = new URL(SUPABASE_URL).origin;

/* ---------- helpers ---------- */

const COOKIE = 'ep_session';
const AUDIO_TYPES = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.flac': 'audio/flac',
};
const isUuid = (s) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(s));
const body = (req) => req.body || {};
const bad = (res, message, status = 400) => res.status(status).json({ error: message });
const must = ({ data, error }) => {
  if (error) throw error;
  return data;
};
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// Malawi numbers: 0999 123 456, +265 999 123 456 and 265999123456 all become 265999123456.
function normalizePhone(input) {
  let d = String(input || '').replace(/\D/g, '');
  if (d.startsWith('00')) d = d.slice(2);
  if (!d.startsWith('265')) {
    if (d.startsWith('0')) d = '265' + d.slice(1);
    else if (d.length === 9) d = '265' + d;
  }
  return /^265\d{9}$/.test(d) ? d : null;
}

// Detect the real image type from the first bytes instead of trusting the file name.
function imageExt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.slice(0, 4).toString() === 'RIFF' && buf.slice(8, 12).toString() === 'WEBP') return 'webp';
  return null;
}

const safeName = (s) =>
  String(s).replace(/[^\p{L}\p{N} ._()'&-]+/gu, '').replace(/\s+/g, ' ').trim().slice(0, 120) || 'track';

const tempPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
  return Array.from(crypto.randomBytes(8), (b) => chars[b % chars.length]).join('');
};

const publicUser = (u) => ({
  id: u.id,
  name: u.name,
  phone: u.phone,
  role: u.role,
  status: u.status,
  reject_reason: u.reject_reason || null,
});

/* ---------- storage + admin setup ---------- */

async function ensureBuckets() {
  const existing = new Set(must(await supabase.storage.listBuckets()).map((b) => b.name));
  const wanted = [
    ['songs', false],
    ['screenshots', false],
    ['previews', true], // preview clips are public on purpose
  ];
  for (const [name, isPublic] of wanted) {
    if (!existing.has(name)) {
      const { error } = await supabase.storage.createBucket(name, { public: isPublic });
      if (error) throw error;
      console.log(`Created storage bucket "${name}"`);
    }
  }
}

async function seedAdmin() {
  if (!ADMIN_PHONE || !ADMIN_PASSWORD) {
    console.warn('ADMIN_PHONE / ADMIN_PASSWORD not set, so no admin account was created.');
    return;
  }
  const phone = normalizePhone(ADMIN_PHONE);
  if (!phone) throw new Error('ADMIN_PHONE is not a valid Malawi phone number.');
  const password_hash = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const existing = must(await supabase.from('ep_users').select('id').eq('phone', phone).maybeSingle());
  if (existing) {
    must(
      await supabase
        .from('ep_users')
        .update({ role: 'admin', status: 'approved', password_hash, reject_reason: null })
        .eq('id', existing.id)
    );
  } else {
    must(
      await supabase
        .from('ep_users')
        .insert({ name: ADMIN_NAME, phone, password_hash, role: 'admin', status: 'approved' })
    );
    console.log('Admin account created.');
  }
}

/* ---------- app + security ---------- */

const app = express();
app.set('trust proxy', 1); // Render sits behind a proxy
app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        'default-src': ["'self'"],
        'script-src': ["'self'"],
        'style-src': ["'self'", "'unsafe-inline'"],
        'img-src': ["'self'", 'data:', 'blob:', supabaseOrigin],
        'media-src': ["'self'", 'blob:', supabaseOrigin],
        'connect-src': ["'self'"],
        'object-src': ["'none'"],
        'frame-ancestors': ["'none'"],
        ...(isProd ? {} : { 'upgrade-insecure-requests': null }),
      },
    },
    crossOriginEmbedderPolicy: false,
  })
);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());
app.use('/api', (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 40, // generous: many phones share one mobile-network IP
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many attempts. Please wait a few minutes and try again.' },
});
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many uploads. Please try again later.' },
});

const imageUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 6 * 1024 * 1024, files: 1 },
});
const trackUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 45 * 1024 * 1024, files: 2 },
  fileFilter: (req, file, cb) => {
    const ok = Boolean(AUDIO_TYPES[path.extname(file.originalname).toLowerCase()]);
    if (!ok) req.badAudioType = true;
    cb(null, ok);
  },
});

/* ---------- auth middleware ---------- */

function setSession(res, user) {
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '30d' });
  res.cookie(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

const loadUser = wrap(async (req, res, next) => {
  const token = req.cookies && req.cookies[COOKIE];
  if (!token) return bad(res, 'Please log in.', 401);
  let payload;
  try {
    payload = jwt.verify(token, JWT_SECRET);
  } catch {
    return bad(res, 'Your session expired. Please log in again.', 401);
  }
  const user = must(
    await supabase
      .from('ep_users')
      .select('id,name,phone,role,status,reject_reason')
      .eq('id', payload.id)
      .maybeSingle()
  );
  if (!user) return bad(res, 'Account not found. Please log in again.', 401);
  req.user = user;
  next();
});
const requireApproved = (req, res, next) =>
  req.user.status === 'approved' ? next() : bad(res, 'Your access has not been approved yet.', 403);
const requireAdmin = (req, res, next) =>
  req.user.role === 'admin' ? next() : bad(res, 'Admin only.', 403);
const adminOnly = [loadUser, requireAdmin];

/* ---------- public + fan routes ---------- */

app.get(
  '/healthz',
  wrap(async (req, res) => {
    // A tiny database query: keeps Supabase's free project from pausing when this URL is pinged.
    must(await supabase.from('ep_users').select('id').limit(1));
    res.json({ ok: true });
  })
);

app.get('/api/config', (req, res) => {
  const { artist, ep, theme, payment, socials, messages, poweredBy } = config;
  res.json({ artist, ep, theme, payment, socials, messages, poweredBy });
});

app.post(
  '/api/register',
  authLimiter,
  wrap(async (req, res) => {
    const name = String(body(req).name || '').trim().replace(/\s+/g, ' ');
    const phone = normalizePhone(body(req).phone);
    const password = String(body(req).password || '');
    if (name.length < 2 || name.length > 60) return bad(res, 'Enter your full name.');
    if (!phone) return bad(res, 'Enter a valid Malawi phone number, for example 0999 123 456.');
    if (password.length < 6) return bad(res, 'Choose a password with at least 6 characters.');
    const password_hash = await bcrypt.hash(password, 10);
    const { data, error } = await supabase
      .from('ep_users')
      .insert({ name, phone, password_hash })
      .select('id,name,phone,role,status,reject_reason')
      .single();
    if (error) {
      if (error.code === '23505') return bad(res, 'This phone number is already registered. Please log in.', 409);
      throw error;
    }
    setSession(res, data);
    res.json({ user: publicUser(data) });
  })
);

app.post(
  '/api/login',
  authLimiter,
  wrap(async (req, res) => {
    const phone = normalizePhone(body(req).phone);
    const password = String(body(req).password || '');
    if (!phone || !password) return bad(res, 'Enter your phone number and password.');
    const user = must(await supabase.from('ep_users').select('*').eq('phone', phone).maybeSingle());
    const ok = user && (await bcrypt.compare(password, user.password_hash));
    if (!ok) return bad(res, 'Wrong phone number or password.', 401);
    setSession(res, user);
    res.json({ user: publicUser(user) });
  })
);

app.post('/api/logout', (req, res) => {
  res.clearCookie(COOKIE, { httpOnly: true, sameSite: 'lax', secure: isProd });
  res.json({ ok: true });
});

app.get('/api/me', loadUser, (req, res) => res.json({ user: publicUser(req.user) }));

app.post(
  '/api/payment',
  loadUser,
  uploadLimiter,
  imageUpload.single('screenshot'),
  wrap(async (req, res) => {
    const user = req.user;
    if (user.status === 'approved') return bad(res, 'You already have access.');
    if (user.status === 'pending') return bad(res, 'Your payment is already waiting for approval.');

    const method = String(body(req).method || '').trim();
    const transaction_id = String(body(req).transaction_id || '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '')
      .slice(0, 60);
    if (!config.payment.methods.some((m) => m.id === method)) return bad(res, 'Choose how you paid.');
    if (transaction_id.length < 4) return bad(res, 'Enter the transaction ID from your payment message.');
    if (!req.file) return bad(res, 'Upload a screenshot of your payment.');
    const ext = imageExt(req.file.buffer);
    if (!ext) return bad(res, 'That file is not a JPG, PNG or WebP image. Take a screenshot and try again.');

    const screenshot_path = `${user.id}/${Date.now()}.${ext}`;
    const { data: payment, error } = await supabase
      .from('ep_payments')
      .insert({ user_id: user.id, method, transaction_id, screenshot_path })
      .select('id')
      .single();
    if (error) {
      if (error.code === '23505')
        return bad(res, 'This transaction ID has already been used. Check the ID and try again.', 409);
      throw error;
    }
    const up = await supabase.storage
      .from('screenshots')
      .upload(screenshot_path, req.file.buffer, { contentType: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
    if (up.error) {
      await supabase.from('ep_payments').delete().eq('id', payment.id);
      throw up.error;
    }
    must(await supabase.from('ep_users').update({ status: 'pending', reject_reason: null }).eq('id', user.id));
    res.json({ ok: true });
  })
);

app.get(
  '/api/tracks',
  wrap(async (req, res) => {
    const rows = must(
      await supabase
        .from('ep_tracks')
        .select('id,title,position,preview_path')
        .order('position', { ascending: true })
        .order('created_at', { ascending: true })
    );
    res.json({
      tracks: rows.map((t) => ({
        id: t.id,
        title: t.title,
        position: t.position,
        preview_url: t.preview_path
          ? supabase.storage.from('previews').getPublicUrl(t.preview_path).data.publicUrl
          : null,
      })),
    });
  })
);

async function findTrack(id) {
  if (!isUuid(id)) return null;
  return must(await supabase.from('ep_tracks').select('*').eq('id', id).maybeSingle());
}

app.get(
  '/api/tracks/:id/stream',
  loadUser,
  requireApproved,
  wrap(async (req, res) => {
    const track = await findTrack(req.params.id);
    if (!track) return bad(res, 'Track not found.', 404);
    const { data, error } = await supabase.storage.from('songs').createSignedUrl(track.audio_path, 3600);
    if (error) throw error;
    // The admin's own test plays and a retry after an expired link are not counted.
    if (req.user.role !== 'admin' && !req.query.retry) {
      await supabase.from('ep_plays').insert({ user_id: req.user.id, track_id: track.id });
    }
    res.json({ url: data.signedUrl });
  })
);

app.get(
  '/api/tracks/:id/download',
  loadUser,
  requireApproved,
  wrap(async (req, res) => {
    const track = await findTrack(req.params.id);
    if (!track) return bad(res, 'Track not found.', 404);
    const filename = `${safeName(`${config.artist.name} - ${track.title}`)}${path.extname(track.audio_path)}`;
    const { data, error } = await supabase.storage
      .from('songs')
      .createSignedUrl(track.audio_path, 300, { download: filename });
    if (error) throw error;
    if (req.user.role !== 'admin') {
      await supabase.from('ep_downloads').insert({ user_id: req.user.id, track_id: track.id });
    }
    res.redirect(data.signedUrl);
  })
);

app.get(
  '/api/download-all',
  loadUser,
  requireApproved,
  wrap(async (req, res) => {
    const tracks = must(
      await supabase.from('ep_tracks').select('id,title,position,audio_path').order('position', { ascending: true })
    );
    if (!tracks.length) return bad(res, 'No songs have been added yet.', 404);

    // Get every link before sending headers, so a failure still returns a normal error.
    const items = [];
    for (const [i, t] of tracks.entries()) {
      const { data, error } = await supabase.storage.from('songs').createSignedUrl(t.audio_path, 900);
      if (error) throw error;
      const num = String(i + 1).padStart(2, '0');
      items.push({ url: data.signedUrl, name: `${num} - ${safeName(t.title)}${path.extname(t.audio_path)}`, id: t.id });
    }

    const zipName = safeName(`${config.artist.name} - ${config.ep.title}`) || 'EP';
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${zipName.replace(/[^\x20-\x7e]/g, '_')}.zip"; filename*=UTF-8''${encodeURIComponent(zipName)}.zip`
    );

    const archive = new ZipArchive({ store: true });
    archive.on('error', () => res.destroy());
    res.on('close', () => archive.abort());
    archive.pipe(res);

    const coverFile = path.join(__dirname, 'public', String(config.ep.cover || '').replace(/^\/+/, ''));
    if (config.ep.cover && fs.existsSync(coverFile)) {
      archive.file(coverFile, { name: `Cover${path.extname(coverFile)}` });
    }
    for (const it of items) {
      const r = await fetch(it.url);
      if (!r.ok || !r.body) {
        archive.abort();
        return res.destroy();
      }
      archive.append(Readable.fromWeb(r.body), { name: it.name });
    }

    if (req.user.role !== 'admin') {
      await supabase.from('ep_downloads').insert(items.map((it) => ({ user_id: req.user.id, track_id: it.id })));
    }
    await archive.finalize();
  })
);

/* ---------- admin routes ---------- */

app.get(
  '/api/admin/stats',
  ...adminOnly,
  wrap(async (req, res) => {
    const stats = must(await supabase.rpc('ep_admin_stats'));
    const tracks = must(await supabase.from('ep_track_stats').select('id,title,position,plays,downloads'));
    res.json({
      stats,
      tracks,
      price: config.ep.price,
      currency: config.ep.currency,
    });
  })
);

app.get(
  '/api/admin/payments',
  ...adminOnly,
  wrap(async (req, res) => {
    const status = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
    const rows = must(
      await supabase
        .from('ep_payments')
        .select('id,method,transaction_id,screenshot_path,status,reject_reason,created_at,reviewed_at,ep_users(name,phone)')
        .eq('status', status)
        .order('created_at', { ascending: status === 'pending' }) // oldest waiting first
        .limit(200)
    );
    const urls = {};
    if (rows.length) {
      const { data: signed } = await supabase.storage
        .from('screenshots')
        .createSignedUrls(rows.map((r) => r.screenshot_path), 3600);
      (signed || []).forEach((s) => {
        if (s.signedUrl) urls[s.path] = s.signedUrl;
      });
    }
    const methodLabel = Object.fromEntries(config.payment.methods.map((m) => [m.id, m.label]));
    res.json({
      payments: rows.map((r) => ({
        id: r.id,
        method: methodLabel[r.method] || r.method,
        transaction_id: r.transaction_id,
        status: r.status,
        reject_reason: r.reject_reason,
        created_at: r.created_at,
        reviewed_at: r.reviewed_at,
        name: r.ep_users ? r.ep_users.name : '(deleted user)',
        phone: r.ep_users ? r.ep_users.phone : '',
        screenshot_url: urls[r.screenshot_path] || null,
      })),
    });
  })
);

app.post(
  '/api/admin/payments/:id/approve',
  ...adminOnly,
  wrap(async (req, res) => {
    if (!isUuid(req.params.id)) return bad(res, 'Payment not found.', 404);
    const payment = must(
      await supabase.from('ep_payments').select('id,user_id,status').eq('id', req.params.id).maybeSingle()
    );
    if (!payment) return bad(res, 'Payment not found.', 404);
    const now = new Date().toISOString();
    must(
      await supabase
        .from('ep_payments')
        .update({ status: 'approved', reviewed_at: now, reject_reason: null })
        .eq('id', payment.id)
    );
    must(
      await supabase
        .from('ep_users')
        .update({ status: 'approved', approved_at: now, reject_reason: null })
        .eq('id', payment.user_id)
    );
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/payments/:id/reject',
  ...adminOnly,
  wrap(async (req, res) => {
    if (!isUuid(req.params.id)) return bad(res, 'Payment not found.', 404);
    const reason = String(body(req).reason || '').trim().slice(0, 200) || 'We could not confirm your payment.';
    const payment = must(
      await supabase.from('ep_payments').select('id,user_id,status').eq('id', req.params.id).maybeSingle()
    );
    if (!payment) return bad(res, 'Payment not found.', 404);
    must(
      await supabase
        .from('ep_payments')
        .update({ status: 'rejected', reviewed_at: new Date().toISOString(), reject_reason: reason })
        .eq('id', payment.id)
    );
    must(
      await supabase
        .from('ep_users')
        .update({ status: 'rejected', reject_reason: reason })
        .eq('id', payment.user_id)
        .neq('status', 'approved')
    );
    res.json({ ok: true, reason });
  })
);

app.get(
  '/api/admin/users',
  ...adminOnly,
  wrap(async (req, res) => {
    const users = must(
      await supabase
        .from('ep_user_overview')
        .select('id,name,phone,status,reject_reason,created_at,approved_at')
        .order('created_at', { ascending: false })
    );
    res.json({ users });
  })
);

app.post(
  '/api/admin/users/:id/revoke',
  ...adminOnly,
  wrap(async (req, res) => {
    if (!isUuid(req.params.id)) return bad(res, 'Fan not found.', 404);
    const reason = 'Your access was removed by the admin.';
    const updated = must(
      await supabase
        .from('ep_users')
        .update({ status: 'rejected', reject_reason: reason })
        .eq('id', req.params.id)
        .eq('role', 'user')
        .select('id')
    );
    if (!updated.length) return bad(res, 'Fan not found.', 404);
    res.json({ ok: true });
  })
);

app.post(
  '/api/admin/users/:id/reset-password',
  ...adminOnly,
  wrap(async (req, res) => {
    if (!isUuid(req.params.id)) return bad(res, 'Fan not found.', 404);
    const password = tempPassword();
    const password_hash = await bcrypt.hash(password, 10);
    const updated = must(
      await supabase
        .from('ep_users')
        .update({ password_hash })
        .eq('id', req.params.id)
        .eq('role', 'user')
        .select('name,phone')
    );
    if (!updated.length) return bad(res, 'Fan not found.', 404);
    res.json({ password, name: updated[0].name, phone: updated[0].phone });
  })
);

app.get(
  '/api/admin/tracks',
  ...adminOnly,
  wrap(async (req, res) => {
    const tracks = must(await supabase.from('ep_track_stats').select('id,title,position,preview_path,plays,downloads'));
    res.json({ tracks: tracks.map((t) => ({ ...t, has_preview: Boolean(t.preview_path), preview_path: undefined })) });
  })
);

app.post(
  '/api/admin/tracks',
  ...adminOnly,
  uploadLimiter,
  trackUpload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'preview', maxCount: 1 },
  ]),
  wrap(async (req, res) => {
    if (req.badAudioType) return bad(res, 'Use MP3, M4A, AAC, WAV, OGG or FLAC audio files.');
    const title = String(body(req).title || '').trim().slice(0, 100);
    const audio = req.files && req.files.audio && req.files.audio[0];
    const preview = req.files && req.files.preview && req.files.preview[0];
    if (!title) return bad(res, 'Enter the track title.');
    if (!audio) return bad(res, 'Choose the full song file.');

    let position = parseInt(body(req).position, 10);
    if (!Number.isFinite(position) || position < 1) {
      const last = must(
        await supabase.from('ep_tracks').select('position').order('position', { ascending: false }).limit(1)
      );
      position = (last[0] ? last[0].position : 0) + 1;
    }

    const audioExt = path.extname(audio.originalname).toLowerCase();
    const audioPath = `${crypto.randomUUID()}${audioExt}`;
    const up = await supabase.storage
      .from('songs')
      .upload(audioPath, audio.buffer, { contentType: AUDIO_TYPES[audioExt] });
    if (up.error) throw up.error;

    let previewPath = null;
    if (preview) {
      const pExt = path.extname(preview.originalname).toLowerCase();
      previewPath = `${crypto.randomUUID()}${pExt}`;
      const upP = await supabase.storage
        .from('previews')
        .upload(previewPath, preview.buffer, { contentType: AUDIO_TYPES[pExt] });
      if (upP.error) {
        await supabase.storage.from('songs').remove([audioPath]);
        throw upP.error;
      }
    }

    const { error } = await supabase
      .from('ep_tracks')
      .insert({ title, position, audio_path: audioPath, preview_path: previewPath });
    if (error) {
      await supabase.storage.from('songs').remove([audioPath]);
      if (previewPath) await supabase.storage.from('previews').remove([previewPath]);
      throw error;
    }
    res.json({ ok: true });
  })
);

app.delete(
  '/api/admin/tracks/:id',
  ...adminOnly,
  wrap(async (req, res) => {
    const track = await findTrack(req.params.id);
    if (!track) return bad(res, 'Track not found.', 404);
    await supabase.storage.from('songs').remove([track.audio_path]);
    if (track.preview_path) await supabase.storage.from('previews').remove([track.preview_path]);
    must(await supabase.from('ep_tracks').delete().eq('id', track.id));
    res.json({ ok: true });
  })
);

/* ---------- static site + errors ---------- */

app.use('/api', (req, res) => bad(res, 'Not found.', 404));
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'], maxAge: isProd ? '1h' : 0 }));

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return bad(res, err.code === 'LIMIT_FILE_SIZE' ? 'That file is too large.' : 'Upload failed. Please try again.');
  }
  if (err && err.type === 'entity.parse.failed') return bad(res, 'Bad request.');
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side. Please try again.' });
});

(async () => {
  try {
    await ensureBuckets();
    await seedAdmin();
  } catch (e) {
    console.error(
      'Setup problem. Check your Supabase URL and service key, and that schema.sql was run:',
      e && e.message ? e.message : e
    );
  }
  app.listen(PORT, () => console.log(`EP site running on port ${PORT}`));
})();
