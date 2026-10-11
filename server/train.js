const express = require('express');
const C = require('./common');
const { db, L, upload, fileInfo, clean, num, isStaff, coachOrStaff, getPost } = C;

const r = express.Router();

// Tras registrar un día de entrenamiento: racha semanal, insignias y logros
function afterTraining(user) {
  const st = L.streakInfo(user.id);
  const wk = st.thisWeek.start;
  if (st.thisWeek.trained >= st.goal) {
    const done = db.prepare("SELECT 1 FROM posts WHERE user_id=? AND kind='streak' AND json_extract(meta,'$.week')=?").get(user.id, wk);
    if (!done) {
      L.notify(user.id, 'streak', `🔥 ¡Semana completada! ${st.thisWeek.trained} de ${st.goal} entrenamientos · racha de ${st.current}`, `#/u/${user.id}`);
      C.autoPost(user.id, 'streak', `Completó su semana: ${st.thisWeek.trained} de ${st.goal} entrenamientos 🔥 Lleva ${st.current} ${st.current === 1 ? 'semana' : 'semanas'} seguidas.`, { week: wk, weeks: st.current });
    }
  }
  L.checkBadges(user.id);
  return st;
}

r.get('/streak/:id', (req, res) => res.json(L.streakInfo(+req.params.id)));

// ---------- Asistencia (check-in) ----------
r.post('/checkin', (req, res) => {
  const today = L.todayStr(); let date = clean(req.body?.date, 10) || today;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < L.addDays(today, -7)) return res.status(400).json({ error: 'Fecha no válida (hasta 7 días atrás)' });
  const ins = db.prepare('INSERT OR IGNORE INTO checkins(user_id,date) VALUES(?,?)').run(req.user.id, date);
  const pts = ins.changes ? L.award(req.user.id, 'attendance', date) : 0;
  const st = afterTraining(req.user);
  res.json({ ok: true, already: !ins.changes, points: pts, streak: st });
});
r.delete('/checkin/:date', (req, res) => {
  db.prepare('DELETE FROM checkins WHERE user_id=? AND date=?').run(req.user.id, req.params.date);
  res.json({ ok: true, streak: L.streakInfo(req.user.id) });
});

// ---------- Entrenamientos ----------
r.post('/workouts', (req, res) => {
  const b = req.body || {}; const today = L.todayStr();
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : today;
  if (date > today) return res.status(400).json({ error: 'No puedes registrar días futuros' });
  const sets = (Array.isArray(b.sets) ? b.sets : []).map((s) => ({ exercise: clean(s.exercise, 60), sets: Math.max(1, num(s.sets, 1)), reps: Math.max(1, num(s.reps, 1)), weight: Math.max(0, num(s.weight, 0)) }))
    .filter((s) => s.exercise).slice(0, 40);
  if (!sets.length) return res.status(400).json({ error: 'Agrega al menos un ejercicio' });
  const title = clean(b.title, 60) || 'Entrenamiento';
  const wid = db.transaction(() => {
    const id = db.prepare('INSERT INTO workouts(user_id,date,title,notes) VALUES(?,?,?,?)').run(req.user.id, date, title, clean(b.notes, 500)).lastInsertRowid;
    sets.forEach((s) => db.prepare('INSERT INTO workout_sets(workout_id,exercise,sets,reps,weight) VALUES(?,?,?,?,?)').run(id, s.exercise, s.sets, s.reps, s.weight));
    return id;
  })();
  const pts = L.award(req.user.id, 'workout', wid);
  let postId = null;
  if (b.publish) {
    const vol = sets.reduce((a, s) => a + s.sets * s.reps * s.weight, 0);
    postId = C.autoPost(req.user.id, 'workout', clean(b.notes, 500) || `Completó “${title}” 💪`, { workout_id: wid, title, date, volume: vol, sets });
  }
  const st = afterTraining(req.user);
  res.json({ ok: true, id: wid, points: pts, post: postId, streak: st });
});
r.get('/workouts', (req, res) => {
  const uid = num(req.query.user, req.user.id);
  const ws = db.prepare('SELECT * FROM workouts WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 40').all(uid);
  res.json(ws.map((w) => ({ ...w, sets: db.prepare('SELECT exercise,sets,reps,weight FROM workout_sets WHERE workout_id=?').all(w.id) })));
});
r.delete('/workouts/:id', (req, res) => {
  const w = db.prepare('SELECT * FROM workouts WHERE id=? AND user_id=?').get(+req.params.id, req.user.id);
  if (!w) return res.status(404).json({ error: 'No encontrado' });
  db.prepare('DELETE FROM workout_sets WHERE workout_id=?').run(w.id); db.prepare('DELETE FROM workouts WHERE id=?').run(w.id);
  res.json({ ok: true });
});

// ---------- Progreso corporal ----------
r.post('/progress', upload.single('photo'), (req, res) => {
  const b = req.body || {}; const f = fileInfo(req.file); const weight = num(b.weight);
  if (weight == null && !f.url && !clean(b.note)) return res.status(400).json({ error: 'Agrega peso, foto o una nota' });
  const date = /^\d{4}-\d{2}-\d{2}$/.test(b.date) ? b.date : L.todayStr();
  const id = db.prepare('INSERT INTO body_progress(user_id,date,weight,note,photo) VALUES(?,?,?,?,?)').run(req.user.id, date, weight, clean(b.note, 300), f.url).lastInsertRowid;
  if (weight != null) db.prepare('UPDATE users SET weight=? WHERE id=?').run(weight, req.user.id);
  let post = null;
  if (b.publish === '1' || b.publish === 'true') post = C.autoPost(req.user.id, 'progress', clean(b.note, 300) || 'Actualicé mi progreso 📈', { weight, date }, f.url, f.url ? 'image' : '');
  L.checkBadges(req.user.id);
  res.json({ ok: true, id, post });
});
r.get('/progress/:uid', (req, res) => {
  res.json(db.prepare('SELECT * FROM body_progress WHERE user_id=? ORDER BY date DESC, id DESC LIMIT 60').all(+req.params.uid));
});

