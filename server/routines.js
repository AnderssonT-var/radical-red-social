// Rutinas sugeridas: planes de entrenamiento por objetivo/nivel con días, ejercicios, series y repeticiones
const express = require('express');
const { db } = require('./db');
const { coachOrStaff, isStaff, lite, clean, num } = require('./common');
const r = express.Router();

const GOALS = ['fuerza', 'hipertrofia', 'grasa', 'resistencia', 'general'];
const LEVELS = ['principiante', 'intermedio', 'avanzado'];
const canEdit = (u) => isStaff(u) || u.role === 'coach';

function summary(x) {
  const days = db.prepare('SELECT COUNT(*) c FROM routine_days WHERE routine_id=?').get(x.id).c;
  const exs = db.prepare('SELECT COUNT(*) c FROM routine_exercises WHERE day_id IN (SELECT id FROM routine_days WHERE routine_id=?)').get(x.id).c;
  return { id: x.id, title: x.title, description: x.description, goal: x.goal, level: x.level, days_per_week: x.days_per_week, duration_min: x.duration_min, equipment: x.equipment,
    active: !!x.active, days, exercises: exs, author: lite(db.prepare('SELECT * FROM users WHERE id=?').get(x.created_by)) };
}
function full(x, uid) {
  const days = db.prepare('SELECT * FROM routine_days WHERE routine_id=? ORDER BY pos').all(x.id).map((d) => ({ id: d.id, name: d.name, focus: d.focus,
    exercises: db.prepare('SELECT name,sets,reps,rest,notes FROM routine_exercises WHERE day_id=? ORDER BY pos').all(d.id) }));
  const me = db.prepare('SELECT * FROM user_routine WHERE user_id=? AND routine_id=?').get(uid, x.id);
  return { ...summary(x), days, following: !!me, next_day: me ? Math.min(me.next_day, Math.max(0, days.length - 1)) : null };
}

r.get('/routines', (req, res) => {
  const all = canEdit(req.user) && req.query.all === '1';
  const rows = db.prepare(`SELECT * FROM routines WHERE deleted=0 ${all ? '' : 'AND active=1'} ORDER BY id DESC`).all()
    .filter((x) => (!GOALS.includes(req.query.goal) || x.goal === req.query.goal) && (!LEVELS.includes(req.query.level) || x.level === req.query.level) && (!+req.query.days || x.days_per_week === +req.query.days));
  const mine = db.prepare('SELECT * FROM user_routine WHERE user_id=?').get(req.user.id);
  res.json({ following: mine?.routine_id || null, items: rows.map((x) => ({ ...summary(x), following: mine?.routine_id === x.id })) });
});
r.get('/routines/:id', (req, res) => {
  const x = db.prepare('SELECT * FROM routines WHERE id=? AND deleted=0').get(+req.params.id);
  if (!x || (!x.active && !canEdit(req.user))) return res.status(404).json({ error: 'Rutina no encontrada' });
  res.json(full(x, req.user.id));
});
r.post('/routines/:id/follow', (req, res) => {
  const x = db.prepare('SELECT * FROM routines WHERE id=? AND deleted=0 AND active=1').get(+req.params.id); if (!x) return res.status(404).json({ error: 'Rutina no encontrada' });
  db.prepare('INSERT INTO user_routine(user_id,routine_id,next_day) VALUES(?,?,0) ON CONFLICT(user_id) DO UPDATE SET routine_id=excluded.routine_id, next_day=0, started_at=datetime(\'now\')').run(req.user.id, x.id);
  res.json({ ok: true });
});
r.delete('/routines/:id/follow', (req, res) => { db.prepare('DELETE FROM user_routine WHERE user_id=? AND routine_id=?').run(req.user.id, +req.params.id); res.json({ ok: true }); });
r.post('/routines/:id/advance', (req, res) => { // el miembro terminó el día que le tocaba: pasa al siguiente
  const me = db.prepare('SELECT * FROM user_routine WHERE user_id=? AND routine_id=?').get(req.user.id, +req.params.id); if (!me) return res.json({ ok: true });
  const n = db.prepare('SELECT COUNT(*) c FROM routine_days WHERE routine_id=?').get(me.routine_id).c || 1;
  db.prepare('UPDATE user_routine SET next_day=? WHERE user_id=?').run((me.next_day + 1) % n, req.user.id); res.json({ ok: true });
});

