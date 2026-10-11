const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const C = require('./common');
const { db, L, auth, active, staff, isStaff, upload, fileInfo, ownUser, lite, clean, num, queryPosts, getPost, parseSql } = C;
const { getSetting, putSetting } = require('./db');
const mail = require('./mail');
const { ensureSeason } = require('./init');

const r = express.Router();

// =====================================================================
// AUTENTICACIÓN
// =====================================================================
const attempts = new Map(); // limitador simple de intentos de login
function tooMany(key) {
  const now = Date.now(); const a = (attempts.get(key) || []).filter((t) => now - t < 15 * 60 * 1000);
  attempts.set(key, a); return a.length >= 10;
}
const failed = (key) => attempts.set(key, [...(attempts.get(key) || []), Date.now()]);

r.get('/config', (req, res) => {
  const first = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  res.json({ gym: getSetting('gym.name') || 'RADICAL', invite: !first && !!getSetting('gym.invite_code'), demo: getSetting('demo') === '1', firstRun: first });
});

r.post('/auth/register', (req, res) => {
  const b = req.body || {};
  const name = clean(b.name, 60), email = clean(b.email, 120).toLowerCase(), username = clean(b.username, 20).toLowerCase().replace(/^@/, '');
  const password = String(b.password || ''); const gender = ['M', 'F'].includes(b.gender) ? b.gender : '';
  const first = !db.prepare('SELECT 1 FROM users LIMIT 1').get();
  const code = first ? '' : getSetting('gym.invite_code');
  if (code && clean(b.invite).toLowerCase() !== code.toLowerCase()) return res.status(400).json({ error: 'Código de invitación incorrecto' });
  if (name.length < 2) return res.status(400).json({ error: 'Escribe tu nombre completo' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return res.status(400).json({ error: 'Correo no válido' });
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) return res.status(400).json({ error: 'Usuario: 3-20 caracteres (letras, números, _ .)' });
  if (password.length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  if (db.prepare('SELECT 1 FROM users WHERE email=?').get(email)) return res.status(400).json({ error: 'Ese correo ya está registrado' });
  if (db.prepare('SELECT 1 FROM users WHERE username=?').get(username)) return res.status(400).json({ error: 'Ese usuario ya existe' });
  const id = db.prepare('INSERT INTO users(email,username,name,password_hash,gender,role,status) VALUES(?,?,?,?,?,?,?)')
    .run(email, username, name, bcrypt.hashSync(password, 10), gender, first ? 'owner' : 'user', first ? 'active' : 'pending').lastInsertRowid;
  if (first) { ensureSeason(); putSetting('demo', '0'); } // el primer registro de una instalación vacía es el dueño
  else db.prepare("SELECT id FROM users WHERE role IN ('admin','owner') AND status='active'").all()
    .forEach((a) => L.notify(a.id, 'pending', `🕓 ${name} (@${username}) solicita unirse a RADICAL`, '#/admin/usuarios', id));
  C.setSession(res, id);
  res.json({ ok: true, user: ownUser(db.prepare('SELECT * FROM users WHERE id=?').get(id)) });
});

r.post('/auth/login', (req, res) => {
  const id = clean(req.body?.email, 120).toLowerCase(); const pw = String(req.body?.password || '');
  const key = req.ip + '|' + id;
  if (tooMany(key)) return res.status(429).json({ error: 'Demasiados intentos. Espera unos minutos.' });
  const u = db.prepare('SELECT * FROM users WHERE email=? OR username=?').get(id, id.replace(/^@/, ''));
  if (!u || !bcrypt.compareSync(pw, u.password_hash)) { failed(key); return res.status(401).json({ error: 'Correo o contraseña incorrectos' }); }
  if (u.status === 'blocked') return res.status(403).json({ error: 'Tu cuenta está bloqueada. Contacta al gimnasio.' });
  C.setSession(res, u.id);
  res.json({ ok: true, user: ownUser(u) });
});

r.post('/auth/logout', (req, res) => { C.clearSession(res); res.json({ ok: true }); });

r.post('/auth/forgot', async (req, res) => {
  const email = clean(req.body?.email, 120).toLowerCase();
  const u = db.prepare('SELECT id FROM users WHERE email=?').get(email);
  let link = null;
  if (u) {
    const token = crypto.randomBytes(24).toString('hex');
    db.prepare('INSERT INTO reset_tokens(token,user_id,expires_at) VALUES(?,?,?)')
      .run(token, u.id, new Date(Date.now() + 3600e3).toISOString());
    link = `${req.protocol}://${req.get('host')}/#/reset/${token}`;
    const sent = mail.configured() ? await mail.send(email, 'Recupera tu acceso a RADICAL', `Hola,\n\nUsa este enlace para crear una nueva contraseña (vale 1 hora):\n${link}\n\nSi no fuiste tú, ignora este mensaje.`) : false;
    if (!sent) console.log('[RADICAL] Enlace de recuperación para', email, '→', link);
    if (getSetting('demo') !== '1') link = null; // en producción el enlace solo llega por correo o se lo da el administrador
  }
  res.json({ ok: true, link, message: 'Si el correo existe, recibirás instrucciones. También puedes pedirle un enlace al administrador del gimnasio.' });
});

r.post('/auth/reset', (req, res) => {
  const { token, password } = req.body || {};
  const t = db.prepare('SELECT * FROM reset_tokens WHERE token=? AND used=0').get(String(token || ''));
  if (!t || new Date(t.expires_at) < new Date()) return res.status(400).json({ error: 'El enlace expiró o no es válido' });
  if (String(password || '').length < 8) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(password), 10), t.user_id);
  db.prepare('UPDATE reset_tokens SET used=1 WHERE token=?').run(t.token);
  C.setSession(res, t.user_id);
  res.json({ ok: true });
});

