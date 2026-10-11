const express = require('express');
const C = require('./common');
const { db, L, upload, fileInfo, clean, num, isStaff, staff } = C;

const r = express.Router();
const UNITS = { max_reps: 'reps', max_weight: 'kg', max_pullups: 'reps', max_plank: 's', weekly_volume: 'kg', most_workouts: 'entrenos', team: 'reps' };

const statusOf = (c) => {
  const now = L.nowSql();
  return c.start_at > now ? 'upcoming' : c.end_at < now ? 'ended' : 'active';
};
function chOut(c, meId) {
  const myEntries = db.prepare('SELECT id,result,video,note,status,review_note,created_at FROM challenge_entries WHERE challenge_id=? AND user_id=? ORDER BY id DESC').all(c.id, meId);
  const used = myEntries.filter((e) => e.status !== 'rejected').length;
  return {
    ...c, unit: UNITS[c.type] || '', status: statusOf(c),
    participants: db.prepare('SELECT COUNT(*) c FROM challenge_joins WHERE challenge_id=?').get(c.id).c,
    joined: !!db.prepare('SELECT 1 FROM challenge_joins WHERE challenge_id=? AND user_id=?').get(c.id, meId),
    myEntries, attemptsLeft: Math.max(0, c.attempts - used),
  };
}

// ---------- Retos ----------
r.get('/challenges', (req, res) => {
  const all = db.prepare('SELECT * FROM challenges ORDER BY start_at DESC').all().map((c) => chOut(c, req.user.id));
  res.json({
    active: all.filter((c) => c.status === 'active').sort((a, b) => b.featured - a.featured),
    upcoming: all.filter((c) => c.status === 'upcoming').reverse(),
    past: all.filter((c) => c.status === 'ended').slice(0, 20),
  });
});
r.get('/challenges/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM challenges WHERE id=?').get(+req.params.id);
  if (!c) return res.status(404).json({ error: 'Reto no encontrado' });
  const out = chOut(c, req.user.id);
  const ranking = L.challengeRanking(c.id, {});
  out.ranking = ranking; out.categories = L.weightCategories();
  if (c.type === 'team') {
    const t = {}; ranking.forEach((x) => { const u = db.prepare('SELECT team FROM users WHERE id=?').get(x.id); const k = u?.team || 'Sin equipo'; t[k] = (t[k] || 0) + x.result; });
    out.teams = Object.entries(t).map(([team, result]) => ({ team, result })).sort((a, b) => b.result - a.result).map((x, i) => ({ ...x, position: i + 1 }));
  }
  res.json(out);
});
r.post('/challenges/:id/join', (req, res) => {
  const c = db.prepare('SELECT * FROM challenges WHERE id=?').get(+req.params.id);
  if (!c || statusOf(c) === 'ended') return res.status(400).json({ error: 'Este reto ya terminó' });
  const ins = db.prepare('INSERT OR IGNORE INTO challenge_joins(challenge_id,user_id) VALUES(?,?)').run(c.id, req.user.id);
  const pts = ins.changes ? L.award(req.user.id, 'challenge_join', c.id) : 0;
  res.json({ ok: true, points: pts });
});
r.post('/challenges/:id/entries', upload.single('video'), (req, res) => {
  const c = db.prepare('SELECT * FROM challenges WHERE id=?').get(+req.params.id);
  if (!c) return res.status(404).json({ error: 'Reto no encontrado' });
  if (statusOf(c) !== 'active') return res.status(400).json({ error: 'El reto no está activo' });
  const result = num(req.body?.result);
  if (result == null || result <= 0) return res.status(400).json({ error: 'Ingresa un resultado válido' });
  const used = db.prepare("SELECT COUNT(*) c FROM challenge_entries WHERE challenge_id=? AND user_id=? AND status<>'rejected'").get(c.id, req.user.id).c;
  if (used >= c.attempts) return res.status(400).json({ error: `Ya usaste tus ${c.attempts} intentos` });
  if (db.prepare('INSERT OR IGNORE INTO challenge_joins(challenge_id,user_id) VALUES(?,?)').run(c.id, req.user.id).changes) L.award(req.user.id, 'challenge_join', c.id);
  const f = fileInfo(req.file);
  db.prepare('INSERT INTO challenge_entries(challenge_id,user_id,result,video,note) VALUES(?,?,?,?,?)').run(c.id, req.user.id, result, f.url, clean(req.body?.note, 300));
  db.prepare("SELECT id FROM users WHERE role IN ('admin','owner') AND status='active'").all()
    .forEach((a) => L.notify(a.id, 'entry_pending', `⏱ ${req.user.name} registró ${result} ${UNITS[c.type]} en “${c.title}” (por validar)`, '#/admin/resultados', req.user.id));
  res.json({ ok: true, challenge: chOut(c, req.user.id) });
});

