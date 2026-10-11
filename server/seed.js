// Datos de demostración de RADICAL.  Uso:  npm run seed   (BORRA la base de datos actual)
const fs = require('fs');
const path = require('path');
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const UPLOADS = process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads');
for (const f of ['radical.db', 'radical.db-wal', 'radical.db-shm']) fs.rmSync(path.join(DATA_DIR, f), { force: true });
fs.rmSync(path.join(UPLOADS, 'seed'), { recursive: true, force: true });
fs.mkdirSync(path.join(UPLOADS, 'seed'), { recursive: true });

const bcrypt = require('bcryptjs');
const { db, putSetting } = require('./db');
const L = require('./lib');
const G = require('./game');
const C = require('./common');

const PASSWORD = 'radical123';
const hash = bcrypt.hashSync(PASSWORD, 10);
const sql = (d) => d.toISOString().replace('T', ' ').slice(0, 19);
const ago = (h) => sql(new Date(Date.now() - h * 3600e3));
const today = L.todayStr(); const wk = L.weekStart(today);

// ---------------------------------------------------------------- imágenes SVG
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function art(file, { w = 1080, h = 1080, title = '', sub = '', motif = 0, hue = 0 }) {
  const o = ['#ff5a1f', '#ff7a2e', '#ff4500', '#ff8a3d'][hue % 4];
  const gx = [30, 75, 55, 20][motif % 4], gy = [30, 70, 25, 80][motif % 4];
  const bar = `<g transform="translate(${w / 2},${h * 0.42})">
    <rect x="-${w * 0.38}" y="-8" width="${w * 0.76}" height="16" rx="8" fill="#3a3a40"/>
    ${[0.31, 0.26, 0.21].map((x, i) => `<rect x="-${w * x - 0}" y="-${150 - i * 24}" width="${30 - i * 3}" height="${300 - i * 48}" rx="8" fill="${i === 0 ? o : '#2a2a2f'}"/><rect x="${w * x - 30 + i * 3}" y="-${150 - i * 24}" width="${30 - i * 3}" height="${300 - i * 48}" rx="8" fill="${i === 0 ? o : '#2a2a2f'}"/>`).join('')}
  </g>`;
  const bolt = `<path transform="translate(${w / 2 - 110},${h * 0.42 - 190}) scale(1.6)" d="M95 0 L10 125 H65 L45 235 L130 100 H75 Z" fill="${o}"/>`;
  const rings = `<g transform="translate(${w / 2},${h * 0.42})" fill="none" stroke="${o}" stroke-width="14">
    <circle r="190" opacity=".9"/><circle r="130" stroke="#2f2f35"/><circle r="70" stroke="${o}" opacity=".5"/></g>`;
  const flame = `<path transform="translate(${w / 2 - 130},${h * 0.42 - 200}) scale(1.1)" d="M130 0 C150 70 250 100 230 210 C215 300 45 310 30 210 C20 150 70 130 80 80 C100 110 120 90 130 0Z" fill="${o}"/><path transform="translate(${w / 2 - 70},${h * 0.42 - 60}) scale(.6)" d="M130 0 C150 70 250 100 230 210 C215 300 45 310 30 210 C20 150 70 130 80 80 C100 110 120 90 130 0Z" fill="#fff" opacity=".9"/>`;
  const glyph = [bar, bolt, rings, flame][motif % 4];
  const lines = title.split('\n').map((t, i) => `<text x="64" y="${h - 150 - (title.split('\n').length - 1 - i) * 92}" font-family="Helvetica,Arial,sans-serif" font-weight="900" font-size="84" fill="#fff" letter-spacing="-2">${esc(t)}</text>`).join('');
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs><radialGradient id="g" cx="${gx}%" cy="${gy}%" r="75%"><stop offset="0" stop-color="${o}" stop-opacity=".55"/><stop offset=".55" stop-color="#151518"/><stop offset="1" stop-color="#070708"/></radialGradient>
  <pattern id="p" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="3" height="28" fill="#fff" opacity=".035"/></pattern></defs>
  <rect width="${w}" height="${h}" fill="url(#g)"/><rect width="${w}" height="${h}" fill="url(#p)"/>
  ${glyph}${lines}
  <text x="64" y="${h - 70}" font-family="Helvetica,Arial,sans-serif" font-weight="700" font-size="34" fill="${o}" letter-spacing="6">${esc(sub.toUpperCase())}</text>
  <text x="${w - 64}" y="84" text-anchor="end" font-family="Helvetica,Arial,sans-serif" font-weight="900" font-size="38" fill="#fff" opacity=".85" letter-spacing="8">RADICAL</text></svg>`;
  fs.writeFileSync(path.join(UPLOADS, 'seed', file), svg);
  return '/uploads/seed/' + file;
}
function avatar(file, name, hue) {
  const ini = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  const cols = [['#ff5a1f', '#b02a00'], ['#ff8a3d', '#c2410c'], ['#fb923c', '#9a3412'], ['#ff6b35', '#7c2d12']][hue % 4];
  fs.writeFileSync(path.join(UPLOADS, 'seed', file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200"><defs><linearGradient id="a" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${cols[0]}"/><stop offset="1" stop-color="${cols[1]}"/></linearGradient></defs><rect width="200" height="200" fill="url(#a)"/><text x="100" y="128" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="84" fill="#fff">${ini}</text></svg>`);
  return '/uploads/seed/' + file;
}

// ---------------------------------------------------------------- temporadas
const seasonStart = L.addDays(wk, -21), seasonEnd = L.addDays(wk, 49);
db.prepare("INSERT INTO seasons(name,start_at,end_at,status,results) VALUES('Pretemporada Verano',?,?,'closed',?)")
  .run(L.addDays(wk, -105), L.addDays(wk, -28), '[]');
const curSeason = db.prepare("INSERT INTO seasons(name,start_at,end_at,status) VALUES('Temporada 1 · Fuego',?,?,'active')").run(seasonStart, seasonEnd).lastInsertRowid;