// A partir de aquí: sesión obligatoria
r.use(auth);

r.get('/auth/me', (req, res) => res.json({ user: ownUser(req.user), counters: counters(req.user.id) }));
function counters(uid) {
  return {
    notifications: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0').get(uid).c,
    messages: db.prepare('SELECT COUNT(*) c FROM messages WHERE to_id=? AND read=0').get(uid).c,
  };
}
r.get('/counters', (req, res) => res.json(counters(req.user.id)));

// Lo siguiente requiere cuenta aprobada
r.use(active);

r.get('/badges', (req, res) => res.json(db.prepare('SELECT code,name,description,icon FROM badges WHERE active=1 ORDER BY id').all()));
r.put('/me/password', (req, res) => {
  const { current, next } = req.body || {};
  if (!bcrypt.compareSync(String(current || ''), req.user.password_hash)) return res.status(400).json({ error: 'Contraseña actual incorrecta' });
  if (String(next || '').length < 8) return res.status(400).json({ error: 'Mínimo 8 caracteres' });
  db.prepare('UPDATE users SET password_hash=? WHERE id=?').run(bcrypt.hashSync(String(next), 10), req.user.id);
  res.json({ ok: true });
});

// =====================================================================
// PERFIL / USUARIOS / SEGUIR
// =====================================================================
r.put('/me', upload.single('avatar'), (req, res) => {
  const b = req.body || {}; const u = req.user;
  const username = b.username != null ? clean(b.username, 20).toLowerCase().replace(/^@/, '') : u.username;
  if (!/^[a-z0-9_.]{3,20}$/.test(username)) return res.status(400).json({ error: 'Usuario no válido' });
  if (db.prepare('SELECT 1 FROM users WHERE username=? AND id<>?').get(username, u.id)) return res.status(400).json({ error: 'Ese usuario ya existe' });
  const av = fileInfo(req.file);
  const gender = ['M', 'F', ''].includes(b.gender) ? b.gender : u.gender;
  const age = b.age === '' ? null : num(b.age, u.age);
  const weight = b.weight === '' ? null : num(b.weight, u.weight);
  const goalW = Math.min(7, Math.max(1, Math.round(num(b.weekly_goal, u.weekly_goal))));
  db.prepare(`UPDATE users SET name=?,username=?,bio=?,gender=?,age=?,weight=?,goal=?,discipline=?,weekly_goal=?,avatar=?,phone=? WHERE id=?`)
    .run(clean(b.name ?? u.name, 60) || u.name, username, clean(b.bio ?? u.bio, 220), gender, age, weight,
      clean(b.goal ?? u.goal, 80), clean(b.discipline ?? u.discipline, 40), goalW, av.url || u.avatar, clean(b.phone ?? u.phone, 20).replace(/[^\d+ ]/g, ''), u.id);
  L.checkBadges(u.id);
  res.json({ ok: true, user: ownUser(db.prepare('SELECT * FROM users WHERE id=?').get(u.id)) });
});

