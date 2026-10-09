const express = require('express');
const multer = require('multer');
const crypto = require('node:crypto');
const path = require('node:path');
const fs = require('node:fs');
const { db, tx, DATA_DIR } = require('./db');
const LMSR = require('./public/lmsr');

const PORT = process.env.PORT || 3000;
const PROD = process.env.NODE_ENV === 'production';
const START_POINTS = 1000;
const SESSION_DAYS = 30;
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(UPLOAD_DIR, { maxAge: '7d' }));

// ---------- helpers ----------

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new HttpError(status, message); };

const IMAGE_TYPES = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOAD_DIR,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + IMAGE_TYPES[file.mimetype]),
  }),
  limits: { fileSize: 3 * 1024 * 1024, files: 30 },
  fileFilter: (req, file, cb) => cb(IMAGE_TYPES[file.mimetype] ? null : new HttpError(400, 'Images must be PNG, JPG, WEBP or GIF'), true),
});
const fileUrl = (f) => (f ? '/uploads/' + f.filename : null);
function removeUpload(url) {
  if (url && url.startsWith('/uploads/')) fs.rm(path.join(UPLOAD_DIR, path.basename(url)), { force: true }, () => {});
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`;
}
function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(password, salt, 64);
  return crypto.timingSafeEqual(candidate, Buffer.from(hash, 'hex'));
}

function str(v, max, { required = false, name = 'Field' } = {}) {
  const s = typeof v === 'string' ? v.trim() : '';
  if (required && !s) fail(400, `${name} is required`);
  if (s.length > max) fail(400, `${name} is too long`);
  return s;
}
const round = (n) => Math.round(n * 1e6) / 1e6;

// ---------- sessions ----------

function readCookie(req, name) {
  const match = (req.headers.cookie || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return match ? decodeURIComponent(match.slice(name.length + 1)) : null;
}

function startSession(res, userId) {
  const token = crypto.randomBytes(32).toString('hex');
  db.prepare('INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)')
    .run(token, userId, Date.now() + SESSION_DAYS * 864e5);
  res.cookie('sid', token, { httpOnly: true, sameSite: 'lax', secure: PROD, maxAge: SESSION_DAYS * 864e5 });
}

app.use((req, res, next) => {
  const token = readCookie(req, 'sid');
  req.user = token
    ? db.prepare(`SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
                  WHERE s.token = ? AND s.expires_at > ?`).get(token, Date.now())
    : null;
  next();
});

// Cross-site form posts can't set custom headers, so this blocks CSRF.
app.use('/api', (req, res, next) => {
  if (req.method !== 'GET' && req.get('X-Requested-With') !== 'fetch') return res.status(403).json({ error: 'Bad request origin' });
  next();
});

const requireUser = (req, res, next) => (req.user ? next() : res.status(401).json({ error: 'Please log in' }));
const requireAdmin = (req, res, next) => (req.user?.is_admin ? next() : res.status(403).json({ error: 'Admins only' }));

const publicUser = (u) => u && {
  id: u.id, name: u.name, username: u.username, email: u.email, birthdate: u.birthdate,
  avatar: u.avatar, points: round(u.points), isAdmin: !!u.is_admin, createdAt: u.created_at,
};

// Tiny in-memory throttle for login/signup attempts.
const attempts = new Map();
function throttle(req, res, next) {
  const key = req.ip;
  const now = Date.now();
  const list = (attempts.get(key) || []).filter((t) => now - t < 15 * 60e3);
  if (list.length >= 20) return res.status(429).json({ error: 'Too many attempts, try again in a few minutes' });
  list.push(now);
  attempts.set(key, list);
  next();
}

// ---------- market helpers ----------

function loadOutcomes(marketId) {
  return db.prepare('SELECT * FROM outcomes WHERE market_id = ? ORDER BY position').all(marketId);
}

function marketView(m, { withHistory = false } = {}) {
  const outcomes = loadOutcomes(m.id);
  const p = LMSR.prices(outcomes.map((o) => o.shares), m.liquidity);
  const stats = db.prepare(`SELECT COALESCE(SUM(points), 0) AS volume, COUNT(DISTINCT user_id) AS voters
                            FROM trades WHERE market_id = ?`).get(m.id);
  const view = {
    id: m.id, title: m.title, description: m.description, category: m.category, image: m.image,
    endDate: m.end_date, liquidity: m.liquidity, status: m.status, resolvedOutcomeId: m.resolved_outcome_id,
    createdAt: m.created_at, volume: round(stats.volume), voters: stats.voters,
    closed: m.status !== 'open' || (m.end_date && new Date(m.end_date + 'T23:59:59') < new Date()),
    outcomes: outcomes.map((o, i) => ({ id: o.id, label: o.label, image: o.image, shares: o.shares, price: p[i] })),
  };
  if (withHistory) {
    view.history = db.prepare('SELECT ts, prices FROM price_history WHERE market_id = ? ORDER BY ts').all(m.id)
      .map((h) => ({ ts: h.ts, prices: JSON.parse(h.prices) }));
  }
  return view;
}

function snapshotPrices(marketId) {
  const m = db.prepare('SELECT liquidity FROM markets WHERE id = ?').get(marketId);
  const p = LMSR.prices(loadOutcomes(marketId).map((o) => o.shares), m.liquidity);
  db.prepare('INSERT INTO price_history (market_id, ts, prices) VALUES (?, ?, ?)').run(marketId, Date.now(), JSON.stringify(p));
}

function addPosition(userId, outcomeId, delta) {
  db.prepare(`INSERT INTO positions (user_id, outcome_id, shares) VALUES (?, ?, ?)
              ON CONFLICT (user_id, outcome_id) DO UPDATE SET shares = MAX(0, shares + excluded.shares)`)
    .run(userId, outcomeId, delta);
}

// ---------- auth routes ----------

app.post('/api/signup', throttle, upload.single('avatar'), (req, res) => {
  const b = req.body;
  const name = str(b.name, 80, { required: true, name: 'Full name' });
  const username = str(b.username, 30, { required: true, name: 'Username' });
  const email = str(b.email, 200, { required: true, name: 'Email' }).toLowerCase();
  const birthdate = str(b.birthdate, 10);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!/^[a-zA-Z0-9_.]{3,30}$/.test(username)) fail(400, 'Username: 3–30 letters, numbers, _ or .');
  if (/^admin/i.test(username)) fail(400, 'That username is reserved');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail(400, 'Enter a valid email');
  if (birthdate && !/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) fail(400, 'Invalid birth date');
  if (password.length < 8) fail(400, 'Password must be at least 8 characters');
  if (db.prepare('SELECT 1 FROM users WHERE email = ? OR username = ?').get(email, username)) {
    fail(409, 'That email or username is already taken');
  }
  const { lastInsertRowid } = db.prepare(`INSERT INTO users (name, username, email, birthdate, avatar, password_hash, points)
                                         VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(name, username, email, birthdate || null, fileUrl(req.file), hashPassword(password), START_POINTS);
  startSession(res, Number(lastInsertRowid));
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(lastInsertRowid)) });
});