// ---------- Rankings ----------
const filt = (q) => ({ gender: ['M', 'F'].includes(q.gender) ? q.gender : 'all', wcat: q.wcat || 'all' });
r.get('/rankings/:tab', (req, res) => {
  const f = filt(req.query); const tab = req.params.tab; const base = { categories: L.weightCategories(), filters: f };
  if (tab === 'challenge') {
    let c = req.query.challenge_id ? db.prepare('SELECT * FROM challenges WHERE id=?').get(+req.query.challenge_id) : null;
    c = c || db.prepare("SELECT * FROM challenges WHERE end_at>=datetime('now') AND start_at<=datetime('now') ORDER BY featured DESC, start_at DESC LIMIT 1").get()
      || db.prepare('SELECT * FROM challenges ORDER BY end_at DESC LIMIT 1').get();
    if (!c) return res.json({ ...base, challenge: null, rows: [] });
    return res.json({ ...base, challenge: chOut(c, req.user.id), unit: UNITS[c.type], rows: L.challengeRanking(c.id, f) });
  }
  if (tab === 'season') { const s = L.seasonRanking(f); return res.json({ ...base, season: s.season, unit: 'pts', rows: s.rows }); }
  if (tab === 'streak') return res.json({ ...base, unit: 'sem', rows: L.streakRanking(f) });
  if (tab === 'strength') {
    const lift = ['squat', 'bench', 'deadlift', 'total'].includes(req.query.lift) ? req.query.lift : 'total';
    return res.json({ ...base, lift, unit: 'kg', rows: L.strengthRanking(lift, f) });
  }
  if (tab === 'prs') return res.json({ ...base, unit: 'PRs', rows: L.prsRanking(f) });
  res.status(404).json({ error: 'Ranking no existe' });
});

// ---------- Temporadas ----------
r.get('/seasons', (req, res) => {
  const cur = L.currentSeason();
  const withAwards = (s) => ({ ...s, results: undefined, awards: db.prepare(`SELECT a.award, a.team, u.id user_id, u.name, u.username, u.avatar FROM season_awards a LEFT JOIN users u ON u.id=a.user_id WHERE a.season_id=?`).all(s.id) });
  const hist = db.prepare("SELECT * FROM seasons WHERE status='closed' ORDER BY id DESC").all().map((s) => ({ ...withAwards(s), top: (() => { try { return JSON.parse(s.results).slice(0, 10); } catch { return []; } })() }));
  res.json({ current: cur ? { ...cur, results: undefined, top: L.seasonRanking({}).rows.slice(0, 10) } : null, history: hist });
});

// =====================================================================
// Lógica compartida con administración y tareas periódicas
// =====================================================================
function finalizeChallenge(id) {
  const c = db.prepare('SELECT * FROM challenges WHERE id=?').get(id);
  if (!c || c.finalized) return null;
  db.prepare('UPDATE challenges SET finalized=1 WHERE id=?').run(id);
  const rows = L.challengeRanking(id, {});
  const winners = [];
  const pick = (list, label) => { if (list[0]) winners.push({ ...list[0], label }); };
  if (c.classification === 'general') pick(rows, 'General');
  else if (c.classification === 'weight') L.weightCategories().forEach((w) => pick(rows.filter((x) => x.wcat === w), w));
  else { pick(rows.filter((x) => x.gender === 'M'), 'Hombres'); pick(rows.filter((x) => x.gender === 'F'), 'Mujeres'); }
  winners.forEach((w) => {
    L.award(w.id, 'challenge_win', c.id); L.grantBadge(w.id, 'challenge_winner', c.title);
    L.notify(w.id, 'ranking', `🏆 ¡Ganaste el reto “${c.title}” (${w.label})!`, `#/reto/${c.id}`);
  });
  rows.filter((x) => !winners.some((w) => w.id === x.id)).forEach((x) => L.notify(x.id, 'ranking', `Terminaste #${x.position} en “${c.title}”`, `#/reto/${c.id}`));
  if (rows.length) {
    C.autoPost(null, 'result', `Resultados finales de “${c.title}” 🏆`, { challenge_id: c.id, unit: UNITS[c.type], winners: winners.map((w) => ({ id: w.id, name: w.name, avatar: w.avatar, label: w.label, result: w.result })), top: rows.slice(0, 3).map((x) => ({ id: x.id, name: x.name, result: x.result })) });
    C.autoStory(null, 'challenge', `Resultados · ${c.title}`, { title: c.title, kind: 'result', body: winners.map((w) => `${w.label}: ${w.name}`).join(' · ') });
  }
  return winners;
}