r.get('/users', (req, res) => {
  const q = '%' + clean(req.query.q, 40).toLowerCase().replace(/^@/, '') + '%';
  const rows = db.prepare(`SELECT * FROM users WHERE status='active' AND (lower(name) LIKE ? OR username LIKE ?) ORDER BY name LIMIT 30`).all(q, q);
  res.json(rows.map(lite));
});
r.get('/suggestions', (req, res) => {
  const rows = db.prepare(`SELECT * FROM users WHERE status='active' AND id<>? AND id NOT IN (SELECT followee_id FROM follows WHERE follower_id=?) ORDER BY RANDOM() LIMIT 5`).all(req.user.id, req.user.id);
  res.json(rows.map(lite));
});

function profileOf(uid, me) {
  const u = db.prepare('SELECT * FROM users WHERE id=?').get(uid);
  if (!u || (u.status !== 'active' && !isStaff(me) && u.id !== me.id)) return null;
  const q = (sql, ...a) => db.prepare(sql).get(...a).c;
  const st = L.streakInfo(uid);
  const rank = L.userRankInSeason(uid);
  const coach = u.coach_id ? db.prepare('SELECT id,name,username,avatar FROM users WHERE id=?').get(u.coach_id) : null;
  const prs = db.prepare(`SELECT e.id exercise_id, e.code, e.name, e.unit, MAX(p.value) value FROM pr_exercises e
    LEFT JOIN prs p ON p.exercise_id=e.id AND p.user_id=? AND p.status='approved' WHERE e.active=1 GROUP BY e.id ORDER BY e.id`).all(uid);
  const badges = db.prepare('SELECT b.code,b.name,b.icon,b.description,ub.created_at FROM user_badges ub JOIN badges b ON b.id=ub.badge_id WHERE ub.user_id=? ORDER BY ub.created_at DESC').all(uid);
  const awards = db.prepare(`SELECT a.award, s.name season FROM season_awards a JOIN seasons s ON s.id=a.season_id WHERE a.user_id=? ORDER BY s.id DESC`).all(uid);
  const out = {
    id: u.id, name: u.name, username: u.username, avatar: u.avatar, bio: u.bio, gender: u.gender, age: u.age, weight: u.weight,
    wcat: L.weightCategory(u.weight), goal: u.goal, discipline: u.discipline, role: u.role, status: u.status, team: u.team, coach,
    weekly_goal: u.weekly_goal, joined: u.created_at,
    posts: q("SELECT COUNT(*) c FROM posts WHERE user_id=? AND deleted=0", uid),
    followers: q('SELECT COUNT(*) c FROM follows WHERE followee_id=?', uid),
    following: q('SELECT COUNT(*) c FROM follows WHERE follower_id=?', uid),
    isFollowing: !!db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(me.id, uid),
    streak: st, season_points: rank.points, season_position: rank.position,
    total_points: db.prepare('SELECT COALESCE(SUM(points),0) c FROM points_ledger WHERE user_id=?').get(uid).c,
    prs, badges, awards,
  };
  if (u.id === me.id || isStaff(me)) out.email = u.email;
  return out;
}
r.get('/users/:id', (req, res) => {
  const p = profileOf(+req.params.id, req.user);
  p ? res.json(p) : res.status(404).json({ error: 'Perfil no encontrado' });
});
r.get('/users/:id/posts', (req, res) => {
  res.json(queryPosts(req.user, 'p.user_id=@uid', { uid: +req.params.id }, 'ORDER BY p.created_at DESC, p.id DESC LIMIT 60'));
});
r.get('/users/:id/people/:which', (req, res) => {
  const mine = req.params.which === 'followers';
  const rows = db.prepare(`SELECT u.* FROM follows f JOIN users u ON u.id=${mine ? 'f.follower_id' : 'f.followee_id'}
    WHERE ${mine ? 'f.followee_id' : 'f.follower_id'}=? AND u.status='active'`).all(+req.params.id);
  res.json(rows.map(lite));
});
r.post('/users/:id/follow', (req, res) => {
  const id = +req.params.id; if (id === req.user.id) return res.status(400).json({ error: 'No puedes seguirte' });
  const ex = db.prepare('SELECT 1 FROM follows WHERE follower_id=? AND followee_id=?').get(req.user.id, id);
  if (ex) db.prepare('DELETE FROM follows WHERE follower_id=? AND followee_id=?').run(req.user.id, id);
  else { db.prepare('INSERT OR IGNORE INTO follows(follower_id,followee_id) VALUES(?,?)').run(req.user.id, id); L.notify(id, 'follow', `${req.user.name} empezó a seguirte`, `#/u/${req.user.id}`, req.user.id); }
  res.json({ following: !ex, followers: db.prepare('SELECT COUNT(*) c FROM follows WHERE followee_id=?').get(id).c });
});