app.post('/api/login', throttle, (req, res) => {
  const email = str(req.body.email, 200).toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE email = ? OR username = ?').get(email, email);
  if (!user || !checkPassword(String(req.body.password || ''), user.password_hash)) fail(401, 'Wrong email or password');
  startSession(res, user.id);
  res.json({ user: publicUser(user) });
});

app.post('/api/logout', (req, res) => {
  const token = readCookie(req, 'sid');
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('sid');
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json({ user: publicUser(req.user) }));

app.post('/api/me/avatar', requireUser, upload.single('avatar'), (req, res) => {
  if (!req.file) fail(400, 'Choose an image');
  removeUpload(req.user.avatar);
  db.prepare('UPDATE users SET avatar = ? WHERE id = ?').run(fileUrl(req.file), req.user.id);
  res.json({ user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

// Only the logged-in user can see their own votes.
app.get('/api/me/votes', requireUser, (req, res) => {
  const positions = db.prepare(`
    SELECT p.shares, o.id AS outcome_id, o.label, m.id AS market_id
    FROM positions p JOIN outcomes o ON o.id = p.outcome_id JOIN markets m ON m.id = o.market_id
    WHERE p.user_id = ? AND p.shares > 1e-9 ORDER BY m.id DESC`).all(req.user.id);
  const markets = new Map();
  const result = positions.map((p) => {
    if (!markets.has(p.market_id)) markets.set(p.market_id, marketView(db.prepare('SELECT * FROM markets WHERE id = ?').get(p.market_id)));
    const m = markets.get(p.market_id);
    const o = m.outcomes.find((x) => x.id === p.outcome_id);
    const spent = db.prepare(`SELECT COALESCE(SUM(CASE side WHEN 'buy' THEN points ELSE -points END), 0) AS net
                              FROM trades WHERE user_id = ? AND outcome_id = ?`).get(req.user.id, p.outcome_id).net;
    return {
      market: { id: m.id, title: m.title, image: m.image, status: m.status, resolvedOutcomeId: m.resolvedOutcomeId },
      outcome: { id: o.id, label: o.label, price: o.price },
      shares: round(p.shares), value: round(p.shares * o.price), netSpent: round(spent),
    };
  });
  const history = db.prepare(`
    SELECT t.id, t.side, t.shares, t.points, t.price_after, t.created_at, o.label, m.id AS market_id, m.title, m.image
    FROM trades t JOIN outcomes o ON o.id = t.outcome_id JOIN markets m ON m.id = t.market_id
    WHERE t.user_id = ? ORDER BY t.id DESC LIMIT 200`).all(req.user.id);
  res.json({ positions: result, history });
});

// ---------- public market routes ----------

app.get('/api/markets', (req, res) => {
  const q = str(req.query.q, 100);
  const category = str(req.query.category, 50);
  let rows = db.prepare('SELECT * FROM markets ORDER BY (status = \'open\') DESC, id DESC').all();
  if (q) rows = rows.filter((m) => m.title.toLowerCase().includes(q.toLowerCase()));
  if (category && category !== 'All') rows = rows.filter((m) => m.category === category);
  const categories = db.prepare('SELECT DISTINCT category FROM markets ORDER BY category').all().map((r) => r.category);
  res.json({ markets: rows.map((m) => marketView(m)), categories });
});

app.get('/api/markets/:id', (req, res) => {
  const m = db.prepare('SELECT * FROM markets WHERE id = ?').get(Number(req.params.id));
  if (!m) fail(404, 'Market not found');
  const view = marketView(m, { withHistory: true });
  if (req.user) {
    view.myPositions = db.prepare(`SELECT p.outcome_id AS outcomeId, p.shares FROM positions p
                                   JOIN outcomes o ON o.id = p.outcome_id WHERE p.user_id = ? AND o.market_id = ?`)
      .all(req.user.id, m.id);
  }
  view.recent = db.prepare(`SELECT t.side, t.shares, t.points, t.created_at, o.label, u.username, u.avatar
                            FROM trades t JOIN outcomes o ON o.id = t.outcome_id JOIN users u ON u.id = t.user_id
                            WHERE t.market_id = ? ORDER BY t.id DESC LIMIT 15`).all(m.id);
  res.json({ market: view });
});

app.post('/api/markets/:id/trade', requireUser, (req, res) => {
  const marketId = Number(req.params.id);
  const outcomeId = Number(req.body.outcomeId);
  const side = req.body.side === 'sell' ? 'sell' : 'buy';
  const value = Number(req.body.amount);
  if (!Number.isFinite(value) || value <= 0 || value > 1e6) fail(400, 'Enter a positive amount');

  const result = tx(() => {
    const m = db.prepare('SELECT * FROM markets WHERE id = ?').get(marketId);
    if (!m) fail(404, 'Market not found');
    if (marketView(m).closed) fail(400, 'This market is closed');
    const outcomes = loadOutcomes(marketId);
    const i = outcomes.findIndex((o) => o.id === outcomeId);
    if (i < 0) fail(400, 'Pick an outcome');
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
    const held = db.prepare('SELECT shares FROM positions WHERE user_id = ? AND outcome_id = ?').get(user.id, outcomeId)?.shares || 0;

    if (side === 'buy' && value > user.points + 1e-9) fail(400, 'Not enough points');
    if (side === 'sell' && value > held + 1e-9) fail(400, 'You don\'t have that many shares');

    const q = outcomes.map((o) => o.shares);
    const quote = LMSR.quote(q, m.liquidity, i, side, Math.min(value, side === 'sell' ? held : value));
    const signed = side === 'buy' ? quote.shares : -quote.shares;

    db.prepare('UPDATE outcomes SET shares = shares + ? WHERE id = ?').run(signed, outcomeId);
    addPosition(user.id, outcomeId, signed);
    db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(side === 'buy' ? -quote.points : quote.points, user.id);
    db.prepare(`INSERT INTO trades (user_id, market_id, outcome_id, side, shares, points, price_after)
                VALUES (?, ?, ?, ?, ?, ?, ?)`).run(user.id, marketId, outcomeId, side, quote.shares, quote.points, quote.priceAfter);
    snapshotPrices(marketId);
    return quote;
  });
  res.json({ trade: result, user: publicUser(db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id)) });
});

app.get('/api/leaderboard', (req, res) => {
  res.json({
    users: db.prepare('SELECT username, avatar, points FROM users WHERE is_admin = 0 ORDER BY points DESC LIMIT 20').all()
      .map((u) => ({ ...u, points: round(u.points) })),
  });
});

// ---------- admin routes ----------

app.post('/api/admin/markets', requireAdmin, upload.any(), (req, res) => {
  const b = req.body;
  const files = Object.fromEntries((req.files || []).map((f) => [f.fieldname, f]));
  const title = str(b.title, 200, { required: true, name: 'Title' });
  const description = str(b.description, 5000);
  const category = str(b.category, 50) || 'General';
  const endDate = str(b.endDate, 10);
  if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) fail(400, 'Invalid end date');
  const liquidity = Number(b.liquidity) || 100;
  if (liquidity < 10 || liquidity > 100000) fail(400, 'Liquidity must be between 10 and 100000');

  let labels = (Array.isArray(b.outcomes) ? b.outcomes : [b.outcomes]).map((l) => str(l, 100)).filter(Boolean);
  if (b.type === 'binary') labels = ['Yes', 'No'];
  if (labels.length < 2) fail(400, 'Add at least two options');
  if (labels.length > 20) fail(400, 'At most 20 options');

  const id = tx(() => {
    const { lastInsertRowid } = db.prepare(`INSERT INTO markets (title, description, category, image, end_date, liquidity)
                                           VALUES (?, ?, ?, ?, ?, ?)`)
      .run(title, description, category, fileUrl(files.image), endDate || null, liquidity);
    const marketId = Number(lastInsertRowid);
    labels.forEach((label, i) => {
      db.prepare('INSERT INTO outcomes (market_id, label, image, position) VALUES (?, ?, ?, ?)')
        .run(marketId, label, b.type === 'binary' ? null : fileUrl(files['outcomeImage' + i]), i);
    });
    snapshotPrices(marketId);
    return marketId;
  });
  res.json({ market: marketView(db.prepare('SELECT * FROM markets WHERE id = ?').get(id)) });
});

app.post('/api/admin/markets/:id/resolve', requireAdmin, (req, res) => {
  tx(() => {
    const m = db.prepare('SELECT * FROM markets WHERE id = ?').get(Number(req.params.id));
    if (!m) fail(404, 'Market not found');
    if (m.status !== 'open') fail(400, 'Already resolved');
    const winner = loadOutcomes(m.id).find((o) => o.id === Number(req.body.outcomeId));
    if (!winner) fail(400, 'Pick the winning option');
    // Every winning share pays out 1 point.
    for (const p of db.prepare('SELECT user_id, shares FROM positions WHERE outcome_id = ?').all(winner.id)) {
      db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(p.shares, p.user_id);
    }
    db.prepare('UPDATE markets SET status = \'resolved\', resolved_outcome_id = ? WHERE id = ?').run(winner.id, m.id);
  });
  res.json({ ok: true });
});

app.delete('/api/admin/markets/:id', requireAdmin, (req, res) => {
  const m = db.prepare('SELECT * FROM markets WHERE id = ?').get(Number(req.params.id));
  if (!m) fail(404, 'Market not found');
  const images = [m.image, ...loadOutcomes(m.id).map((o) => o.image)];
  tx(() => {
    // Give voters back what they put in if the market never resolved.
    if (m.status === 'open') {
      const refunds = db.prepare(`SELECT user_id, SUM(CASE side WHEN 'buy' THEN points ELSE -points END) AS net
                                  FROM trades WHERE market_id = ? GROUP BY user_id`).all(m.id);
      for (const r of refunds) if (r.net > 0) db.prepare('UPDATE users SET points = points + ? WHERE id = ?').run(r.net, r.user_id);
    }
    db.prepare('DELETE FROM markets WHERE id = ?').run(m.id);
  });
  images.forEach(removeUpload);
  res.json({ ok: true });
});

app.get('/api/admin/trades', requireAdmin, (req, res) => {
  res.json({
    trades: db.prepare(`SELECT t.id, t.side, t.shares, t.points, t.created_at, o.label, m.id AS market_id, m.title, m.status,
                               u.username, u.avatar
                        FROM trades t JOIN outcomes o ON o.id = t.outcome_id JOIN markets m ON m.id = t.market_id
                        JOIN users u ON u.id = t.user_id ORDER BY t.id DESC LIMIT 500`).all(),
  });
});

// Undo a single vote: give the points back and take the shares out of the market.
app.delete('/api/admin/trades/:id', requireAdmin, (req, res) => {
  tx(() => {
    const t = db.prepare('SELECT t.*, m.status FROM trades t JOIN markets m ON m.id = t.market_id WHERE t.id = ?').get(Number(req.params.id));
    if (!t) fail(404, 'Vote not found');
    if (t.status === 'open') {
      const sign = t.side === 'buy' ? 1 : -1;
      const held = db.prepare('SELECT shares FROM positions WHERE user_id = ? AND outcome_id = ?').get(t.user_id, t.outcome_id)?.shares || 0;
      const removed = sign > 0 ? Math.min(t.shares, held) : t.shares;
      db.prepare('UPDATE outcomes SET shares = shares - ? WHERE id = ?').run(sign * removed, t.outcome_id);
      addPosition(t.user_id, t.outcome_id, -sign * removed);
      db.prepare('UPDATE users SET points = MAX(0, points + ?) WHERE id = ?').run(sign * t.points, t.user_id);
    }
    db.prepare('DELETE FROM trades WHERE id = ?').run(t.id);
    if (t.status === 'open') snapshotPrices(t.market_id);
  });
  res.json({ ok: true });
});

app.get('/api/admin/users', requireAdmin, (req, res) => {
  res.json({
    users: db.prepare(`SELECT u.*, (SELECT COUNT(*) FROM trades t WHERE t.user_id = u.id) AS votes
                       FROM users u ORDER BY u.id DESC`).all().map((u) => ({ ...publicUser(u), votes: u.votes })),
  });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ?').get(Number(req.params.id));
  if (!u) fail(404, 'User not found');
  if (u.is_admin) fail(400, 'Can\'t delete an admin');
  tx(() => {
    // Pull their open-market shares out so prices stay consistent.
    const held = db.prepare(`SELECT p.outcome_id, p.shares, m.id AS market_id FROM positions p
                             JOIN outcomes o ON o.id = p.outcome_id JOIN markets m ON m.id = o.market_id
                             WHERE p.user_id = ? AND m.status = 'open'`).all(u.id);
    for (const p of held) db.prepare('UPDATE outcomes SET shares = shares - ? WHERE id = ?').run(p.shares, p.outcome_id);
    db.prepare('DELETE FROM users WHERE id = ?').run(u.id);
    for (const marketId of new Set(held.map((p) => p.market_id))) snapshotPrices(marketId);
  });
  removeUpload(u.avatar);
  res.json({ ok: true });
});

// ---------- errors & startup ----------

app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) return res.status(400).json({ error: err.code === 'LIMIT_FILE_SIZE' ? 'Image is too big (max 3 MB)' : err.message });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

// The admin account comes from environment variables so the password never lives in the repo.
function ensureAdmin() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || !password) {
    console.warn('ADMIN_EMAIL / ADMIN_PASSWORD not set: no admin account was created.');
    return;
  }
  const existing = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (existing) {
    db.prepare('UPDATE users SET is_admin = 1, password_hash = ? WHERE id = ?').run(hashPassword(password), existing.id);
  } else {
    db.prepare(`INSERT INTO users (name, username, email, password_hash, is_admin, points)
                VALUES ('Admin', 'admin', ?, ?, 1, 0)`).run(email, hashPassword(password));
  }
}

ensureAdmin();
db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
app.listen(PORT, () => console.log(`ClassMarket running on http://localhost:${PORT}`));
