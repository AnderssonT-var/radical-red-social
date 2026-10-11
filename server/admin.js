const express = require('express');
const crypto = require('crypto');
const C = require('./common');
const G = require('./game');
const { db, L, upload, fileInfo, clean, num, staff } = C;
const { getSetting, putSetting } = require('./db');

const r = express.Router();
r.use(staff);

const toSql = (v) => { const d = new Date(v); return isNaN(d) ? null : d.toISOString().replace('T', ' ').slice(0, 19); };
const q1 = (sql, ...a) => db.prepare(sql).get(...a).c;

// ---------- Dashboard ----------
r.get('/dashboard', (req, res) => {
  const today = L.todayStr(); const from = L.addDays(today, -6);
  const days = []; for (let i = 0; i < 7; i++) {
    const d = L.addDays(from, i);
    days.push({ date: d,
      checkins: q1('SELECT COUNT(*) c FROM checkins WHERE date=?', d),
      posts: q1("SELECT COUNT(*) c FROM posts WHERE date(created_at)=? AND deleted=0", d),
      workouts: q1('SELECT COUNT(*) c FROM workouts WHERE date=?', d) });
  }
  const cur = db.prepare("SELECT * FROM challenges WHERE start_at<=datetime('now') AND end_at>=datetime('now') ORDER BY featured DESC LIMIT 1").get();
  const since = L.addDays(today, -30);
  const top = db.prepare(`SELECT u.id,u.name,u.username,u.avatar,
      (SELECT COUNT(*) FROM checkins c WHERE c.user_id=u.id AND c.date>=@s) + (SELECT COUNT(*) FROM workouts w WHERE w.user_id=u.id AND w.date>=@s) +
      (SELECT COUNT(*) FROM posts p WHERE p.user_id=u.id AND p.deleted=0 AND date(p.created_at)>=@s) score
    FROM users u WHERE u.status='active' ORDER BY score DESC LIMIT 6`).all({ s: since });
  res.json({
    active: q1("SELECT COUNT(*) c FROM users WHERE status='active'"), pending: q1("SELECT COUNT(*) c FROM users WHERE status='pending'"),
    blocked: q1("SELECT COUNT(*) c FROM users WHERE status='blocked'"),
    posts: q1('SELECT COUNT(*) c FROM posts WHERE deleted=0'), postsWeek: q1("SELECT COUNT(*) c FROM posts WHERE deleted=0 AND date(created_at)>=?", from),
    challenge: cur ? { id: cur.id, title: cur.title, end_at: cur.end_at, participants: q1('SELECT COUNT(*) c FROM challenge_joins WHERE challenge_id=?', cur.id) } : null,
    pendingEntries: q1("SELECT COUNT(*) c FROM challenge_entries WHERE status='pending'"), pendingPrs: q1("SELECT COUNT(*) c FROM prs WHERE status='pending'"),
    openReports: q1("SELECT COUNT(*) c FROM reports WHERE status='open'"), pendingOrders: q1("SELECT COUNT(*) c FROM orders WHERE status='nuevo' OR (pay_status='revision' AND status<>'cancelado')"),
    week: days, top, season: L.currentSeason(),
  });
});