// =====================================================================
// FEED
// =====================================================================
r.get('/feed', (req, res) => {
  const before = clean(req.query.before, 30);
  const news = req.query.scope === 'news'; // noticias del gimnasio: avisos + publicaciones oficiales; el inicio solo muestra publicaciones de miembros
  const w = [before ? 'p.created_at < @before' : '', news ? 'p.user_id IS NULL' : 'p.user_id IS NOT NULL'].filter(Boolean).join(' AND ');
  const posts = queryPosts(req.user, w, { before }, 'ORDER BY p.created_at DESC, p.id DESC LIMIT 12');
  const anns = !news ? [] : db.prepare(`SELECT a.*, u.name author FROM announcements a LEFT JOIN users u ON u.id=a.created_by WHERE a.deleted=0 ${before ? 'AND a.created_at < ?' : ''}
    ORDER BY a.created_at DESC LIMIT 4`).all(...(before ? [before] : []))
    .map((a) => ({ type: 'announcement', ...a }));
  let items = [...posts, ...anns].sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, 14);
  // si hay más posts que los incluidos, 'next' apunta al último item devuelto
  const next = items.length ? items[items.length - 1].created_at : null;
  if (!before && news) { // anuncios fijados siempre arriba en la primera página
    const pinned = db.prepare('SELECT a.* FROM announcements a WHERE a.deleted=0 AND a.pinned=1 ORDER BY a.created_at DESC LIMIT 2').all().map((a) => ({ type: 'announcement', ...a }));
    items = [...pinned, ...items.filter((i) => !(i.type === 'announcement' && pinned.some((p) => p.id === i.id)))];
  }
  res.json({ items, next: posts.length || anns.length ? next : null });
});

r.get('/home/extras', (req, res) => {
  const featured = db.prepare(`SELECT * FROM challenges WHERE end_at>=datetime('now') ORDER BY featured DESC, start_at ASC LIMIT 1`).get();
  let ch = null;
  if (featured) {
    const rk = L.challengeRanking(featured.id, {});
    ch = { id: featured.id, title: featured.title, exercise: featured.exercise, weight: featured.weight, type: featured.type, image: featured.image,
      end_at: featured.end_at, points: featured.points, prize: featured.prize, top: rk.slice(0, 3),
      participants: db.prepare('SELECT COUNT(*) c FROM challenge_joins WHERE challenge_id=?').get(featured.id).c,
      joined: !!db.prepare('SELECT 1 FROM challenge_joins WHERE challenge_id=? AND user_id=?').get(featured.id, req.user.id) };
  }
  const recent = queryPosts(req.user, "p.kind IN ('pr','streak','result')", {}, 'ORDER BY p.created_at DESC LIMIT 6')
    .map((p) => ({ id: p.id, kind: p.kind, text: p.text, author: p.author, created_at: p.created_at }));
  const activity = db.prepare(`SELECT n.* FROM (
      SELECT 'follow' t, f.follower_id uid, f.followee_id other, f.created_at ts FROM follows f WHERE f.follower_id IN (SELECT followee_id FROM follows WHERE follower_id=@me)
      UNION ALL SELECT 'checkin', c.user_id, NULL, c.date||' 12:00:00' FROM checkins c WHERE c.user_id IN (SELECT followee_id FROM follows WHERE follower_id=@me)
    ) n ORDER BY ts DESC LIMIT 6`).all({ me: req.user.id }).map((a) => {
      const u = db.prepare('SELECT id,name,username,avatar FROM users WHERE id=?').get(a.uid);
      const o = a.other ? db.prepare('SELECT id,name FROM users WHERE id=?').get(a.other) : null;
      return { user: u, text: a.t === 'follow' ? `empezó a seguir a ${o?.name || ''}` : 'entrenó hoy 💪', created_at: a.ts };
    });
  let routine = null;
  const ur = db.prepare('SELECT * FROM user_routine WHERE user_id=?').get(req.user.id);
  if (ur) {
    const rt = db.prepare('SELECT * FROM routines WHERE id=? AND deleted=0').get(ur.routine_id);
    const days = rt ? db.prepare('SELECT * FROM routine_days WHERE routine_id=? ORDER BY pos').all(rt.id) : [];
    const d = days[Math.min(ur.next_day, days.length - 1)];
    if (rt && d) routine = { id: rt.id, title: rt.title, day: d.name, focus: d.focus, n: ur.next_day + 1, total: days.length, exercises: db.prepare('SELECT name,sets,reps FROM routine_exercises WHERE day_id=? ORDER BY pos').all(d.id) };
  }
  res.json({ routine, challenge: ch, recent, activity, season: L.currentSeason(), streak: L.streakInfo(req.user.id), me: L.userRankInSeason(req.user.id), suggestions:
    db.prepare(`SELECT * FROM users WHERE status='active' AND id<>? AND id NOT IN (SELECT followee_id FROM follows WHERE follower_id=?) ORDER BY RANDOM() LIMIT 4`).all(req.user.id, req.user.id).map(lite),
    topSeason: L.seasonRanking({}).rows.slice(0, 5) });
});