// ---------- Gestión (coach, administrador y dueño)
function save(req, id) {
  const b = req.body || {};
  const title = clean(b.title, 80); if (!title) return 'Escribe el nombre de la rutina';
  const days = (Array.isArray(b.days) ? b.days : []).slice(0, 14).map((d, i) => ({ name: clean(d.name, 60) || `Día ${i + 1}`, focus: clean(d.focus, 60),
    exercises: (Array.isArray(d.exercises) ? d.exercises : []).slice(0, 30).map((e) => ({ name: clean(e.name, 70), sets: Math.min(20, Math.max(1, Math.round(num(e.sets, 3)))), reps: clean(e.reps, 20) || '10', rest: clean(e.rest, 20), notes: clean(e.notes, 160) })).filter((e) => e.name) }))
    .filter((d) => d.exercises.length);
  if (!days.length) return 'Agrega al menos un día con ejercicios';
  const f = { goal: GOALS.includes(b.goal) ? b.goal : 'general', level: LEVELS.includes(b.level) ? b.level : 'principiante', dpw: Math.min(7, Math.max(1, Math.round(num(b.days_per_week, days.length)))),
    dur: Math.min(240, Math.max(10, Math.round(num(b.duration_min, 60)))), active: b.active === false || b.active === '0' ? 0 : 1 };
  db.transaction(() => {
    let rid = id;
    if (rid) {
      db.prepare('UPDATE routines SET title=?,description=?,goal=?,level=?,days_per_week=?,duration_min=?,equipment=?,active=? WHERE id=?').run(title, clean(b.description, 800), f.goal, f.level, f.dpw, f.dur, clean(b.equipment, 80), f.active, rid);
      db.prepare('DELETE FROM routine_exercises WHERE day_id IN (SELECT id FROM routine_days WHERE routine_id=?)').run(rid); db.prepare('DELETE FROM routine_days WHERE routine_id=?').run(rid);
    } else rid = db.prepare('INSERT INTO routines(title,description,goal,level,days_per_week,duration_min,equipment,active,created_by) VALUES(?,?,?,?,?,?,?,?,?)').run(title, clean(b.description, 800), f.goal, f.level, f.dpw, f.dur, clean(b.equipment, 80), f.active, req.user.id).lastInsertRowid;
    days.forEach((d, i) => {
      const did = db.prepare('INSERT INTO routine_days(routine_id,pos,name,focus) VALUES(?,?,?,?)').run(rid, i, d.name, d.focus).lastInsertRowid;
      d.exercises.forEach((e, j) => db.prepare('INSERT INTO routine_exercises(day_id,pos,name,sets,reps,rest,notes) VALUES(?,?,?,?,?,?,?)').run(did, j, e.name, e.sets, e.reps, e.rest, e.notes));
    });
    save.last = rid;
  })();
  return null;
}
r.post('/routines', coachOrStaff, (req, res) => { const err = save(req, null); err ? res.status(400).json({ error: err }) : res.json({ ok: true, id: save.last }); });
r.put('/routines/:id', coachOrStaff, (req, res) => {
  const x = db.prepare('SELECT * FROM routines WHERE id=? AND deleted=0').get(+req.params.id); if (!x) return res.status(404).json({ error: 'No encontrada' });
  if (!isStaff(req.user) && x.created_by !== req.user.id) return res.status(403).json({ error: 'Solo puedes editar tus rutinas' });
  const err = save(req, x.id); err ? res.status(400).json({ error: err }) : res.json({ ok: true, id: x.id });
});
r.delete('/routines/:id', coachOrStaff, (req, res) => {
  const x = db.prepare('SELECT * FROM routines WHERE id=? AND deleted=0').get(+req.params.id); if (!x) return res.status(404).json({ error: 'No encontrada' });
  if (!isStaff(req.user) && x.created_by !== req.user.id) return res.status(403).json({ error: 'Solo puedes eliminar tus rutinas' });
  db.prepare('UPDATE routines SET deleted=1 WHERE id=?').run(x.id); db.prepare('DELETE FROM user_routine WHERE routine_id=?').run(x.id); res.json({ ok: true });
});

module.exports = r;