// ---------- Usuarios ----------
r.get('/users', (req, res) => {
  const st = ['pending', 'active', 'blocked'].includes(req.query.status) ? req.query.status : null; const q = '%' + clean(req.query.q, 40).toLowerCase() + '%';
  const rows = db.prepare(`SELECT id,email,username,name,role,status,gender,weight,coach_id,team,discipline,avatar,weekly_goal,created_at FROM users
    WHERE (? IS NULL OR status=?) AND (lower(name) LIKE ? OR username LIKE ? OR email LIKE ?) ORDER BY CASE status WHEN 'pending' THEN 0 ELSE 1 END, name LIMIT 300`).all(st, st, q, q, q);
  res.json(rows);
});
r.put('/users/:id', (req, res) => {
  const id = +req.params.id; const u = db.prepare('SELECT * FROM users WHERE id=?').get(id); const b = req.body || {};
  if (!u) return res.status(404).json({ error: 'No existe' });
  const owner = req.user.role === 'owner';
  if ((u.role === 'owner' || u.role === 'admin') && !owner && u.id !== req.user.id) return res.status(403).json({ error: 'Solo el dueño puede editar administradores' });
  let role = ['user', 'coach', 'admin', 'owner'].includes(b.role) ? b.role : u.role;
  if ((role === 'admin' || role === 'owner') && !owner && role !== u.role) return res.status(403).json({ error: 'Solo el dueño puede asignar administradores' });
  if (u.id === req.user.id && role !== u.role) role = u.role;
  let status = ['pending', 'active', 'blocked'].includes(b.status) ? b.status : u.status;
  if (u.id === req.user.id) status = 'active';
  const coach = b.coach_id === '' || b.coach_id === null ? null : (num(b.coach_id, u.coach_id));
  db.prepare('UPDATE users SET name=?,role=?,status=?,coach_id=?,team=?,discipline=?,gender=?,weight=?,weekly_goal=? WHERE id=?')
    .run(clean(b.name ?? u.name, 60) || u.name, role, status, coach, clean(b.team ?? u.team, 30), clean(b.discipline ?? u.discipline, 40),
      ['M', 'F', ''].includes(b.gender) ? b.gender : u.gender, b.weight === '' ? null : num(b.weight, u.weight), Math.min(7, Math.max(1, num(b.weekly_goal, u.weekly_goal))), id);
  if (u.status === 'pending' && status === 'active') L.notify(id, 'approved', '✅ ¡Tu cuenta fue aprobada! Bienvenido a RADICAL', '#/');
  res.json({ ok: true });
});
r.post('/users/:id/reset-link', (req, res) => {
  const token = crypto.randomBytes(24).toString('hex');
  db.prepare('INSERT INTO reset_tokens(token,user_id,expires_at) VALUES(?,?,?)').run(token, +req.params.id, new Date(Date.now() + 24 * 3600e3).toISOString());
  res.json({ path: `/#/reset/${token}` });
});

// ---------- Moderación ----------
r.get('/posts', (req, res) => {
  const q = '%' + clean(req.query.q, 40).toLowerCase() + '%';
  res.json(C.queryPosts(req.user, "(lower(p.text) LIKE @q OR lower(u.name) LIKE @q)", { q }, 'ORDER BY p.created_at DESC LIMIT 40'));
});
r.get('/comments', (req, res) => {
  res.json(db.prepare(`SELECT c.id,c.text,c.created_at,c.post_id,u.name,u.username FROM comments c JOIN users u ON u.id=c.user_id WHERE c.deleted=0 ORDER BY c.id DESC LIMIT 60`).all());
});
r.get('/reports', (req, res) => {
  const rows = db.prepare(`SELECT r.*, u.name reporter FROM reports r JOIN users u ON u.id=r.reporter_id WHERE r.status='open' ORDER BY r.id DESC LIMIT 100`).all();
  res.json(rows.map((x) => {
    let preview = '';
    if (x.target_type === 'post') preview = db.prepare('SELECT text FROM posts WHERE id=?').get(x.target_id)?.text || '(eliminada)';
    if (x.target_type === 'comment') preview = db.prepare('SELECT text FROM comments WHERE id=?').get(x.target_id)?.text || '(eliminado)';
    if (x.target_type === 'user') preview = db.prepare('SELECT name FROM users WHERE id=?').get(x.target_id)?.name || '';
    return { ...x, preview };
  }));
});
r.put('/reports/:id', (req, res) => {
  const rep = db.prepare('SELECT * FROM reports WHERE id=?').get(+req.params.id); if (!rep) return res.status(404).json({ error: 'No existe' });
  if (req.body?.action === 'delete') {
    if (rep.target_type === 'post') db.prepare('UPDATE posts SET deleted=1 WHERE id=?').run(rep.target_id);
    if (rep.target_type === 'comment') db.prepare('UPDATE comments SET deleted=1 WHERE id=?').run(rep.target_id);
    if (rep.target_type === 'story') db.prepare('UPDATE stories SET deleted=1 WHERE id=?').run(rep.target_id);
  }
  db.prepare("UPDATE reports SET status='closed' WHERE id=?").run(rep.id); res.json({ ok: true });
});