// =====================================================================
// PUBLICACIONES
// =====================================================================
r.post('/posts', upload.single('media'), (req, res) => {
  const b = req.body || {}; const f = fileInfo(req.file);
  const text = clean(b.text, 2000);
  if (!text && !f.url) return res.status(400).json({ error: 'Escribe algo o adjunta una foto/video' });
  const vis = b.visibility === 'followers' ? 'followers' : 'all';
  const id = db.prepare('INSERT INTO posts(user_id,kind,text,media,media_type,location,visibility) VALUES(?,?,?,?,?,?,?)')
    .run(req.user.id, 'post', text, f.url, f.type, clean(b.location, 80), vis).lastInsertRowid;
  const tags = String(b.tags || '').split(',').map(Number).filter(Boolean).slice(0, 10);
  tags.forEach((t) => {
    if (db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(t)) {
      db.prepare('INSERT OR IGNORE INTO post_tags VALUES(?,?)').run(id, t);
      L.notify(t, 'tag', `${req.user.name} te etiquetó en una publicación`, `#/post/${id}`, req.user.id);
    }
  });
  res.json({ ok: true, post: getPost(req.user, id) });
});
r.get('/posts/:id', (req, res) => {
  const p = getPost(req.user, +req.params.id); p ? res.json(p) : res.status(404).json({ error: 'Publicación no encontrada' });
});
r.delete('/posts/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM posts WHERE id=?').get(+req.params.id);
  if (!p || (p.user_id !== req.user.id && !isStaff(req.user))) return res.status(403).json({ error: 'Sin permiso' });
  db.prepare('UPDATE posts SET deleted=1 WHERE id=?').run(p.id); res.json({ ok: true });
});
r.post('/posts/:id/like', (req, res) => {
  const id = +req.params.id; const p = db.prepare('SELECT * FROM posts WHERE id=? AND deleted=0').get(id);
  if (!p) return res.status(404).json({ error: 'No existe' });
  const ex = db.prepare('SELECT 1 FROM likes WHERE post_id=? AND user_id=?').get(id, req.user.id);
  if (ex) db.prepare('DELETE FROM likes WHERE post_id=? AND user_id=?').run(id, req.user.id);
  else { db.prepare('INSERT INTO likes(post_id,user_id) VALUES(?,?)').run(id, req.user.id); L.notify(p.user_id, 'like', `A ${req.user.name} le gustó tu publicación`, `#/post/${id}`, req.user.id); }
  res.json({ liked: !ex, likes: db.prepare('SELECT COUNT(*) c FROM likes WHERE post_id=?').get(id).c });
});
r.post('/posts/:id/save', (req, res) => {
  const id = +req.params.id;
  const ex = db.prepare('SELECT 1 FROM saves WHERE post_id=? AND user_id=?').get(id, req.user.id);
  ex ? db.prepare('DELETE FROM saves WHERE post_id=? AND user_id=?').run(id, req.user.id) : db.prepare('INSERT INTO saves(post_id,user_id) VALUES(?,?)').run(id, req.user.id);
  res.json({ saved: !ex });
});
r.get('/saved', (req, res) => {
  res.json(queryPosts(req.user, 'p.id IN (SELECT post_id FROM saves WHERE user_id=@me)', {}, 'ORDER BY p.created_at DESC LIMIT 60'));
});
r.get('/posts/:id/comments', (req, res) => {
  res.json(db.prepare(`SELECT c.id,c.text,c.created_at,c.user_id,u.name,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id
    WHERE c.post_id=? AND c.deleted=0 ORDER BY c.id ASC LIMIT 200`).all(+req.params.id));
});
r.post('/posts/:id/comments', (req, res) => {
  const id = +req.params.id; const text = clean(req.body?.text, 500);
  const p = db.prepare('SELECT * FROM posts WHERE id=? AND deleted=0').get(id);
  if (!p || !text) return res.status(400).json({ error: 'Comentario vacío' });
  const cid = db.prepare('INSERT INTO comments(post_id,user_id,text) VALUES(?,?,?)').run(id, req.user.id, text).lastInsertRowid;
  L.notify(p.user_id, 'comment', `${req.user.name} comentó: “${text.slice(0, 60)}”`, `#/post/${id}`, req.user.id);
  res.json(db.prepare('SELECT c.id,c.text,c.created_at,c.user_id,u.name,u.username,u.avatar FROM comments c JOIN users u ON u.id=c.user_id WHERE c.id=?').get(cid));
});
r.delete('/comments/:id', (req, res) => {
  const c = db.prepare('SELECT c.*, p.user_id owner FROM comments c JOIN posts p ON p.id=c.post_id WHERE c.id=?').get(+req.params.id);
  if (!c || (c.user_id !== req.user.id && c.owner !== req.user.id && !isStaff(req.user))) return res.status(403).json({ error: 'Sin permiso' });
  db.prepare('UPDATE comments SET deleted=1 WHERE id=?').run(c.id); res.json({ ok: true });
});
r.post('/reports', (req, res) => {
  const type = ['post', 'comment', 'user', 'story'].includes(req.body?.type) ? req.body.type : null;
  if (!type) return res.status(400).json({ error: 'Tipo no válido' });
  db.prepare('INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES(?,?,?,?)').run(req.user.id, type, +req.body.id, clean(req.body.reason, 300));
  db.prepare("SELECT id FROM users WHERE role IN ('admin','owner') AND status='active'").all().forEach((a) => L.notify(a.id, 'report', '🚩 Nuevo reporte para revisar', '#/admin/reportes', req.user.id));
  res.json({ ok: true });
});

