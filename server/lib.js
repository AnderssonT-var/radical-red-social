const { db, getSetting } = require('./db');

const TZ = process.env.TZ_GYM || 'America/Guayaquil';

// ---------- Fechas ----------
function todayStr(d = new Date()) {
  return d.toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD
}
function parseDay(s) { const [y, m, d] = s.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)); }
function fmtDay(d) { return d.toISOString().slice(0, 10); }
function addDays(s, n) { const d = parseDay(s); d.setUTCDate(d.getUTCDate() + n); return fmtDay(d); }
function weekStart(s) { // lunes
  const d = parseDay(s); const dow = (d.getUTCDay() + 6) % 7; d.setUTCDate(d.getUTCDate() - dow); return fmtDay(d);
}
function nowSql() { return new Date().toISOString().replace('T', ' ').slice(0, 19); }

// ---------- Notificaciones ----------
const insNotif = db.prepare('INSERT INTO notifications(user_id,actor_id,type,text,link) VALUES(?,?,?,?,?)');
function notify(userId, type, text, link = '', actorId = null) {
  if (!userId || userId === actorId) return;
  insNotif.run(userId, actorId, type, text, link);
}
function notifyAll(type, text, link = '', exceptId = null) {
  const users = db.prepare("SELECT id FROM users WHERE status='active'").all();
  const tx = db.transaction(() => users.forEach((u) => { if (u.id !== exceptId) insNotif.run(u.id, exceptId, type, text, link); }));
  tx();
}

// ---------- Temporada y puntos ----------
function currentSeason() {
  return db.prepare("SELECT * FROM seasons WHERE status='active' ORDER BY id DESC LIMIT 1").get() || null;
}
function pointsConfig() {
  const rows = db.prepare("SELECT key,value FROM settings WHERE key LIKE 'points.%'").all();
  const o = {}; rows.forEach((r) => (o[r.key.slice(7)] = Number(r.value))); return o;
}
// Otorga puntos una sola vez por (usuario, motivo, referencia). Nunca por likes/seguidores/publicaciones.
function award(userId, reason, ref = '', override = null) {
  const pts = Number(override != null && override > 0 ? override : (getSetting('points.' + reason) || 0));
  if (!pts) return 0;
  const s = currentSeason();
  try {
    const r = db.prepare('INSERT INTO points_ledger(user_id,points,reason,ref,season_id) VALUES(?,?,?,?,?)')
      .run(userId, pts, reason, String(ref), s ? s.id : null);
    return r.changes ? pts : 0;
  } catch { return 0; }
}

// ---------- Rachas ----------
function trainingDates(userId) {
  const rows = db.prepare(`SELECT date FROM checkins WHERE user_id=? UNION SELECT date FROM workouts WHERE user_id=?`).all(userId, userId);
  return new Set(rows.map((r) => r.date));
}
function streakInfo(userId) {
  const user = db.prepare('SELECT weekly_goal FROM users WHERE id=?').get(userId);
  const goal = user?.weekly_goal || 4;
  const dates = trainingDates(userId);
  const byWeek = {};
  dates.forEach((d) => { const w = weekStart(d); (byWeek[w] = byWeek[w] || new Set()).add(d); });
  const today = todayStr();
  const thisWeek = weekStart(today);
  const done = (w) => (byWeek[w]?.size || 0) >= goal;
  // racha actual: semanas completas consecutivas hacia atrás (la semana en curso suma si ya cumplió)
  let current = 0;
  let w = done(thisWeek) ? thisWeek : addDays(thisWeek, -7);
  while (done(w)) { current++; w = addDays(w, -7); }
  // mejor racha histórica
  const weeks = Object.keys(byWeek).filter(done).sort();
  let best = 0, run = 0, prev = null;
  for (const wk of weeks) {
    run = prev && addDays(prev, 7) === wk ? run + 1 : 1;
    best = Math.max(best, run); prev = wk;
  }
  const days = [];
  for (let i = 0; i < 7; i++) {
    const d = addDays(thisWeek, i);
    days.push({ date: d, trained: dates.has(d), today: d === today, future: d > today });
  }
  const trainedThisWeek = days.filter((d) => d.trained).length;
  return { goal, current, best, thisWeek: { start: thisWeek, trained: trainedThisWeek, days }, totalWorkouts: dates.size };
}