// ---------- Retos ----------
function challengeFields(b, c = {}) {
  const start = toSql(b.start_at) || c.start_at, end = toSql(b.end_at) || c.end_at;
  return {
    title: clean(b.title ?? c.title, 80), description: clean(b.description ?? c.description, 1000), exercise: clean(b.exercise ?? c.exercise, 60),
    weight: b.weight === '' ? null : num(b.weight, c.weight ?? null), type: Object.keys(G.UNITS).includes(b.type) ? b.type : (c.type || 'max_reps'),
    start_at: start, end_at: end, attempts: Math.min(10, Math.max(1, num(b.attempts, c.attempts ?? 1))),
    classification: ['general', 'gender', 'weight'].includes(b.classification) ? b.classification : (c.classification || 'gender'),
    prize: clean(b.prize ?? c.prize, 120), points: Math.max(0, num(b.points, c.points ?? 50)), rules: clean(b.rules ?? c.rules, 1500),
    featured: b.featured === '1' || b.featured === 'true' || b.featured === true || b.featured === 1 ? 1 : (b.featured === undefined ? c.featured || 0 : 0),
  };
}
r.post('/challenges', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), (req, res) => {
  const f = challengeFields(req.body || {});
  if (!f.title || !f.start_at || !f.end_at || f.end_at <= f.start_at) return res.status(400).json({ error: 'Título y fechas válidas son obligatorios' });
  const img = fileInfo(req.files?.image?.[0]), vid = fileInfo(req.files?.video?.[0]);
  if (f.featured) db.prepare('UPDATE challenges SET featured=0').run();
  const id = db.prepare(`INSERT INTO challenges(title,description,exercise,weight,type,start_at,end_at,attempts,classification,prize,points,rules,featured,image,video)
    VALUES(@title,@description,@exercise,@weight,@type,@start_at,@end_at,@attempts,@classification,@prize,@points,@rules,@featured,@image,@video)`)
    .run({ ...f, image: img.url, video: vid.url }).lastInsertRowid;
  L.notifyAll('challenge', `🏆 Nuevo reto: ${f.title}`, `#/reto/${id}`, req.user.id);
  C.autoPost(null, 'challenge', `🏆 Nuevo reto: ${f.title}${f.weight ? ` · ${f.weight} kg` : ''}\n${f.description}`.trim(), { challenge_id: id }, img.url, img.url ? 'image' : '');
  C.autoStory(null, 'challenge', f.title, { title: f.title, body: f.description.slice(0, 120), kind: 'challenge', image: img.url });
  res.json({ ok: true, id });
});
r.put('/challenges/:id', upload.fields([{ name: 'image', maxCount: 1 }, { name: 'video', maxCount: 1 }]), (req, res) => {
  const c = db.prepare('SELECT * FROM challenges WHERE id=?').get(+req.params.id); if (!c) return res.status(404).json({ error: 'No existe' });
  const f = challengeFields(req.body || {}, c);
  if (f.end_at <= f.start_at) return res.status(400).json({ error: 'La fecha fin debe ser posterior al inicio' });
  const img = fileInfo(req.files?.image?.[0]), vid = fileInfo(req.files?.video?.[0]);
  if (f.featured) db.prepare('UPDATE challenges SET featured=0').run();
  db.prepare(`UPDATE challenges SET title=@title,description=@description,exercise=@exercise,weight=@weight,type=@type,start_at=@start_at,end_at=@end_at,attempts=@attempts,
    classification=@classification,prize=@prize,points=@points,rules=@rules,featured=@featured,image=@image,video=@video WHERE id=@id`)
    .run({ ...f, image: img.url || c.image, video: vid.url || c.video, id: c.id });
  res.json({ ok: true });
});
r.delete('/challenges/:id', (req, res) => {
  const id = +req.params.id;
  db.prepare('DELETE FROM challenge_entries WHERE challenge_id=?').run(id); db.prepare('DELETE FROM challenge_joins WHERE challenge_id=?').run(id);
  db.prepare('DELETE FROM challenges WHERE id=?').run(id); res.json({ ok: true });
});
r.post('/challenges/:id/finalize', (req, res) => { const w = G.finalizeChallenge(+req.params.id); res.json({ ok: true, winners: w || [] }); });