// =====================================================================
// HISTORIAS
// =====================================================================
const GYM_KINDS = ['gym', 'event', 'challenge'];
r.get('/stories', (req, res) => {
  const me = req.user.id;
  const rows = db.prepare(`SELECT s.*, u.name, u.username, u.avatar, EXISTS(SELECT 1 FROM story_views v WHERE v.story_id=s.id AND v.user_id=?) seen,
      (SELECT COUNT(*) FROM story_views v WHERE v.story_id=s.id) views
    FROM stories s LEFT JOIN users u ON u.id=s.user_id
    WHERE s.deleted=0 AND s.created_at > datetime('now','-24 hours') AND (s.user_id IS NULL OR u.status='active') ORDER BY s.created_at ASC`).all(me);
  const mapStory = (s) => ({ id: s.id, kind: s.kind, media: s.media_type === 'card' ? '' : s.media, media_type: s.media_type, caption: s.caption,
    card: s.media_type === 'card' ? (() => { try { return JSON.parse(s.media); } catch { return {}; } })() : null,
    created_at: s.created_at, seen: !!s.seen, views: s.views, mine: s.user_id === me, highlight: s.highlight });
  const anns = db.prepare(`SELECT * FROM announcements WHERE deleted=0 AND in_story=1 AND created_at > datetime('now','-24 hours') ORDER BY created_at ASC`).all()
    .map((a) => ({ id: 'a' + a.id, kind: a.kind === 'competition' || a.kind === 'event' ? 'event' : 'gym', media: a.image, media_type: a.image ? 'image' : 'card',
      caption: a.title, card: { title: a.title, body: a.body, kind: a.kind }, created_at: a.created_at, seen: false, views: 0, mine: false, announcement: true }));
  const groups = new Map();
  const push = (key, user, st) => { if (!groups.has(key)) groups.set(key, { key, user, stories: [] }); groups.get(key).stories.push(st); };
  rows.forEach((s) => {
    if (!s.user_id) push('gym', { id: 0, name: 'RADICAL', username: 'radical', avatar: '', gym: true }, mapStory(s));
    else push('u' + s.user_id, { id: s.user_id, name: s.name, username: s.username, avatar: s.avatar }, mapStory(s));
  });
  anns.forEach((a) => push('gym', { id: 0, name: 'RADICAL', username: 'radical', avatar: '', gym: true }, a));
  const out = [...groups.values()].map((g) => ({ ...g, seen: g.stories.every((s) => s.seen), mine: g.user.id === me }));
  out.sort((a, b) => (b.mine - a.mine) || ((!!b.user.gym) - (!!a.user.gym)) || (a.seen - b.seen));
  res.json(out);
});
r.post('/stories', upload.single('media'), (req, res) => {
  const b = req.body || {}; const f = fileInfo(req.file);
  if (!f.url) return res.status(400).json({ error: 'Adjunta una foto o video' });
  let kind = ['normal', 'pr', ...GYM_KINDS].includes(b.kind) ? b.kind : 'normal';
  let uid = req.user.id;
  if (GYM_KINDS.includes(kind)) { if (!isStaff(req.user)) kind = 'normal'; else uid = null; }
  const id = db.prepare('INSERT INTO stories(user_id,kind,media,media_type,caption,highlight) VALUES(?,?,?,?,?,?)')
    .run(uid, kind, f.url, f.type, clean(b.caption, 200), clean(b.highlight, 30)).lastInsertRowid;
  res.json({ ok: true, id });
});
r.post('/stories/:id/view', (req, res) => {
  if (!/^\d+$/.test(req.params.id)) return res.json({ ok: true });
  db.prepare('INSERT OR IGNORE INTO story_views(story_id,user_id) VALUES(?,?)').run(+req.params.id, req.user.id); res.json({ ok: true });
});
r.get('/stories/:id/viewers', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id=?').get(+req.params.id);
  if (!s || (s.user_id !== req.user.id && !isStaff(req.user))) return res.status(403).json({ error: 'Sin permiso' });
  res.json(db.prepare('SELECT u.id,u.name,u.username,u.avatar,v.created_at FROM story_views v JOIN users u ON u.id=v.user_id WHERE v.story_id=? ORDER BY v.created_at DESC').all(s.id));
});
r.post('/stories/:id/reply', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id=?').get(+req.params.id); const text = clean(req.body?.text, 500);
  if (!s || !s.user_id || !text) return res.status(400).json({ error: 'No se puede responder' });
  db.prepare("INSERT INTO messages(from_id,to_id,text,kind,ref_id) VALUES(?,?,?,'story_reply',?)").run(req.user.id, s.user_id, text, s.id);
  L.notify(s.user_id, 'message', `${req.user.name} respondió a tu historia`, `#/mensajes/${req.user.id}`, req.user.id);
  res.json({ ok: true });
});
r.put('/stories/:id/highlight', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id=?').get(+req.params.id);
  if (!s || (s.user_id !== req.user.id && !isStaff(req.user))) return res.status(403).json({ error: 'Sin permiso' });
  db.prepare('UPDATE stories SET highlight=? WHERE id=?').run(clean(req.body?.name, 30), s.id); res.json({ ok: true });
});
r.delete('/stories/:id', (req, res) => {
  const s = db.prepare('SELECT * FROM stories WHERE id=?').get(+req.params.id);
  if (!s || (s.user_id !== req.user.id && !isStaff(req.user))) return res.status(403).json({ error: 'Sin permiso' });
  db.prepare('UPDATE stories SET deleted=1 WHERE id=?').run(s.id); res.json({ ok: true });
});
r.get('/users/:id/highlights', (req, res) => {
  const rows = db.prepare("SELECT * FROM stories WHERE user_id=? AND deleted=0 AND highlight<>'' ORDER BY created_at ASC").all(+req.params.id);
  const g = {};
  rows.forEach((s) => { (g[s.highlight] = g[s.highlight] || []).push({ id: s.id, kind: s.kind, media: s.media_type === 'card' ? '' : s.media, media_type: s.media_type,
    caption: s.caption, card: s.media_type === 'card' ? (() => { try { return JSON.parse(s.media); } catch { return {}; } })() : null, created_at: s.created_at, seen: true, mine: s.user_id === req.user.id }); });
  res.json(Object.entries(g).map(([name, stories]) => ({ name, stories })));
});