// ---------- Insignias ----------
function grantBadge(userId, code, note = '') {
  const b = db.prepare('SELECT id,name FROM badges WHERE code=? AND active=1').get(code);
  if (!b) return false;
  const s = currentSeason();
  const r = db.prepare('INSERT OR IGNORE INTO user_badges(user_id,badge_id,season_id,note) VALUES(?,?,?,?)')
    .run(userId, b.id, s ? s.id : 0, note);
  if (r.changes) { notify(userId, 'badge', `🏅 Nueva insignia: ${b.name}`, `#/u/${userId}`); return true; }
  return false;
}
function checkBadges(userId) {
  const st = streakInfo(userId);
  const n = st.totalWorkouts;
  [[10, 'workouts_10'], [50, 'workouts_50'], [100, 'workouts_100']].forEach(([k, c]) => n >= k && grantBadge(userId, c));
  [[1, 'streak_1'], [4, 'streak_4'], [8, 'streak_8'], [12, 'streak_12'], [26, 'streak_26']]
    .forEach(([k, c]) => Math.max(st.best, st.current) >= k && grantBadge(userId, c));
  const prs = db.prepare("SELECT COUNT(*) c FROM prs WHERE user_id=? AND status='approved'").get(userId).c;
  if (prs >= 1) grantBadge(userId, 'first_pr');
  const u = db.prepare('SELECT weight FROM users WHERE id=?').get(userId);
  if (u?.weight) {
    const dl = db.prepare(`SELECT MAX(value) m FROM prs p JOIN pr_exercises e ON e.id=p.exercise_id
      WHERE p.user_id=? AND p.status='approved' AND e.code='deadlift'`).get(userId).m;
    if (dl && dl >= 2 * u.weight) grantBadge(userId, 'deadlift_2x');
  }
  // Récord del gimnasio: mejor marca aprobada de algún levantamiento
  const exs = db.prepare('SELECT id FROM pr_exercises WHERE active=1').all();
  for (const e of exs) {
    const top = db.prepare("SELECT user_id FROM prs WHERE exercise_id=? AND status='approved' ORDER BY value DESC, created_at ASC LIMIT 1").get(e.id);
    if (top && top.user_id === userId) grantBadge(userId, 'gym_record');
  }
}

// ---------- Categorías de peso ----------
function weightBands() {
  let b; try { b = JSON.parse(getSetting('weight.bands')); } catch { b = [65, 80, 95]; }
  return b.sort((a, c) => a - c);
}
function weightCategory(w) {
  if (!w) return null;
  const b = weightBands();
  for (let i = 0; i < b.length; i++) if (w < b[i]) return i === 0 ? `-${b[0]} kg` : `${b[i - 1]}-${b[i]} kg`;
  return `+${b[b.length - 1]} kg`;
}
function weightCategories() {
  const b = weightBands();
  return [`-${b[0]} kg`, ...b.slice(1).map((x, i) => `${b[i]}-${x} kg`), `+${b[b.length - 1]} kg`];
}

// ---------- Rankings ----------
function applyFilters(rows, { gender, wcat }) {
  return rows.filter((r) => (!gender || gender === 'all' || r.gender === gender) && (!wcat || wcat === 'all' || r.wcat === wcat));
}
function rankRows(rows) {
  rows.forEach((r, i) => (r.position = i + 1));
  return rows;
}
function userLite(u) {
  return { id: u.id, name: u.name, username: u.username, avatar: u.avatar, gender: u.gender, wcat: weightCategory(u.weight) };
}