r.get('/entries', (req, res) => {
  const st = ['pending', 'approved', 'rejected'].includes(req.query.status) ? req.query.status : 'pending';
  const cid = num(req.query.challenge_id);
  res.json(db.prepare(`SELECT e.*, u.name, u.username, u.avatar, u.gender, c.title challenge, c.type FROM challenge_entries e JOIN users u ON u.id=e.user_id JOIN challenges c ON c.id=e.challenge_id
    WHERE e.status=? AND (? IS NULL OR e.challenge_id=?) ORDER BY e.created_at ${st === 'pending' ? 'ASC' : 'DESC'} LIMIT 100`).all(st, cid, cid)
    .map((e) => ({ ...e, unit: G.UNITS[e.type] })));
});
r.put('/entries/:id', (req, res) => {
  const e = db.prepare('SELECT e.*, c.title, c.points, c.type FROM challenge_entries e JOIN challenges c ON c.id=e.challenge_id WHERE e.id=?').get(+req.params.id);
  if (!e) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {}; const result = b.result != null && num(b.result) > 0 ? num(b.result) : e.result;
  const status = ['approved', 'rejected', 'pending'].includes(b.status) ? b.status : e.status;
  db.prepare('UPDATE challenge_entries SET result=?,status=?,review_note=?,reviewed_by=? WHERE id=?').run(result, status, clean(b.review_note, 300), req.user.id, e.id);
  if (status === 'approved') {
    L.award(e.user_id, 'challenge_complete', e.challenge_id, e.points);
    const pos = L.challengeRanking(e.challenge_id, {}).find((x) => x.id === e.user_id)?.position;
    L.notify(e.user_id, 'result_approved', `✅ Resultado aprobado en “${e.title}”: ${result} ${G.UNITS[e.type]}${pos ? ` · vas #${pos}` : ''}`, `#/reto/${e.challenge_id}`, req.user.id);
    L.checkBadges(e.user_id);
  } else if (status === 'rejected') {
    L.notify(e.user_id, 'result_rejected', `❌ Resultado rechazado en “${e.title}”${b.review_note ? ': ' + clean(b.review_note, 80) : ''}`, `#/reto/${e.challenge_id}`, req.user.id);
  }
  res.json({ ok: true });
});

// ---------- Temporadas ----------
r.post('/seasons', (req, res) => {
  const b = req.body || {}; const name = clean(b.name, 60);
  const s = clean(b.start_at, 10), e = clean(b.end_at, 10);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(s) || !/^\d{4}-\d{2}-\d{2}$/.test(e) || e <= s) return res.status(400).json({ error: 'Nombre y fechas válidas requeridos' });
  const weeks = (new Date(e) - new Date(s)) / (7 * 864e5);
  if (weeks < 4 || weeks > 16) return res.status(400).json({ error: 'Una temporada dura entre 4 y 16 semanas (recomendado 8 a 12)' });
  const cur = L.currentSeason(); if (cur) G.closeSeason(cur.id);
  const id = db.prepare("INSERT INTO seasons(name,start_at,end_at,status) VALUES(?,?,?,'active')").run(name, s, e).lastInsertRowid;
  L.notifyAll('season', `🔥 Comienza la temporada “${name}”. ¡El ranking arranca de cero!`, '#/ranking', req.user.id);
  res.json({ ok: true, id });
});
r.post('/seasons/:id/close', (req, res) => res.json({ ok: G.closeSeason(+req.params.id) }));

// ---------- Configuración de puntos ----------
r.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT key,value FROM settings').all(); const o = {}; rows.forEach((x) => (o[x.key] = x.value)); res.json(o);
});
r.put('/settings', (req, res) => {
  const ALLOWED = ['points.attendance', 'points.workout', 'points.pr_validated', 'points.challenge_join', 'points.challenge_complete', 'points.challenge_win', 'points.event', 'gym.name', 'gym.invite_code', 'weight.bands', 'store.whatsapp', 'store.recipient', 'store.currency', 'store.payment_info'];
  Object.entries(req.body || {}).forEach(([k, v]) => {
    if (!ALLOWED.includes(k)) return;
    if (k.startsWith('points.')) { const n = Math.max(0, Math.min(10000, Math.round(Number(v) || 0))); putSetting(k, n); }
    else if (k === 'weight.bands') { const arr = String(v).split(',').map(Number).filter((x) => x > 0).sort((a, b) => a - b); if (arr.length) putSetting(k, JSON.stringify(arr)); }
    else if (k === 'store.whatsapp') putSetting(k, String(v).replace(/\D/g, '').slice(0, 16));
    else if (k === 'store.recipient') { const n = Number(v); putSetting(k, Number.isInteger(n) && n > 0 && db.prepare("SELECT 1 FROM users WHERE id=? AND status='active' AND role IN ('admin','owner','coach')").get(n) ? n : ''); }
    else if (k === 'store.payment_info') putSetting(k, clean(v, 600));
    else putSetting(k, clean(v, 60));
  });
  res.json({ ok: true });
});