// =====================================================================
// MENSAJES
// =====================================================================
function hydrateMsg(m) {
  let ref = null;
  if (m.kind === 'post') { const p = getPost({ id: 0, role: 'owner' }, m.ref_id); if (p) ref = { id: p.id, text: p.text.slice(0, 120), media: p.media_type === 'image' ? p.media : '', author: p.author.name }; }
  if (m.kind === 'challenge') ref = db.prepare('SELECT id,title,image,exercise FROM challenges WHERE id=?').get(m.ref_id) || null;
  if (m.kind === 'order') ref = db.prepare('SELECT id,product_id,product_name product,model_label model,model_image image,size,qty,price,kind,status,pay_status FROM orders WHERE id=?').get(m.ref_id) || null;
  if (m.kind === 'profile') ref = lite(db.prepare('SELECT * FROM users WHERE id=?').get(m.ref_id));
  if (m.kind === 'story_reply') { const s = db.prepare('SELECT media,media_type,caption FROM stories WHERE id=?').get(m.ref_id); ref = s ? { media: s.media_type === 'image' ? s.media : '', caption: s.caption } : null; }
  return { id: m.id, from_id: m.from_id, to_id: m.to_id, text: m.text, kind: m.kind, ref, read: !!m.read, created_at: m.created_at };
}
r.get('/conversations', (req, res) => {
  const me = req.user.id;
  const ids = db.prepare('SELECT DISTINCT CASE WHEN from_id=? THEN to_id ELSE from_id END o FROM messages WHERE from_id=? OR to_id=?').all(me, me, me).map((x) => x.o);
  const out = ids.map((o) => {
    const u = db.prepare('SELECT * FROM users WHERE id=?').get(o); if (!u) return null;
    const last = db.prepare('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT 1').get(me, o, o, me);
    const unread = db.prepare('SELECT COUNT(*) c FROM messages WHERE from_id=? AND to_id=? AND read=0').get(o, me).c;
    const preview = last.kind === 'text' || last.kind === 'story_reply' ? last.text : { post: '📷 Publicación compartida', challenge: '🏆 Reto compartido', profile: '👤 Perfil compartido', order: '🛍️ Pedido de tienda' }[last.kind];
    return { user: lite(u), last: { text: preview, from_me: last.from_id === me, created_at: last.created_at }, unread };
  }).filter(Boolean).sort((a, b) => (a.last.created_at < b.last.created_at ? 1 : -1));
  res.json(out);
});
r.get('/messages/:uid', (req, res) => {
  const me = req.user.id, o = +req.params.uid;
  db.prepare('UPDATE messages SET read=1 WHERE from_id=? AND to_id=? AND read=0').run(o, me);
  const rows = db.prepare('SELECT * FROM messages WHERE (from_id=? AND to_id=?) OR (from_id=? AND to_id=?) ORDER BY id DESC LIMIT 150').all(me, o, o, me).reverse();
  res.json({ user: lite(db.prepare('SELECT * FROM users WHERE id=?').get(o)), messages: rows.map(hydrateMsg) });
});
r.post('/messages/:uid', (req, res) => {
  const o = +req.params.uid; const kind = ['text', 'post', 'challenge', 'profile'].includes(req.body?.kind) ? req.body.kind : 'text';
  const text = clean(req.body?.text, 1000); const ref = num(req.body?.ref_id);
  if (!db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(o) || o === req.user.id) return res.status(400).json({ error: 'Destinatario no válido' });
  if (kind === 'text' && !text) return res.status(400).json({ error: 'Mensaje vacío' });
  const id = db.prepare('INSERT INTO messages(from_id,to_id,text,kind,ref_id) VALUES(?,?,?,?,?)').run(req.user.id, o, text, kind, ref).lastInsertRowid;
  L.notify(o, 'message', `💬 ${req.user.name}: ${(text || 'te envió algo').slice(0, 50)}`, `#/mensajes/${req.user.id}`, req.user.id);
  res.json(hydrateMsg(db.prepare('SELECT * FROM messages WHERE id=?').get(id)));
});

// =====================================================================
// NOTIFICACIONES
// =====================================================================
r.get('/notifications', (req, res) => {
  res.json(db.prepare(`SELECT n.*, u.name actor_name, u.avatar actor_avatar FROM notifications n LEFT JOIN users u ON u.id=n.actor_id
    WHERE n.user_id=? ORDER BY n.id DESC LIMIT 60`).all(req.user.id));
});
r.post('/notifications/read', (req, res) => { db.prepare('UPDATE notifications SET read=1 WHERE user_id=?').run(req.user.id); res.json({ ok: true }); });

module.exports = r;