function closeSeason(id) {
  const s = db.prepare('SELECT * FROM seasons WHERE id=?').get(id);
  if (!s || s.status === 'closed') return false;
  const rows = L.seasonRanking({}, id).rows;
  const add = (award, userId, team = '') => {
    db.prepare('INSERT INTO season_awards(season_id,award,user_id,team) VALUES(?,?,?,?)').run(id, award, userId, team);
    if (userId) L.notify(userId, 'badge', `🏆 Premio de temporada “${s.name}”: ${AWARD_NAMES[award]}`, `#/u/${userId}`);
  };
  const AWARD_NAMES = { champion_m: 'Campeón masculino', champion_f: 'Campeona femenina', consistent: 'Más constante', progress: 'Mejor progreso', lifter: 'Mejor levantador', rookie: 'Revelación', team: 'Equipo campeón' };
  const m = rows.find((x) => x.gender === 'M'), f = rows.find((x) => x.gender === 'F');
  if (m) add('champion_m', m.id); if (f) add('champion_f', f.id);
  const days = db.prepare(`SELECT user_id, COUNT(DISTINCT date) n FROM (SELECT user_id,date FROM checkins UNION SELECT user_id,date FROM workouts)
    WHERE date BETWEEN ? AND ? GROUP BY user_id ORDER BY n DESC LIMIT 1`).get(s.start_at.slice(0, 10), s.end_at.slice(0, 10));
  if (days) add('consistent', days.user_id);
  const prog = db.prepare(`SELECT user_id, COUNT(*) n FROM prs WHERE status='approved' AND date(created_at) BETWEEN ? AND ? GROUP BY user_id ORDER BY n DESC LIMIT 1`).get(s.start_at.slice(0, 10), s.end_at.slice(0, 10));
  if (prog) add('progress', prog.user_id);
  const lift = L.strengthRanking('total', {})[0]; if (lift) add('lifter', lift.id);
  const rookie = rows.find((x) => db.prepare('SELECT 1 FROM users WHERE id=? AND date(created_at)>=?').get(x.id, s.start_at.slice(0, 10)));
  if (rookie) add('rookie', rookie.id);
  const teams = {}; rows.forEach((x) => { const t = db.prepare('SELECT team FROM users WHERE id=?').get(x.id)?.team; if (t) teams[t] = (teams[t] || 0) + x.result; });
  const bt = Object.entries(teams).sort((a, b) => b[1] - a[1])[0]; if (bt) add('team', null, bt[0]);
  const results = rows.slice(0, 50).map((x) => ({ id: x.id, name: x.name, username: x.username, avatar: x.avatar, gender: x.gender, points: x.result, position: x.position }));
  db.prepare("UPDATE seasons SET status='closed', results=? WHERE id=?").run(JSON.stringify(results), id);
  return true;
}

// Tareas periódicas: cerrar retos vencidos, temporadas vencidas, top 3 mensual
function periodic() {
  try {
    db.prepare("SELECT id FROM challenges WHERE finalized=0 AND end_at<?").all(L.nowSql()).forEach((c) => finalizeChallenge(c.id));
    db.prepare("SELECT id FROM seasons WHERE status='active' AND end_at<?").all(L.todayStr()).forEach((s) => closeSeason(s.id));
    const d = new Date(); const first = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1)).toISOString().slice(0, 10);
    const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString().slice(0, 10);
    db.prepare(`SELECT user_id FROM points_ledger WHERE date(created_at)>=? AND date(created_at)<? GROUP BY user_id ORDER BY SUM(points) DESC LIMIT 3`).all(first, last)
      .forEach((x) => L.grantBadge(x.user_id, 'top3_monthly', first.slice(0, 7)));
  } catch (e) { console.error('[periodic]', e.message); }
}

module.exports = { router: r, finalizeChallenge, closeSeason, periodic, UNITS, chOut, statusOf };