// ---------- Anuncios, promociones y eventos ----------
r.get('/announcements', (req, res) => res.json(db.prepare('SELECT * FROM announcements WHERE deleted=0 ORDER BY created_at DESC LIMIT 60').all()));
r.post('/announcements', upload.single('image'), (req, res) => {
  const b = req.body || {}; const f = fileInfo(req.file);
  const kind = ['promo', 'discount', 'event', 'notice', 'schedule', 'closure', 'competition'].includes(b.kind) ? b.kind : 'notice';
  const title = clean(b.title, 100); if (!title) return res.status(400).json({ error: 'El título es obligatorio' });
  const ev = b.event_at ? toSql(b.event_at) : '';
  const id = db.prepare('INSERT INTO announcements(kind,title,body,image,event_at,in_story,pinned,created_by) VALUES(?,?,?,?,?,?,?,?)')
    .run(kind, title, clean(b.body, 1500), f.url, ev || '', b.in_story === '1' || b.in_story === 'true' ? 1 : 0, b.pinned === '1' || b.pinned === 'true' ? 1 : 0, req.user.id).lastInsertRowid;
  L.notifyAll('announcement', `📣 ${title}`, '#/', req.user.id);
  res.json({ ok: true, id });
});
r.put('/announcements/:id', upload.single('image'), (req, res) => {
  const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(+req.params.id); if (!a) return res.status(404).json({ error: 'No existe' });
  const b = req.body || {}; const f = fileInfo(req.file);
  db.prepare('UPDATE announcements SET title=?,body=?,image=?,pinned=?,in_story=? WHERE id=?')
    .run(clean(b.title ?? a.title, 100), clean(b.body ?? a.body, 1500), f.url || a.image, b.pinned === undefined ? a.pinned : (b.pinned === '1' || b.pinned === 'true' ? 1 : 0), b.in_story === undefined ? a.in_story : (b.in_story === '1' || b.in_story === 'true' ? 1 : 0), a.id);
  res.json({ ok: true });
});
r.delete('/announcements/:id', (req, res) => { db.prepare('UPDATE announcements SET deleted=1 WHERE id=?').run(+req.params.id); res.json({ ok: true }); });
// Asistencia a eventos del gimnasio → puntos
r.post('/announcements/:id/attendance', (req, res) => {
  const a = db.prepare('SELECT * FROM announcements WHERE id=?').get(+req.params.id); if (!a) return res.status(404).json({ error: 'No existe' });
  let n = 0; (Array.isArray(req.body?.user_ids) ? req.body.user_ids : []).forEach((uid) => { if (L.award(+uid, 'event', a.id)) { n++; L.notify(+uid, 'points', `🎉 +${getSetting('points.event')} puntos por asistir a “${a.title}”`, '#/ranking'); } });
  res.json({ ok: true, awarded: n });
});

// ---------- Insignias ----------
r.get('/badges', (req, res) => res.json(db.prepare('SELECT b.*, (SELECT COUNT(*) FROM user_badges ub WHERE ub.badge_id=b.id) holders FROM badges b ORDER BY b.id').all()));
r.post('/badges', (req, res) => {
  const b = req.body || {}; const name = clean(b.name, 40); if (!name) return res.status(400).json({ error: 'Nombre requerido' });
  const code = 'custom_' + crypto.randomBytes(3).toString('hex');
  db.prepare("INSERT INTO badges(code,name,description,icon,kind) VALUES(?,?,?,?,'manual')").run(code, name, clean(b.description, 120), clean(b.icon, 4) || '🏅');
  res.json({ ok: true });
});
r.put('/badges/:id', (req, res) => {
  const b = req.body || {}; const x = db.prepare('SELECT * FROM badges WHERE id=?').get(+req.params.id); if (!x) return res.status(404).json({ error: 'No existe' });
  db.prepare('UPDATE badges SET name=?,description=?,icon=?,active=? WHERE id=?').run(clean(b.name ?? x.name, 40), clean(b.description ?? x.description, 120), clean(b.icon ?? x.icon, 4), b.active === undefined ? x.active : (b.active ? 1 : 0), x.id);
  res.json({ ok: true });
});
r.post('/badges/:id/grant', (req, res) => {
  const b = db.prepare('SELECT * FROM badges WHERE id=?').get(+req.params.id); if (!b) return res.status(404).json({ error: 'No existe' });
  res.json({ ok: L.grantBadge(+req.body?.user_id, b.code, 'Otorgada por administración') });
});
r.delete('/badges/:id/grant/:uid', (req, res) => { db.prepare('DELETE FROM user_badges WHERE badge_id=? AND user_id=?').run(+req.params.id, +req.params.uid); res.json({ ok: true }); });

module.exports = r;