// ---------------------------------------------------------------- usuarios
const U = {};
const users = [
  ['andersson', 'Andersson Toapanta', 'andersson@radical.test', 'owner', 'M', 27, 82, 'Ganar fuerza y masa muscular', 'Powerlifting', 4, 'Fuego', 'Dueño de RADICAL. Si no duele, no es radical. 🔥'],
  ['maria', 'María Villacís', 'maria@radical.test', 'admin', 'F', 26, 61, 'Competir en CrossFit', 'CrossFit', 4, 'Hierro', 'Administradora · WOD lover · café y barra 🏋️‍♀️'],
  ['diego', 'Diego Rojas', 'diego@radical.test', 'user', 'M', 29, 88, 'Total de 600 kg', 'Powerlifting', 4, 'Hierro', 'Peso muerto es vida. Siempre apuntando al siguiente PR.'],
  ['carlos', 'Carlos Rivera', 'carlos@radical.test', 'user', 'M', 31, 94, 'Banca de 150 kg', 'Fuerza', 3, 'Hierro', 'Papá, ingeniero y aprendiz de la barra.'],
  ['laura', 'Laura Gómez', 'laura@radical.test', 'user', 'F', 28, 58, 'Definición y fuerza', 'Funcional', 3, 'Fuego', 'Funcional + pesas. Constancia sobre motivación 💪'],
  ['mateo', 'Mateo López', 'mateo@radical.test', 'user', 'M', 24, 75, 'Muscle-up con lastre', 'Calistenia', 3, 'Fuego', 'Calistenia y fierros. Dominadas todos los días.'],
  ['gabriel', 'Coach Gabriel', 'gabriel@radical.test', 'coach', 'M', 35, 85, 'Formar atletas', 'Powerlifting / Hipertrofia', 5, '', 'Entrenador RADICAL · Técnica primero, kilos después.'],
  ['sofia', 'Sofía Paredes', 'sofia@radical.test', 'user', 'F', 25, 56, 'Ponerme en forma', 'Funcional', 3, '', 'Recién llegando a RADICAL 👋'],
];
users.forEach(([un, name, email, role, g, age, w, goal, disc, wg, team, bio], i) => {
  const av = avatar(`av_${un}.svg`, name, i);
  const status = un === 'sofia' ? 'pending' : 'active';
  U[un] = db.prepare(`INSERT INTO users(email,username,name,password_hash,role,status,bio,gender,age,weight,goal,discipline,avatar,weekly_goal,team,created_at)
    VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(email, un, name, hash, role, status, bio, g, age, w, goal, disc, av, wg, team, ago(24 * (60 - i * 5))).lastInsertRowid;
});
if (U.sofia) db.prepare("UPDATE users SET created_at=? WHERE id=?").run(ago(5), U.sofia);
['maria', 'diego', 'carlos', 'laura', 'mateo'].forEach((u) => db.prepare('UPDATE users SET coach_id=? WHERE id=?').run(U.gabriel, U[u]));
db.prepare('UPDATE users SET coach_id=? WHERE id=?').run(U.gabriel, U.andersson);

const follow = db.prepare('INSERT OR IGNORE INTO follows(follower_id,followee_id,created_at) VALUES(?,?,?)');
const names = ['andersson', 'maria', 'diego', 'carlos', 'laura', 'mateo', 'gabriel'];
names.forEach((a, i) => names.forEach((b, j) => { if (a !== b && ((i * 3 + j * 5) % 4 !== 0 || a === 'andersson' || b === 'gabriel')) follow.run(U[a], U[b], ago(24 * (30 - j))); }));

// ---------------------------------------------------------------- entrenamientos y rachas
const GYM_DAYS = [0, 1, 3, 4, 5, 2, 6]; // preferencia de días
const plan = { // semanas completas hacia atrás (racha) y días de esta semana
  andersson: { weeks: 9, now: [0, 1, 2] }, maria: { weeks: 6, now: [0, 2] }, diego: { weeks: 14, now: [0, 1, 2] }, carlos: { weeks: 3, now: [1] },
  laura: { weeks: 4, now: [0, 1, 2] }, mateo: { weeks: 11, now: [0, 1, 2] }, gabriel: { weeks: 26, now: [0, 1, 2] },
};
const chk = db.prepare('INSERT OR IGNORE INTO checkins(user_id,date) VALUES(?,?)');
const wo = db.prepare('INSERT INTO workouts(user_id,date,title,notes) VALUES(?,?,?,?)');
const ws = db.prepare('INSERT INTO workout_sets(workout_id,exercise,sets,reps,weight) VALUES(?,?,?,?,?)');
const ROUTINES = [['Pierna', [['Sentadilla', 5, 5, 0.9], ['Prensa de pierna', 4, 12, 1.4], ['Curl femoral', 3, 12, 0.35]]],
  ['Empuje', [['Press banca', 5, 5, 0.75], ['Press militar', 4, 8, 0.45], ['Fondos', 3, 10, 0]]],
  ['Tracción', [['Peso muerto', 4, 4, 1.2], ['Remo con barra', 4, 8, 0.7], ['Dominadas', 4, 8, 0]]]];
for (const [un, p] of Object.entries(plan)) {
  const uid = U[un]; const goal = db.prepare('SELECT weekly_goal,weight FROM users WHERE id=?').get(uid);
  for (let w = 1; w <= p.weeks + 1 && w <= 14; w++) {
    const ws0 = L.addDays(wk, -7 * w);
    const n = w <= p.weeks ? goal.weekly_goal : Math.max(1, goal.weekly_goal - 2); // la semana que rompe la racha
    GYM_DAYS.slice(0, n).forEach((d) => {
      const date = L.addDays(ws0, d); chk.run(uid, date);
      if (w <= 6 && d % 2 === 0) { const [t, ex] = ROUTINES[(d + w) % 3]; const id = wo.run(uid, date, t, '').lastInsertRowid; ex.forEach(([e, s, r, f]) => ws.run(id, e, s, r, Math.round(goal.weight * f / 2.5) * 2.5)); }
    });
  }
  p.now.forEach((d) => { const date = L.addDays(wk, d); if (date <= today) chk.run(uid, date); });
  // workout de hoy/ayer
  const t = L.addDays(today, -1); if (t >= wk && un !== 'carlos') { const id = wo.run(uid, t, 'Pierna', 'Buen día de pierna').lastInsertRowid; ws.run(id, 'Sentadilla', 5, 5, Math.round(goal.weight * 0.9 / 2.5) * 2.5); }
}
// puntos por asistencia / entrenos dentro de la temporada actual
db.prepare('SELECT user_id,date FROM checkins WHERE date>=?').all(seasonStart).forEach((c) => L.award(c.user_id, 'attendance', c.date));
db.prepare('SELECT id,user_id FROM workouts WHERE date>=?').all(seasonStart).forEach((w) => L.award(w.user_id, 'workout', w.id));

// ---------------------------------------------------------------- PRs
const ex = Object.fromEntries(db.prepare('SELECT id,code FROM pr_exercises').all().map((e) => [e.code, e.id]));
const PRS = { andersson: [160, 110, 200, 70], maria: [105, 55, 130, 40], diego: [190, 135, 230, 75], carlos: [180, 140, 220, 80], laura: [90, 50, 115, 35], mateo: [130, 95, 160, 60], gabriel: [200, 145, 240, 85] };
const insPr = db.prepare("INSERT INTO prs(user_id,exercise_id,value,reps,note,status,created_at) VALUES(?,?,?,?,?,'approved',?)");
for (const [un, v] of Object.entries(PRS)) {
  ['squat', 'bench', 'deadlift', 'ohp'].forEach((code, i) => {
    const old = insPr.run(U[un], ex[code], Math.round(v[i] * 0.93 / 2.5) * 2.5, 1, '', ago(24 * (40 + i * 3)));
    L.award(U[un], 'pr_validated', old.lastInsertRowid);
    const cur = insPr.run(U[un], ex[code], v[i], 1, '', ago(24 * (3 + i * 5 + names.indexOf(un))));
    if (code !== 'ohp') L.award(U[un], 'pr_validated', cur.lastInsertRowid);
  });
}
db.prepare("INSERT INTO prs(user_id,exercise_id,value,reps,note,status,created_at) VALUES(?,?,?,?,?,'pending',?)").run(U.mateo, ex.bench, 100, 1, 'Nuevo récord, con video 🎥', ago(3));
db.prepare("INSERT INTO prs(user_id,exercise_id,value,reps,note,status,created_at) VALUES(?,?,?,?,?,'pending',?)").run(U.laura, ex.squat, 95, 1, 'Sentadilla profunda', ago(6));

// ---------------------------------------------------------------- progreso corporal
const bp = db.prepare('INSERT INTO body_progress(user_id,date,weight,note) VALUES(?,?,?,?)');
for (let i = 8; i >= 0; i--) {
  bp.run(U.andersson, L.addDays(today, -i * 7), 82 + (i - 4) * 0.3, i === 0 ? 'Subiendo kilos limpios' : '');
  bp.run(U.laura, L.addDays(today, -i * 7), 58 + (i - 4) * 0.25, '');
}

// ---------------------------------------------------------------- insignias (reglas automáticas)
Object.values(U).forEach((id) => L.checkBadges(id));

// ---------------------------------------------------------------- retos
const monday = new Date(wk + 'T00:00:00-05:00'); // inicio de semana hora Ecuador
const at = (days, mins = 0) => sql(new Date(monday.getTime() + days * 864e5 + mins * 60e3));
const mkCh = db.prepare(`INSERT INTO challenges(title,description,exercise,weight,type,start_at,end_at,attempts,classification,prize,points,image,rules,featured)
  VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)`);
const chPress = mkCh.run('Reto Press de Pierna 120 kg',
  'La prensa no perdona. 120 kg fijos y todas las repeticiones limpias que puedas. ¿Cuántas aguantas?', 'Press de pierna', 120, 'max_reps',
  at(0), at(7, -1), 2, 'gender', 'Mes de membresía gratis + camiseta RADICAL', 50,
  art('reto_prensa.svg', { title: 'PRESS DE PIERNA\n120 KG', sub: 'Máximas repeticiones · 2 intentos', motif: 0 }),
  '• Peso fijo de 120 kg (sin contar el carro).\n• Rango completo: rodillas a 90° como mínimo y extensión sin bloquear.\n• Grabar video continuo de la serie con cámara de lado.\n• Máximo 2 intentos; cuenta el mejor resultado validado.\n• Sin rebotes ni ayuda de manos en las rodillas.', 1).lastInsertRowid;
const chPlank = mkCh.run('Plancha de Hierro', 'Aguanta la plancha todo lo que puedas. Core de acero.', 'Plancha', null, 'max_plank', at(-7), at(0, -1), 1, 'gender',
  'Camiseta RADICAL', 50, art('reto_plancha.svg', { title: 'PLANCHA\nDE HIERRO', sub: 'Mayor tiempo en segundos', motif: 2, hue: 1 }), '• Plancha de antebrazos, cuerpo recto.\n• Video continuo obligatorio.', 0).lastInsertRowid;
const chPull = mkCh.run('Semana de Dominadas', 'Máximo de dominadas estrictas en una sola serie.', 'Dominadas', null, 'max_pullups', at(7), at(14, -1), 2, 'gender',
  'Bolso deportivo RADICAL', 50, art('reto_dominadas.svg', { title: 'SEMANA DE\nDOMINADAS', sub: 'Próximo reto', motif: 1, hue: 2 }), '• Barbilla sobre la barra, brazos extendidos abajo.\n• Sin kipping.', 0).lastInsertRowid;

const joinCh = db.prepare('INSERT OR IGNORE INTO challenge_joins(challenge_id,user_id,created_at) VALUES(?,?,?)');
const entry = db.prepare('INSERT INTO challenge_entries(challenge_id,user_id,result,note,status,review_note,reviewed_by,created_at) VALUES(?,?,?,?,?,?,?,?)');
const approved = (c, un, v, h) => { joinCh.run(c, U[un], ago(h + 1)); L.award(U[un], 'challenge_join', c); entry.run(c, U[un], v, '', 'approved', '', U.andersson, ago(h)); L.award(U[un], 'challenge_complete', c, 50); };
[['mateo', 28, 20], ['laura', 26, 18], ['diego', 24, 30], ['carlos', 22, 26], ['maria', 21, 12], ['andersson', 20, 9]].forEach(([u, v, h]) => approved(chPress, u, v, h));
joinCh.run(chPress, U.gabriel, ago(5));
entry.run(chPress, U.andersson, 23, 'Segundo intento, mejor técnica', 'pending', '', null, ago(2));
entry.run(chPress, U.maria, 24, 'Segundo intento 💥', 'pending', '', null, ago(1));
// Reto pasado (plancha) → se finaliza y reparte premios
[['carlos', 168, 'M'], ['diego', 195, 'M'], ['mateo', 240, 'M'], ['laura', 215, 'F'], ['maria', 190, 'F'], ['andersson', 150, 'M']].forEach(([u, v], i) => {
  joinCh.run(chPlank, U[u], ago(24 * 8)); L.award(U[u], 'challenge_join', chPlank);
  entry.run(chPlank, U[u], v, '', 'approved', '', U.andersson, ago(24 * (4 + i % 3))); L.award(U[u], 'challenge_complete', chPlank, 50);
});
db.prepare('UPDATE challenges SET end_at=? WHERE id=?').run(ago(24), chPlank);
G.finalizeChallenge(chPlank);
db.prepare('UPDATE challenges SET end_at=? WHERE id=?').run(at(0, -1), chPlank);

// ---------------------------------------------------------------- temporada anterior (histórico)
const prevSeason = db.prepare("SELECT id FROM seasons WHERE status='closed'").get().id;
db.prepare('UPDATE seasons SET results=? WHERE id=?').run(JSON.stringify([
  { id: U.diego, name: 'Diego Rojas', username: 'diego', avatar: '', gender: 'M', points: 1840, position: 1 },
  { id: U.laura, name: 'Laura Gómez', username: 'laura', avatar: '', gender: 'F', points: 1710, position: 2 },
  { id: U.mateo, name: 'Mateo López', username: 'mateo', avatar: '', gender: 'M', points: 1655, position: 3 },
  { id: U.maria, name: 'María Villacís', username: 'maria', avatar: '', gender: 'F', points: 1500, position: 4 },
  { id: U.andersson, name: 'Andersson Toapanta', username: 'andersson', avatar: '', gender: 'M', points: 1390, position: 5 },
]), prevSeason);
const aw = db.prepare('INSERT INTO season_awards(season_id,award,user_id,team) VALUES(?,?,?,?)');
[['champion_m', 'diego'], ['champion_f', 'laura'], ['consistent', 'gabriel'], ['progress', 'mateo'], ['lifter', 'diego'], ['rookie', 'carlos']].forEach(([a, u]) => aw.run(prevSeason, a, U[u], ''));
aw.run(prevSeason, 'team', null, 'Hierro');

// ---------------------------------------------------------------- publicaciones
const post = db.prepare('INSERT INTO posts(user_id,kind,text,media,media_type,location,meta,created_at) VALUES(?,?,?,?,?,?,?,?)');
const mk = (un, text, h, img, loc = '', kind = 'post', meta = '{}') => post.run(un ? U[un] : null, kind, text, img || '', img ? 'image' : '', loc, meta, ago(h)).lastInsertRowid;
const P = [];
P.push(mk('andersson', 'Día de pierna con el equipo 🔥 120 kg en la prensa y las piernas todavía temblando. ¿Quién me gana esta semana? #RetoRADICAL', 2, art('p1.svg', { title: 'DÍA DE\nPIERNA', sub: 'Andersson · RADICAL', motif: 0 }), 'RADICAL Gym'));
P.push(mk('maria', 'WOD de la mañana ✅ 5 rondas: 15 thrusters + 12 pull-ups + 400 m. Café después, obvio ☕', 5, art('p2.svg', { title: 'WOD\nDE LA MAÑANA', sub: 'María Villacís', motif: 3, hue: 1 })));
P.push(mk('gabriel', 'Tip de técnica 🎯 En la sentadilla, empuja el piso con todo el pie y mantén el pecho arriba. La profundidad se gana con movilidad, no con prisa.', 9, art('p3.svg', { title: 'TIP DEL COACH\nSENTADILLA', sub: 'Coach Gabriel', motif: 2, hue: 2 })));
P.push(mk('diego', 'Nuevo PR en peso muerto: 230 kg 🏆 Meses de trabajo para este momento. Gracias al coach y a todo el equipo.', 27, art('p4.svg', { title: 'PESO MUERTO\n230 KG', sub: 'Nuevo PR · Diego Rojas', motif: 1, hue: 3 }), '', 'pr', JSON.stringify({ exercise: 'Peso muerto', value: 230, unit: 'kg', reps: 1 })));
P.push(mk('laura', 'Cuatro semanas seguidas entrenando sin faltar 🔥 La constancia le gana al talento.', 30, null, '', 'streak', JSON.stringify({ weeks: 4 })));
P.push(mk('mateo', 'Primera serie de 8 dominadas con 20 kg de lastre 💪 Vamos por el muscle-up.', 33, art('p6.svg', { title: 'DOMINADAS\n+20 KG', sub: 'Mateo López', motif: 1 })));
P.push(mk('carlos', 'Banca pesada de hoy: 140 kg x1. El objetivo sigue siendo los 150. Paso a paso.', 50, art('p7.svg', { title: 'BANCA\n140 KG', sub: 'Carlos Rivera', motif: 0, hue: 2 })));
P.push(mk('laura', 'Progreso de 8 semanas 📈 Menos grasa, más fuerza. Gracias RADICAL por esta comunidad.', 56, art('p8.svg', { title: 'PROGRESO\n8 SEMANAS', sub: 'Laura Gómez', motif: 2 }), '', 'progress', JSON.stringify({ weight: 58 })));
P.push(mk('andersson', 'Resultados finales del reto Plancha de Hierro 🏆 ¡Mateo se llevó el oro con 4:00! Gracias a todos por participar.', 24 * 3, art('p9.svg', { title: 'RESULTADOS\nPLANCHA', sub: 'Reto semanal', motif: 3, hue: 1 }), 'RADICAL Gym'));
P.push(mk('maria', 'Mobility Monday 🧘‍♀️ 15 minutos que te salvan la espalda. Hazlo antes de entrenar.', 24 * 4, art('p10.svg', { title: 'MOBILITY\nMONDAY', sub: 'María Villacís', motif: 2, hue: 3 })));
db.prepare("UPDATE posts SET meta=? WHERE id=?").run(JSON.stringify({ challenge_id: chPlank }), P[8]);
// publicaciones del gimnasio (autor RADICAL)
mk(null, `🏆 Nuevo reto: Reto Press de Pierna 120 kg\nLa prensa no perdona. 120 kg fijos y todas las repeticiones limpias que puedas.`, 24 * 2, art('p11.svg', { title: 'NUEVO RETO\nPRESS 120 KG', sub: 'Esta semana', motif: 0 }), '', 'challenge', JSON.stringify({ challenge_id: chPress }));

const like = db.prepare('INSERT OR IGNORE INTO likes(post_id,user_id,created_at) VALUES(?,?,?)');
const comment = db.prepare('INSERT INTO comments(post_id,user_id,text,created_at) VALUES(?,?,?,?)');
P.forEach((pid, i) => names.forEach((n, j) => { if ((i + j) % 3 !== 0) like.run(pid, U[n], ago(1 + i + j)); }));
comment.run(P[0], U.maria, '¡Bestia! Esta semana te alcanzo 😤', ago(1.5));
comment.run(P[0], U.diego, '120 en la prensa no es broma, crack 🔥', ago(1.2));
comment.run(P[0], U.gabriel, 'Buena profundidad. Mantén la espalda pegada.', ago(1));
comment.run(P[3], U.andersson, '¡¡230!! Máquina total 🏆', ago(26));
comment.run(P[3], U.carlos, 'Brutal Diego, ahora a por los 240.', ago(25));
comment.run(P[5], U.gabriel, 'Excelente control. Sigue así.', ago(32));
comment.run(P[4], U.mateo, '¡Vamos Laura! 🔥', ago(29));
db.prepare('INSERT OR IGNORE INTO saves(post_id,user_id) VALUES(?,?)').run(P[2], U.andersson);
db.prepare('INSERT OR IGNORE INTO saves(post_id,user_id) VALUES(?,?)').run(P[9], U.andersson);
db.prepare('INSERT OR IGNORE INTO post_tags VALUES(?,?)').run(P[0], U.maria);
db.prepare('INSERT OR IGNORE INTO post_tags VALUES(?,?)').run(P[0], U.diego);
db.prepare("INSERT INTO reports(reporter_id,target_type,target_id,reason) VALUES(?,?,?,?)").run(U.carlos, 'comment', 1, 'Lenguaje fuera de lugar (ejemplo de reporte)');

// ---------------------------------------------------------------- historias
const st = db.prepare('INSERT INTO stories(user_id,kind,media,media_type,caption,highlight,created_at) VALUES(?,?,?,?,?,?,?)');
st.run(U.andersson, 'normal', art('s1.svg', { w: 1080, h: 1920, title: 'LEG DAY\nNO SE NEGOCIA', sub: 'Andersson', motif: 0 }), 'image', 'Pierna al amanecer 🌅', '', ago(3));
st.run(U.maria, 'normal', art('s2.svg', { w: 1080, h: 1920, title: 'WOD\nCOMPLETADO', sub: 'María', motif: 3, hue: 1 }), 'image', '5 rondas ✅', '', ago(6));
st.run(U.maria, 'normal', art('s2b.svg', { w: 1080, h: 1920, title: 'MOBILITY\nTIME', sub: 'María', motif: 2, hue: 2 }), 'image', 'Estiramientos post WOD', '', ago(5));
st.run(U.diego, 'pr', art('s3.svg', { w: 1080, h: 1920, title: 'PR\n230 KG', sub: 'Peso muerto · Diego', motif: 1, hue: 3 }), 'image', '¡Nuevo PR en peso muerto! 🏆', '', ago(12));
st.run(U.laura, 'normal', art('s4.svg', { w: 1080, h: 1920, title: 'FUNCIONAL\nDEL DÍA', sub: 'Laura', motif: 2 }), 'image', 'Circuito de 30 min', '', ago(8));
st.run(U.mateo, 'normal', art('s5.svg', { w: 1080, h: 1920, title: 'DOMINADAS\nCON LASTRE', sub: 'Mateo', motif: 1, hue: 1 }), 'image', 'Vamos por más 💪', '', ago(14));
st.run(null, 'event', art('s6.svg', { w: 1080, h: 1920, title: 'SÁBADO DE\nCOMPETENCIA', sub: 'Evento del gimnasio', motif: 3, hue: 2 }), 'image', 'Inscripciones abiertas en recepción', '', ago(4));
st.run(null, 'challenge', JSON.stringify({ title: 'Reto Press de Pierna 120 kg', body: 'Máximas repeticiones · 2 intentos · hombres y mujeres', kind: 'challenge' }), 'card', 'Reto de la semana', '', ago(10));
st.run(U.andersson, 'normal', art('s7.svg', { w: 1080, h: 1920, title: 'EQUIPO\nRADICAL', sub: 'Destacada', motif: 0, hue: 3 }), 'image', 'El mejor equipo 🔥', 'Retos', ago(24 * 5));
st.run(U.andersson, 'pr', art('s8.svg', { w: 1080, h: 1920, title: 'PR\n200 KG', sub: 'Peso muerto', motif: 1 }), 'image', 'Primer 200 kg 🏆', 'Retos', ago(24 * 9));
st.run(U.maria, 'normal', art('s9.svg', { w: 1080, h: 1920, title: 'MIS\nENTRENOS', sub: 'Destacada', motif: 3 }), 'image', 'Rutinas favoritas', 'Entrenos', ago(24 * 6));
db.prepare('INSERT OR IGNORE INTO story_views(story_id,user_id) VALUES(1,?)').run(U.maria);
[U.maria, U.diego, U.laura, U.gabriel].forEach((u) => db.prepare('INSERT OR IGNORE INTO story_views(story_id,user_id) VALUES(1,?)').run(u));
db.prepare('INSERT OR IGNORE INTO story_views(story_id,user_id) VALUES(2,?)').run(U.andersson);

// ---------------------------------------------------------------- anuncios
const ann = db.prepare('INSERT INTO announcements(kind,title,body,image,event_at,in_story,pinned,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
ann.run('promo', '2x1 en plan trimestral', 'Trae a tu compañero de entrenamiento y paguen uno. Válido hasta fin de mes. Pregunta en recepción.',
  art('a1.svg', { w: 1080, h: 720, title: '2x1 PLAN\nTRIMESTRAL', sub: 'Promoción', motif: 3, hue: 2 }), '', 0, 1, U.andersson, ago(24 * 2));
ann.run('competition', 'Sábado de Competencia · Powerlifting Meet', 'Sentadilla, banca y peso muerto. Jueces certificados, premios y buen ambiente. Cupos limitados.',
  art('a2.svg', { w: 1080, h: 720, title: 'POWERLIFTING\nMEET', sub: 'Competencia interna', motif: 0 }), sql(new Date(Date.now() + 10 * 864e5)), 1, 0, U.andersson, ago(30));
ann.run('closure', 'Feriado: cerrado el 9 de octubre', 'Por el feriado de la Independencia de Guayaquil el gimnasio permanecerá cerrado. Abrimos el sábado con horario normal.', '', '', 0, 0, U.andersson, ago(24 * 5));

// ---------------------------------------------------------------- mensajes
const msg = db.prepare('INSERT INTO messages(from_id,to_id,text,kind,ref_id,read,created_at) VALUES(?,?,?,?,?,?,?)');
msg.run(U.maria, U.andersson, '¡Jefe! ¿Vas a competir en el Meet del sábado?', 'text', null, 1, ago(26));
msg.run(U.andersson, U.maria, 'Claro, ya me inscribí. Tú también debes 😏', 'text', null, 1, ago(25.5));
msg.run(U.maria, U.andersson, 'Mira la publicación del reto de esta semana', 'text', null, 1, ago(5));
msg.run(U.maria, U.andersson, '', 'challenge', chPress, 1, ago(4.9));
msg.run(U.maria, U.andersson, 'Te voy a ganar en la prensa 😤', 'text', null, 0, ago(4.8));
msg.run(U.diego, U.andersson, 'Buen entrenamiento hoy. Te comparto el perfil de Mateo, está fuerte.', 'text', null, 0, ago(2.5));
msg.run(U.diego, U.andersson, '', 'profile', U.mateo, 0, ago(2.4));
msg.run(U.gabriel, U.andersson, 'Revisé tu técnica de peso muerto, muy bien. Mañana ajustamos la rutina.', 'text', null, 1, ago(20));
msg.run(U.andersson, U.gabriel, 'Gracias coach. Ahí estaré.', 'text', null, 1, ago(19));
msg.run(U.laura, U.andersson, 'Respondió a tu historia: 🔥🔥', 'story_reply', 1, 1, ago(2));

// ---------------------------------------------------------------- notificaciones
const nt = db.prepare('INSERT INTO notifications(user_id,actor_id,type,text,link,read,created_at) VALUES(?,?,?,?,?,?,?)');
const A = U.andersson;
nt.run(A, U.maria, 'like', 'A María Villacís le gustó tu publicación', `#/post/${P[0]}`, 0, ago(1.6));
nt.run(A, U.diego, 'comment', 'Diego Rojas comentó: “120 en la prensa no es broma, crack 🔥”', `#/post/${P[0]}`, 0, ago(1.2));
nt.run(A, U.gabriel, 'follow', 'Coach Gabriel empezó a seguirte', `#/u/${U.gabriel}`, 0, ago(7));
nt.run(A, U.maria, 'message', '💬 María Villacís: Te voy a ganar en la prensa 😤', `#/mensajes/${U.maria}`, 0, ago(4.8));
nt.run(A, null, 'challenge', '🏆 Nuevo reto: Reto Press de Pierna 120 kg', `#/reto/${chPress}`, 1, ago(24 * 2));
nt.run(A, null, 'result_approved', '✅ Resultado aprobado en “Reto Press de Pierna 120 kg”: 20 reps · vas #6', `#/reto/${chPress}`, 1, ago(8));
nt.run(A, null, 'pr', '🏆 PR validado: Peso muerto 200 kg (+30 pts)', `#/u/${A}`, 1, ago(24 * 9));
nt.run(A, null, 'streak', '🔥 ¡Semana completada! 4 de 4 entrenamientos · racha de 9', `#/u/${A}`, 1, ago(24 * 4));
nt.run(A, null, 'ranking', 'Subiste al puesto #3 del ranking de temporada', '#/ranking', 1, ago(24 * 3));
nt.run(A, null, 'announcement', '📣 2x1 en plan trimestral', '#/', 1, ago(24 * 2));
nt.run(A, U.sofia, 'pending', '🕓 Sofía Paredes (@sofia) solicita unirse a RADICAL', '#/admin/usuarios', 0, ago(5));
nt.run(A, U.mateo, 'pr_pending', '🏋️ Mateo López registró Press banca 100 kg (por validar)', '#/admin/prs', 0, ago(3));
nt.run(A, U.maria, 'entry_pending', '⏱ María Villacís registró 24 reps en “Reto Press de Pierna 120 kg” (por validar)', '#/admin/resultados', 0, ago(1));

// ---------------------------------------------------------------- tienda demo
const MARK = ['M1231.36,250.41l-64.23,128.42c-4.88,9.79-14.87,15.97-25.82,15.97h-111.6c-2.72,0-5.22,1.48-6.54,3.85h0c-1.43,2.58-1.21,5.75.56,8.1l120.99,161.32h-129.95c-9.09,0-17.65-4.28-23.1-11.55l-121.29-161.72h126.14c11.15,0,21.31-6.41,26.08-16.49l13.72-28.88c2.74-5.75-1.44-12.39-7.83-12.39h-231.75l35.35-70.67c4.88-9.79,14.87-15.97,25.82-15.97h373.46Z', 'M754.87,452.58l-57.76,115.51h126.55c10.94-.01,20.94-6.19,25.83-15.97l49.78-99.55h-144.39Z'];
function garment(file, type, color, label) {
  const dark = ['#17171a', '#1f3a6e', '#5b5b64'].includes(color); const markC = color === '#f45100' ? '#ffffff' : '#f45100';
  const shapes = {
    tee: `<path d="M170 110 L62 168 L104 262 L162 234 L162 520 L438 520 L438 234 L496 262 L538 168 L430 110 Q300 190 170 110 Z"/>`,
    hoodie: `<path d="M150 130 L50 190 L80 440 L150 440 L150 520 L450 520 L450 440 L520 440 L550 190 L450 130 Q300 210 150 130 Z"/><path d="M200 126 Q300 40 400 126 Q300 200 200 126 Z" opacity=".75"/>`,
    short: `<path d="M140 160 L460 160 L520 470 L330 470 L300 320 L270 470 L80 470 Z"/>`,
    cap: `<path d="M120 360 Q120 160 300 160 Q480 160 480 360 Z"/><path d="M110 360 L560 360 Q580 395 540 400 L180 400 Q110 395 110 360 Z" opacity=".8"/>`,
  }[type];
  const cx = type === 'cap' ? 300 : type === 'short' ? 380 : 300, cy = type === 'cap' ? 270 : type === 'short' ? 230 : 270; const s = type === 'cap' ? .17 : type === 'short' ? .1 : .27;
  const mark = `<g transform="translate(${cx},${cy}) scale(${s}) translate(-964,-409)" fill="${markC}"><path d="${MARK[0]}"/><path d="${MARK[1]}"/></g>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 700" width="900" height="1050"><defs><radialGradient id="g" cx="50%" cy="38%" r="75%"><stop offset="0" stop-color="#2a2a30"/><stop offset="1" stop-color="#0c0c0e"/></radialGradient></defs><rect width="600" height="700" fill="url(#g)"/><g fill="${color}" stroke="${dark ? '#3a3a42' : '#00000033'}" stroke-width="3" stroke-linejoin="round">${shapes}</g>${mark}<text x="300" y="640" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="30" letter-spacing="8" fill="#ffffff" opacity=".85">${label.toUpperCase()}</text></svg>`;
  fs.writeFileSync(path.join(UPLOADS, 'seed', file), svg);
  return '/uploads/seed/' + file;
}
const COLORS = { Negro: '#17171a', Blanco: '#ececef', Naranja: '#f45100', Gris: '#5b5b64', Azul: '#1f3a6e' };
const addProduct = db.prepare('INSERT INTO products(name,description,price,category,sizes,mode,images,created_at,stock,low_stock) VALUES(?,?,?,?,?,?,?,?,?,5)');
const mkProd = (name, desc, price, cat, sizes, mode, type, models, h, stock = null) => addProduct.run(name, desc, price, cat, sizes, mode,
  JSON.stringify(models.map((m) => ({ url: garment(`p-${type}-${m.toLowerCase()}.svg`, type, COLORS[m], m), label: m }))), ago(h), stock).lastInsertRowid;
const pTee = mkProd('Camiseta Oversize RADICAL', 'Algodón premium 240 g, corte oversize. Logo bordado en el pecho.', 18, 'Camisetas', 'S,M,L,XL', 'pedido', 'tee', ['Negro', 'Blanco', 'Naranja'], 70, 24);
mkProd('Hoodie RADICAL CLUB', 'Hoodie pesado con capucha y bolsillo canguro. Se fabrica por tandas: reserva el tuyo.', 38, 'Hoodies', 'S,M,L,XL,XXL', 'reserva', 'hoodie', ['Negro', 'Gris'], 52, 4);
mkProd('Short Training', 'Short ligero con tela de secado rápido, ideal para sentadilla y cardio.', 22, 'Shorts', 'S,M,L,XL', 'pedido', 'short', ['Negro', 'Azul'], 30, 12);
mkProd('Gorra RADICAL', 'Gorra ajustable con logo bordado.', 14, 'Accesorios', 'Única', 'pedido', 'cap', ['Negro', 'Naranja'], 20, 3);
const ordIns = db.prepare('INSERT INTO orders(user_id,product_id,product_name,model_label,model_image,size,qty,price,note,phone,kind,status,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)');
const teeImgs = JSON.parse(db.prepare('SELECT images FROM products WHERE id=?').get(pTee).images);
const proof = (file, amount) => { fs.writeFileSync(path.join(UPLOADS, 'seed', file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 560"><rect width="400" height="560" fill="#f4f4f6"/><rect x="0" y="0" width="400" height="90" fill="#1b1464"/><text x="200" y="56" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="26" fill="#fff">Comprobante</text><text x="200" y="170" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="20" fill="#333">Transferencia exitosa</text><text x="200" y="250" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-weight="800" font-size="52" fill="#16a34a">$${amount}.00</text><text x="200" y="320" text-anchor="middle" font-family="Helvetica,Arial,sans-serif" font-size="16" fill="#666">Ejemplo de la demo</text></svg>`); return '/uploads/seed/' + file; };
const o1 = ordIns.run(U.diego, pTee, 'Camiseta Oversize RADICAL', 'Negro', teeImgs[0].url, 'M', 1, 18, '', '0991234567', 'pedido', 'listo', ago(30)).lastInsertRowid;
db.prepare("UPDATE orders SET pay_status='confirmado', pay_proof=?, status_note='Retíralo en recepción' WHERE id=?").run(proof('proof-1.svg', 18), o1);
msg.run(U.diego, U.andersson, 'Pedido: Camiseta Oversize RADICAL · Negro · Talla M · x1', 'order', o1, 1, ago(30));
const o2 = ordIns.run(U.mateo, pTee, 'Camiseta Oversize RADICAL', 'Naranja', teeImgs[2].url, 'L', 2, 18, 'Para retirar el viernes', '', 'pedido', 'nuevo', ago(2)).lastInsertRowid;
msg.run(U.mateo, U.andersson, 'Pedido: Camiseta Oversize RADICAL · Naranja · Talla L · x2', 'order', o2, 0, ago(2));
db.prepare("UPDATE orders SET pay_status='revision', pay_proof=? WHERE id=?").run(proof('proof-2.svg', 36), o2);
db.prepare("INSERT INTO notifications(user_id,actor_id,type,text,link,read,created_at) VALUES(?,?,?,?,?,0,?)").run(U.andersson, U.mateo, 'order', '🛍️ Mateo López hizo un pedido: Camiseta Oversize RADICAL (talla L)', '#/admin/tienda', ago(2));
putSetting('store.whatsapp', '5930000000000');
putSetting('store.payment_info', 'Transferencia a Banco Ejemplo · Cuenta de ahorros 0000000000 · a nombre de RADICAL CLUB · Envía la foto del comprobante aquí en la app.'); // número de ejemplo: cámbialo en Administración → Tienda

// ---------------------------------------------------------------- rutinas sugeridas demo
const rIns = db.prepare('INSERT INTO routines(title,description,goal,level,days_per_week,duration_min,equipment,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?)');
const dIns = db.prepare('INSERT INTO routine_days(routine_id,pos,name,focus) VALUES(?,?,?,?)');
const eIns = db.prepare('INSERT INTO routine_exercises(day_id,pos,name,sets,reps,rest,notes) VALUES(?,?,?,?,?,?,?)');
function mkRoutine(title, desc, goal, level, dpw, dur, equip, days, h) {
  const rid = rIns.run(title, desc, goal, level, dpw, dur, equip, U.gabriel, ago(h)).lastInsertRowid;
  days.forEach(([name, focus, exs], i) => { const did = dIns.run(rid, i, name, focus).lastInsertRowid; exs.forEach((e, j) => eIns.run(did, j, ...e)); });
  return rid;
}
const rFull = mkRoutine('Full Body para empezar', 'Tres sesiones de cuerpo completo para crear la base: técnica, constancia y fuerza general. Descansa un día entre sesiones.', 'general', 'principiante', 3, 50, 'Barra, mancuernas y máquinas', [
  ['Día 1 · Cuerpo completo A', 'Sentadilla y empuje', [['Sentadilla goblet', 3, '10', '90 s', 'Baja controlado, espalda recta'], ['Press banca con mancuernas', 3, '10', '90 s', ''], ['Remo en máquina', 3, '12', '60 s', ''], ['Plancha', 3, '30 s', '45 s', 'Abdomen firme'], ['Bicicleta', 1, '10 min', '', 'Ritmo suave para terminar']]],
  ['Día 2 · Cuerpo completo B', 'Bisagra de cadera y tirón', [['Peso muerto rumano', 3, '10', '90 s', 'Barra cerca de las piernas'], ['Press militar con mancuernas', 3, '10', '90 s', ''], ['Jalón al pecho', 3, '12', '60 s', ''], ['Zancadas', 3, '10 por pierna', '60 s', ''], ['Elevaciones de talones', 2, '15', '45 s', '']]],
  ['Día 3 · Cuerpo completo C', 'Piernas y espalda', [['Prensa de pierna', 3, '12', '90 s', ''], ['Remo con mancuerna', 3, '10 por lado', '60 s', ''], ['Flexiones (o en rodillas)', 3, '8-12', '60 s', ''], ['Hip thrust', 3, '12', '75 s', 'Pausa arriba 1 s'], ['Curl de bíceps', 2, '12', '45 s', '']]],
], 40);
mkRoutine('Push · Pull · Legs', 'Divide el cuerpo en empuje, tirón y piernas. Hazlo dos veces por semana (6 días) o una vez (3 días) según tu tiempo.', 'hipertrofia', 'intermedio', 6, 70, 'Gimnasio completo', [
  ['Push · Pecho, hombro y tríceps', 'Empuje', [['Press banca', 4, '6-8', '120 s', 'Sube el peso cuando completes todas las reps'], ['Press inclinado con mancuernas', 3, '8-10', '90 s', ''], ['Press militar', 3, '8-10', '90 s', ''], ['Elevaciones laterales', 3, '12-15', '45 s', ''], ['Fondos o extensión de tríceps', 3, '10-12', '60 s', '']]],
  ['Pull · Espalda y bíceps', 'Tirón', [['Dominadas', 4, 'al fallo', '120 s', 'Usa banda si hace falta'], ['Remo con barra', 4, '8-10', '90 s', ''], ['Jalón al pecho', 3, '10-12', '75 s', ''], ['Face pull', 3, '15', '45 s', ''], ['Curl con barra', 3, '10-12', '60 s', '']]],
  ['Legs · Piernas y glúteos', 'Piernas', [['Sentadilla', 4, '6-8', '150 s', ''], ['Peso muerto rumano', 3, '8-10', '120 s', ''], ['Prensa de pierna', 3, '10-12', '90 s', ''], ['Curl femoral', 3, '12', '60 s', ''], ['Elevaciones de talones', 4, '15', '45 s', '']]],
], 30);
mkRoutine('Fuerza 4 días · Upper / Lower', 'Mejora tus básicos (sentadilla, banca, peso muerto) con trabajo pesado y accesorios. Descansa bien entre series.', 'fuerza', 'intermedio', 4, 75, 'Barra, rack y discos', [
  ['Día 1 · Tren inferior pesado', 'Sentadilla', [['Sentadilla', 5, '5', '180 s', 'Deja 1-2 repeticiones en reserva'], ['Peso muerto rumano', 3, '8', '120 s', ''], ['Zancadas caminando', 3, '10 por pierna', '90 s', ''], ['Plancha con lastre', 3, '30 s', '60 s', '']]],
  ['Día 2 · Tren superior pesado', 'Press banca', [['Press banca', 5, '5', '180 s', ''], ['Remo con barra', 4, '6-8', '120 s', ''], ['Press militar', 3, '6-8', '120 s', ''], ['Dominadas lastradas', 3, '5-6', '120 s', '']]],
  ['Día 3 · Peso muerto y volumen', 'Peso muerto', [['Peso muerto', 4, '3-5', '180 s', 'Técnica primero'], ['Sentadilla frontal', 3, '6-8', '120 s', ''], ['Hip thrust', 3, '8-10', '90 s', ''], ['Abdominales en polea', 3, '12', '60 s', '']]],
  ['Día 4 · Tren superior volumen', 'Press y espalda', [['Press inclinado', 4, '8', '90 s', ''], ['Remo en polea', 4, '10', '90 s', ''], ['Fondos', 3, '8-10', '90 s', ''], ['Curl + tríceps en superserie', 3, '12', '60 s', '']]],
], 18);
mkRoutine('Quema grasa · Circuito', 'Circuitos de cuerpo completo con poco descanso para subir el gasto de energía. Haz cada bloque en orden y repite las rondas.', 'grasa', 'principiante', 4, 40, 'Mancuernas, cuerda y banco', [
  ['Circuito A · Piernas y core', 'Metabólico', [['Sentadilla con salto', 4, '12', '30 s', '4 rondas, sin parar entre ejercicios'], ['Zancadas alternas', 4, '12 por pierna', '30 s', ''], ['Mountain climbers', 4, '30 s', '30 s', ''], ['Cuerda para saltar', 4, '1 min', '60 s', '']]],
  ['Circuito B · Tren superior', 'Metabólico', [['Flexiones', 4, '10-15', '30 s', ''], ['Remo con mancuerna', 4, '12 por lado', '30 s', ''], ['Press de hombro', 4, '12', '30 s', ''], ['Burpees', 4, '10', '60 s', '']]],
  ['Circuito C · Cuerpo completo', 'Metabólico', [['Kettlebell swing', 4, '15', '30 s', ''], ['Thruster con mancuernas', 4, '10', '30 s', ''], ['Plancha', 4, '40 s', '30 s', ''], ['Remo en máquina de cardio', 1, '8 min', '', 'Ritmo constante']]],
], 10);
db.prepare('INSERT INTO user_routine(user_id,routine_id,next_day) VALUES(?,?,1)').run(U.diego, rFull);

putSetting('demo', '1');
putSetting('gym.invite_code', '');
console.log('✔ Base de datos demo creada. Contraseña de todos: ' + PASSWORD);
console.log('  Cuentas: ' + users.map((u) => u[2]).join(', '));