// ---------- Récords personales ----------
r.get('/pr-exercises', (req, res) => res.json(db.prepare('SELECT id,code,name,unit FROM pr_exercises WHERE active=1 ORDER BY id').all()));
r.get('/prs/:uid', (req, res) => {
  const uid = +req.params.uid; const own = uid === req.user.id || isStaff(req.user);
  res.json(db.prepare(`SELECT p.*, e.name exercise, e.code, e.unit FROM prs p JOIN pr_exercises e ON e.id=p.exercise_id
    WHERE p.user_id=? ${own ? '' : "AND p.status='approved'"} ORDER BY p.created_at DESC LIMIT 80`).all(uid));
});
r.post('/prs', upload.single('video'), (req, res) => {
  const b = req.body || {}; const f = fileInfo(req.file);
  const ex = db.prepare('SELECT * FROM pr_exercises WHERE id=? AND active=1').get(+b.exercise_id);
  const value = num(b.value);
  if (!ex || !value || value <= 0) return res.status(400).json({ error: 'Elige ejercicio y un valor válido' });
  const id = db.prepare('INSERT INTO prs(user_id,exercise_id,value,reps,video,note) VALUES(?,?,?,?,?,?)')
    .run(req.user.id, ex.id, value, Math.max(1, num(b.reps, 1)), f.url, clean(b.note, 300)).lastInsertRowid;
  const reviewers = db.prepare("SELECT id FROM users WHERE status='active' AND (role IN ('admin','owner') OR id=?)").all(req.user.coach_id || 0);
  reviewers.forEach((a) => L.notify(a.id, 'pr_pending', `🏋️ ${req.user.name} registró ${ex.name} ${value} ${ex.unit} (por validar)`, '#/admin/prs', req.user.id));
  res.json({ ok: true, id });
});

// Validación de PR: administración, dueño o el entrenador asignado
r.get('/review/prs', coachOrStaff, (req, res) => {
  const mine = isStaff(req.user) ? '' : 'AND u.coach_id=@me';
  res.json(db.prepare(`SELECT p.*, e.name exercise, e.unit, u.name, u.username, u.avatar FROM prs p JOIN pr_exercises e ON e.id=p.exercise_id JOIN users u ON u.id=p.user_id
    WHERE p.status='pending' ${mine} ORDER BY p.created_at ASC`).all({ me: req.user.id }));
});
r.put('/review/prs/:id', coachOrStaff, (req, res) => {
  const p = db.prepare('SELECT p.*, e.name exercise, e.unit, u.name uname, u.coach_id FROM prs p JOIN pr_exercises e ON e.id=p.exercise_id JOIN users u ON u.id=p.user_id WHERE p.id=?').get(+req.params.id);
  if (!p) return res.status(404).json({ error: 'No encontrado' });
  if (!isStaff(req.user) && p.coach_id !== req.user.id) return res.status(403).json({ error: 'Solo el entrenador asignado o la administración' });
  const status = req.body?.status === 'approved' ? 'approved' : 'rejected';
  if (status === 'approved' && req.body?.value != null) { const v = num(req.body.value); if (v > 0) p.value = v; }
  db.prepare('UPDATE prs SET status=?, value=?, note=CASE WHEN ?<>\'\' THEN ? ELSE note END WHERE id=?').run(status, p.value, clean(req.body?.review_note), clean(req.body?.review_note), p.id);
  if (status === 'approved') {
    const pts = L.award(p.user_id, 'pr_validated', p.id);
    L.notify(p.user_id, 'pr', `🏆 PR validado: ${p.exercise} ${p.value} ${p.unit}${pts ? ` (+${pts} pts)` : ''}`, `#/u/${p.user_id}`, req.user.id);
    const postId = C.autoPost(p.user_id, 'pr', `Nuevo PR en ${p.exercise}: ${p.value} ${p.unit} × ${p.reps}`, { exercise: p.exercise, value: p.value, unit: p.unit, reps: p.reps }, p.video, p.video ? 'video' : '');
    C.autoStory(p.user_id, 'pr', `Nuevo PR · ${p.exercise}`, { title: p.exercise, value: `${p.value} ${p.unit}`, kind: 'pr' });
    db.prepare("SELECT follower_id FROM follows WHERE followee_id=?").all(p.user_id).forEach((f) => L.notify(f.follower_id, 'pr', `🏆 ${p.uname} logró un nuevo PR en ${p.exercise}: ${p.value} ${p.unit}`, `#/post/${postId}`, p.user_id));
    L.checkBadges(p.user_id);
  } else {
    L.notify(p.user_id, 'pr_rejected', `❌ Tu PR de ${p.exercise} no fue validado${req.body?.review_note ? ': ' + clean(req.body.review_note, 80) : ''}`, `#/u/${p.user_id}`, req.user.id);
  }
  res.json({ ok: true });
});

module.exports = r;
