const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { db } = require('./db');
const L = require('./lib');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });

// Secreto JWT: variable de entorno o archivo persistente (se genera una vez)
let SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  const f = path.join(DATA_DIR, 'secret');
  try { SECRET = fs.readFileSync(f, 'utf8').trim(); } catch {
    SECRET = crypto.randomBytes(48).toString('hex');
    fs.writeFileSync(f, SECRET, { mode: 0o600 });
  }
}

const COOKIE = 'rt';
const isProd = process.env.NODE_ENV === 'production';
function setSession(res, userId) {
  const token = jwt.sign({ id: userId }, SECRET, { expiresIn: '60d' });
  res.cookie(COOKIE, token, { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 60 * 24 * 3600 * 1000, path: '/' });
}
function clearSession(res) { res.clearCookie(COOKIE, { path: '/' }); }

function auth(req, res, next) {
  const token = req.cookies?.[COOKIE] || (req.headers.authorization || '').replace(/^Bearer /, '');
  if (!token) return res.status(401).json({ error: 'No autenticado' });
  try {
    const { id } = jwt.verify(token, SECRET);
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(id);
    if (!u) return res.status(401).json({ error: 'No autenticado' });
    if (u.status === 'blocked') return res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta al gimnasio.', blocked: true });
    req.user = u; next();
  } catch { res.status(401).json({ error: 'Sesión inválida' }); }
}
const active = (req, res, next) =>
  req.user.status === 'active' ? next() : res.status(403).json({ error: 'Tu cuenta está pendiente de aprobación', pending: true });
const isStaff = (u) => u.role === 'admin' || u.role === 'owner';
const staff = (req, res, next) => (isStaff(req.user) ? next() : res.status(403).json({ error: 'Solo administración' }));
const coachOrStaff = (req, res, next) => (isStaff(req.user) || req.user.role === 'coach' ? next() : res.status(403).json({ error: 'Sin permisos' }));

// ---------- Subida de archivos ----------
const OK_EXT = { '.jpg': 'image', '.jpeg': 'image', '.png': 'image', '.webp': 'image', '.gif': 'image', '.heic': 'image',
  '.mp4': 'video', '.mov': 'video', '.webm': 'video', '.m4v': 'video' };
const upload = multer({
  storage: multer.diskStorage({
    destination: UPLOADS,
    filename: (req, file, cb) => cb(null, crypto.randomBytes(12).toString('hex') + path.extname(file.originalname).toLowerCase()),
  }),
  limits: { fileSize: 120 * 1024 * 1024, files: 8 },
  fileFilter: (req, file, cb) => cb(null, !!OK_EXT[path.extname(file.originalname).toLowerCase()]),
});
function fileInfo(f) {
  if (!f) return { url: '', type: '' };
  return { url: '/uploads/' + f.filename, type: OK_EXT[path.extname(f.filename).toLowerCase()] || '' };
}

// ---------- Serialización ----------
function ownUser(u) {
  const { password_hash, ...rest } = u;
  return { ...rest, wcat: L.weightCategory(u.weight) };
}
function lite(u) { return u ? L.userLite(u) : null; }
const clean = (s, max = 2000) => String(s ?? '').trim().slice(0, max);
const num = (v, d = null) => { const n = Number(v); return Number.isFinite(n) && v !== '' && v != null ? n : d; };

const POST_SQL = `
SELECT p.*, u.name, u.username, u.avatar, u.role, u.status ustatus,
 (SELECT COUNT(*) FROM likes l WHERE l.post_id=p.id) likes,
 (SELECT COUNT(*) FROM comments c WHERE c.post_id=p.id AND c.deleted=0) comments,
 EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.id AND l.user_id=@me) liked,
 EXISTS(SELECT 1 FROM saves s WHERE s.post_id=p.id AND s.user_id=@me) saved
FROM posts p LEFT JOIN users u ON u.id=p.user_id`;
const VISIBLE = `p.deleted=0 AND (p.user_id IS NULL OR u.status='active') AND
 (p.visibility='all' OR p.user_id=@me OR @staff=1 OR EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=@me AND f.followee_id=p.user_id))`;

function hydratePosts(rows) {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const tags = db.prepare(`SELECT t.post_id, u.id, u.username, u.name FROM post_tags t JOIN users u ON u.id=t.user_id WHERE t.post_id IN (${ids.map(() => '?').join(',')})`).all(...ids);
  return rows.map((r) => {
    let meta = {}; try { meta = JSON.parse(r.meta || '{}'); } catch {}
    return {
      type: 'post', id: r.id, kind: r.kind, text: r.text, media: r.media, media_type: r.media_type, location: r.location,
      visibility: r.visibility, meta, created_at: r.created_at,
      author: r.user_id ? { id: r.user_id, name: r.name, username: r.username, avatar: r.avatar, role: r.role } : { id: 0, name: 'RADICAL', username: 'radical', avatar: '', role: 'gym' },
      likes: r.likes, comments: r.comments, liked: !!r.liked, saved: !!r.saved,
      tags: tags.filter((t) => t.post_id === r.id).map(({ post_id, ...t }) => t),
    };
  });
}
function queryPosts(me, where = '', params = {}, tail = 'ORDER BY p.created_at DESC, p.id DESC LIMIT 20') {
  const rows = db.prepare(`${POST_SQL} WHERE ${VISIBLE} ${where ? 'AND ' + where : ''} ${tail}`)
    .all({ me: me.id, staff: isStaff(me) ? 1 : 0, ...params });
  return hydratePosts(rows);
}
function getPost(me, id) { return queryPosts(me, 'p.id=@pid', { pid: id }, 'LIMIT 1')[0] || null; }

// Crea una publicación automática (PR, racha, resultado de reto…)
function autoPost(userId, kind, text, meta = {}, media = '', mediaType = '') {
  return db.prepare('INSERT INTO posts(user_id,kind,text,media,media_type,meta) VALUES(?,?,?,?,?,?)')
    .run(userId, kind, text, media, mediaType, JSON.stringify(meta)).lastInsertRowid;
}
function autoStory(userId, kind, caption, meta = {}) {
  return db.prepare("INSERT INTO stories(user_id,kind,media,media_type,caption) VALUES(?,?,?,'card',?)")
    .run(userId, kind, JSON.stringify(meta), caption).lastInsertRowid;
}

function parseSql(s) { return new Date(String(s).replace(' ', 'T') + 'Z'); }

module.exports = {
  db, L, UPLOADS, DATA_DIR, setSession, clearSession, auth, active, staff, coachOrStaff, isStaff, upload, fileInfo,
  ownUser, lite, clean, num, queryPosts, getPost, hydratePosts, autoPost, autoStory, parseSql, COOKIE,
};