function challengeRanking(challengeId, filters = {}) {
  const ch = db.prepare('SELECT * FROM challenges WHERE id=?').get(challengeId);
  if (!ch) return [];
  // mejor resultado aprobado; los pendientes se muestran aparte con su estado
  const rows = db.prepare(`
    SELECT u.*, MAX(CASE WHEN e.status='approved' THEN e.result END) best,
           MAX(CASE WHEN e.status='pending' THEN e.result END) pending_best
    FROM challenge_entries e JOIN users u ON u.id=e.user_id
    WHERE e.challenge_id=? AND u.status='active' GROUP BY u.id`).all(challengeId);
  let list = rows.filter((r) => r.best != null).map((r) => ({ ...userLite(r), result: r.best, pending: r.pending_best != null && r.pending_best > r.best ? r.pending_best : null }));
  list.sort((a, b) => b.result - a.result);
  return rankRows(applyFilters(list, filters));
}

function seasonRanking(filters = {}, seasonId = null) {
  const s = seasonId ? db.prepare('SELECT * FROM seasons WHERE id=?').get(seasonId) : currentSeason();
  if (!s) return { season: null, rows: [] };
  const rows = db.prepare(`SELECT u.*, SUM(p.points) pts FROM points_ledger p JOIN users u ON u.id=p.user_id
    WHERE p.season_id=? AND u.status='active' AND u.role<>'coach' GROUP BY u.id ORDER BY pts DESC`).all(s.id);
  const list = rows.map((r) => ({ ...userLite(r), result: r.pts, unit: 'pts' }));
  return { season: s, rows: rankRows(applyFilters(list, filters)) };
}

function streakRanking(filters = {}) {
  const users = db.prepare("SELECT * FROM users WHERE status='active' AND role<>'coach'").all();
  const list = users.map((u) => { const s = streakInfo(u.id); return { ...userLite(u), result: s.current, best: s.best, unit: 'sem' }; })
    .filter((r) => r.result > 0).sort((a, b) => b.result - a.result || b.best - a.best);
  return rankRows(applyFilters(list, filters));
}

function strengthRanking(lift, filters = {}) {
  const exs = db.prepare("SELECT id,code FROM pr_exercises WHERE code IN ('squat','bench','deadlift')").all();
  const idOf = Object.fromEntries(exs.map((e) => [e.code, e.id]));
  const users = db.prepare("SELECT * FROM users WHERE status='active' AND role<>'coach'").all();
  const best = (uid, code) => db.prepare("SELECT MAX(value) m FROM prs WHERE user_id=? AND exercise_id=? AND status='approved'").get(uid, idOf[code])?.m || 0;
  const list = users.map((u) => {
    const squat = best(u.id, 'squat'), bench = best(u.id, 'bench'), deadlift = best(u.id, 'deadlift');
    const total = squat + bench + deadlift;
    const result = lift === 'total' ? total : lift === 'squat' ? squat : lift === 'bench' ? bench : deadlift;
    return { ...userLite(u), result, unit: 'kg', squat, bench, deadlift, total };
  }).filter((r) => r.result > 0).sort((a, b) => b.result - a.result);
  return rankRows(applyFilters(list, filters));
}

function prsRanking(filters = {}) {
  const rows = db.prepare(`SELECT u.*, COUNT(p.id) n, MAX(p.created_at) last FROM prs p JOIN users u ON u.id=p.user_id
    WHERE p.status='approved' AND u.status='active' AND u.role<>'coach' GROUP BY u.id ORDER BY n DESC, last DESC`).all();
  const list = rows.map((r) => ({ ...userLite(r), result: r.n, unit: 'PRs' }));
  return rankRows(applyFilters(list, filters));
}

function userRankInSeason(userId) {
  const s = seasonRanking({});
  const me = s.rows.find((r) => r.id === userId);
  return me ? { position: me.position, points: me.result } : { position: null, points: 0 };
}

module.exports = {
  TZ, todayStr, addDays, weekStart, nowSql, notify, notifyAll, currentSeason, pointsConfig, award,
  streakInfo, grantBadge, checkBadges, weightCategory, weightCategories, weightBands,
  challengeRanking, seasonRanking, streakRanking, strengthRanking, prsRanking, userRankInSeason, userLite,
};
