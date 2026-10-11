const path = require('path');
const fs = require('fs');

// SQLite: usa better-sqlite3 si está disponible; si el hosting no puede compilarlo, usa el SQLite integrado de Node (>=22.5).
function openDb(file) {
  if (process.env.RADICAL_SQLITE !== 'node') {
    try { const D = require('better-sqlite3'); const d = new D(file); d.pragma('journal_mode = WAL'); d.pragma('foreign_keys = ON'); d.pragma('busy_timeout = 5000'); return d; } catch (e) { if (process.env.RADICAL_SQLITE === 'better') throw e; }
  }
  const { DatabaseSync } = require('node:sqlite');
  const d = new DatabaseSync(file);
  d.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  const prepare = d.prepare.bind(d);
  // node:sqlite exige que cada parámetro con nombre exista en la consulta; better-sqlite3 ignora los sobrantes. Se replica ese comportamiento.
  const fit = (sql, a) => a.map((x) => (x && typeof x === 'object' && x.constructor === Object ? Object.fromEntries(Object.entries(x).filter(([k]) => new RegExp('[@:$]' + k + '\\b').test(sql))) : x));
  d.prepare = (sql) => { const st = prepare(sql); return { run: (...a) => st.run(...fit(sql, a)), get: (...a) => st.get(...fit(sql, a)), all: (...a) => st.all(...fit(sql, a)) }; };
  d.transaction = (fn) => (...args) => { d.exec('BEGIN'); try { const r = fn(...args); d.exec('COMMIT'); return r; } catch (e) { d.exec('ROLLBACK'); throw e; } };
  d.pragma = (q) => d.exec('PRAGMA ' + q);
  return d;
}

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = openDb(process.env.DB_FILE || path.join(DATA_DIR, 'radical.db'));

db.exec(`
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- user | coach | admin | owner
  status TEXT NOT NULL DEFAULT 'pending',     -- pending | active | blocked
  bio TEXT DEFAULT '',
  gender TEXT DEFAULT '',                     -- M | F | ''
  age INTEGER,
  weight REAL,
  goal TEXT DEFAULT '',
  coach_id INTEGER,
  discipline TEXT DEFAULT '',
  avatar TEXT DEFAULT '',
  weekly_goal INTEGER NOT NULL DEFAULT 4,
  team TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reset_tokens(
  token TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at TEXT NOT NULL, used INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS follows(
  follower_id INTEGER NOT NULL, followee_id INTEGER NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY(follower_id, followee_id)
);
CREATE TABLE IF NOT EXISTS posts(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  kind TEXT NOT NULL DEFAULT 'post',   -- post | pr | streak | challenge | result | progress | workout | gym
  text TEXT DEFAULT '',
  media TEXT DEFAULT '',
  media_type TEXT DEFAULT '',          -- image | video | ''
  location TEXT DEFAULT '',
  visibility TEXT DEFAULT 'all',       -- all | followers
  meta TEXT DEFAULT '{}',
  deleted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS post_tags(post_id INTEGER, user_id INTEGER, PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS likes(post_id INTEGER, user_id INTEGER, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS saves(post_id INTEGER, user_id INTEGER, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY(post_id,user_id));
CREATE TABLE IF NOT EXISTS comments(
  id INTEGER PRIMARY KEY AUTOINCREMENT, post_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  text TEXT NOT NULL, deleted INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS stories(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER,
  kind TEXT DEFAULT 'normal',          -- normal | gym | challenge | pr | event
  media TEXT NOT NULL, media_type TEXT DEFAULT 'image', caption TEXT DEFAULT '',
  highlight TEXT DEFAULT '',           -- nombre de la colección destacada
  deleted INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS story_views(story_id INTEGER, user_id INTEGER, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY(story_id,user_id));
CREATE TABLE IF NOT EXISTS messages(
  id INTEGER PRIMARY KEY AUTOINCREMENT, from_id INTEGER NOT NULL, to_id INTEGER NOT NULL,
  text TEXT DEFAULT '', kind TEXT DEFAULT 'text',   -- text | post | challenge | profile | story_reply
  ref_id INTEGER, read INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, actor_id INTEGER,
  type TEXT NOT NULL, text TEXT NOT NULL, link TEXT DEFAULT '', read INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS pr_exercises(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL, unit TEXT DEFAULT 'kg', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS prs(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, exercise_id INTEGER NOT NULL,
  value REAL NOT NULL, reps INTEGER DEFAULT 1, video TEXT DEFAULT '', note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',       -- pending | approved | rejected
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workouts(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL,
  title TEXT DEFAULT '', notes TEXT DEFAULT '', created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS workout_sets(
  id INTEGER PRIMARY KEY AUTOINCREMENT, workout_id INTEGER NOT NULL,
  exercise TEXT NOT NULL, sets INTEGER DEFAULT 1, reps INTEGER DEFAULT 1, weight REAL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS checkins(
  user_id INTEGER NOT NULL, date TEXT NOT NULL, PRIMARY KEY(user_id,date)
);
CREATE TABLE IF NOT EXISTS body_progress(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, date TEXT NOT NULL,
  weight REAL, note TEXT DEFAULT '', photo TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS challenges(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL, description TEXT DEFAULT '', exercise TEXT DEFAULT '',
  weight REAL, type TEXT NOT NULL DEFAULT 'max_reps',
  -- max_reps | max_weight | max_pullups | max_plank | weekly_volume | most_workouts | team
  start_at TEXT NOT NULL, end_at TEXT NOT NULL, attempts INTEGER DEFAULT 1,
  classification TEXT DEFAULT 'gender',  -- general | gender | weight
  prize TEXT DEFAULT '', points INTEGER DEFAULT 50, image TEXT DEFAULT '', video TEXT DEFAULT '',
  rules TEXT DEFAULT '', featured INTEGER DEFAULT 0, finalized INTEGER DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS challenge_entries(
  id INTEGER PRIMARY KEY AUTOINCREMENT, challenge_id INTEGER NOT NULL, user_id INTEGER NOT NULL,
  result REAL NOT NULL, video TEXT DEFAULT '', note TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',  -- pending | approved | rejected
  review_note TEXT DEFAULT '', reviewed_by INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS challenge_joins(challenge_id INTEGER, user_id INTEGER, created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY(challenge_id,user_id));
CREATE TABLE IF NOT EXISTS seasons(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, start_at TEXT NOT NULL, end_at TEXT NOT NULL,
  status TEXT DEFAULT 'active',   -- active | closed
  results TEXT DEFAULT '', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS points_ledger(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, points INTEGER NOT NULL,
  reason TEXT NOT NULL, ref TEXT DEFAULT '', season_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, reason, ref)
);
CREATE TABLE IF NOT EXISTS badges(
  id INTEGER PRIMARY KEY AUTOINCREMENT, code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
  description TEXT DEFAULT '', icon TEXT DEFAULT '🏅', kind TEXT DEFAULT 'auto', active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS user_badges(
  user_id INTEGER, badge_id INTEGER, season_id INTEGER, note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now')), PRIMARY KEY(user_id,badge_id,season_id)
);
CREATE TABLE IF NOT EXISTS season_awards(
  id INTEGER PRIMARY KEY AUTOINCREMENT, season_id INTEGER NOT NULL, award TEXT NOT NULL, user_id INTEGER, team TEXT DEFAULT ''
);
CREATE TABLE IF NOT EXISTS announcements(
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT DEFAULT 'notice',
  -- promo | discount | event | notice | schedule | closure | competition
  title TEXT NOT NULL, body TEXT DEFAULT '', image TEXT DEFAULT '', event_at TEXT DEFAULT '',
  in_story INTEGER DEFAULT 0, pinned INTEGER DEFAULT 0, deleted INTEGER DEFAULT 0,
  created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS reports(
  id INTEGER PRIMARY KEY AUTOINCREMENT, reporter_id INTEGER NOT NULL, target_type TEXT NOT NULL,
  target_id INTEGER NOT NULL, reason TEXT DEFAULT '', status TEXT DEFAULT 'open',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at);
CREATE INDEX IF NOT EXISTS idx_msgs ON messages(from_id,to_id);
CREATE TABLE IF NOT EXISTS products(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, description TEXT DEFAULT '', price REAL, category TEXT DEFAULT '',
  sizes TEXT DEFAULT 'S,M,L,XL', mode TEXT DEFAULT 'pedido',   -- pedido | reserva
  images TEXT DEFAULT '[]',                                    -- [{url,label}]: cada foto es un modelo/color
  active INTEGER DEFAULT 1, deleted INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS orders(
  id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL, product_id INTEGER NOT NULL, product_name TEXT DEFAULT '',
  model_label TEXT DEFAULT '', model_image TEXT DEFAULT '', size TEXT DEFAULT '', qty INTEGER DEFAULT 1, price REAL,
  note TEXT DEFAULT '', phone TEXT DEFAULT '', kind TEXT DEFAULT 'pedido', status TEXT DEFAULT 'nuevo',  -- nuevo | confirmado | entregado | cancelado
  created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders ON orders(user_id,status);
CREATE TABLE IF NOT EXISTS routines(
  id INTEGER PRIMARY KEY AUTOINCREMENT, title TEXT NOT NULL, description TEXT DEFAULT '',
  goal TEXT DEFAULT 'general',        -- fuerza | hipertrofia | grasa | resistencia | general
  level TEXT DEFAULT 'principiante',  -- principiante | intermedio | avanzado
  days_per_week INTEGER DEFAULT 3, duration_min INTEGER DEFAULT 60, equipment TEXT DEFAULT '',
  active INTEGER DEFAULT 1, deleted INTEGER DEFAULT 0, created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS routine_days(id INTEGER PRIMARY KEY AUTOINCREMENT, routine_id INTEGER NOT NULL, pos INTEGER NOT NULL, name TEXT DEFAULT '', focus TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS routine_exercises(id INTEGER PRIMARY KEY AUTOINCREMENT, day_id INTEGER NOT NULL, pos INTEGER NOT NULL, name TEXT NOT NULL, sets INTEGER DEFAULT 3, reps TEXT DEFAULT '10', rest TEXT DEFAULT '', notes TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS user_routine(user_id INTEGER PRIMARY KEY, routine_id INTEGER NOT NULL, next_day INTEGER DEFAULT 0, started_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE INDEX IF NOT EXISTS idx_rday ON routine_days(routine_id,pos);
CREATE INDEX IF NOT EXISTS idx_rex ON routine_exercises(day_id,pos);
CREATE INDEX IF NOT EXISTS idx_notif ON notifications(user_id,read);
CREATE INDEX IF NOT EXISTS idx_entries ON challenge_entries(challenge_id,user_id);
`);

// ---------- Configuración por defecto (editable desde administración) ----------
const DEFAULT_SETTINGS = {
  'points.attendance': 10,
  'points.workout': 5,
  'points.pr_validated': 30,
  'points.challenge_join': 20,
  'points.challenge_complete': 50,
  'points.challenge_win': 100,
  'points.event': 50,
  'gym.name': 'RADICAL',
  'store.whatsapp': '',      // número con código de país, solo dígitos (ej. 593991234567)
  'store.recipient': '',     // id del usuario que recibe los pedidos dentro de la app (vacío = dueño)
  'store.currency': '$',
  'store.payment_info': '',  // instrucciones de pago que ve el miembro (banco, cuenta, titular…)
  'weight.bands': JSON.stringify([65, 80, 95]), // <65, 65-80, 80-95, 95+
};
for (const c of ["pay_status TEXT DEFAULT 'pendiente'", "pay_proof TEXT DEFAULT ''", "pay_note TEXT DEFAULT ''", "status_note TEXT DEFAULT ''"]) { try { db.exec('ALTER TABLE orders ADD COLUMN ' + c); } catch {} } // pago y estado detallado
try { db.exec('ALTER TABLE products ADD COLUMN stock INTEGER'); } catch {} // stock (NULL = sin control)
try { db.exec('ALTER TABLE products ADD COLUMN low_stock INTEGER DEFAULT 5'); } catch {} // umbral de stock bajo
try { db.exec("ALTER TABLE users ADD COLUMN phone TEXT DEFAULT ''"); } catch {} // migración: teléfono del miembro
const getSetting = db.prepare('SELECT value FROM settings WHERE key=?');
const putSetting = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
  if (!getSetting.get(k)) putSetting.run(k, String(v));
}
const DEFAULT_PR_EXERCISES = [
  ['squat', 'Sentadilla'], ['bench', 'Press banca'], ['deadlift', 'Peso muerto'],
  ['ohp', 'Press militar'], ['pullup', 'Dominadas (lastre)'],
];
const insEx = db.prepare('INSERT OR IGNORE INTO pr_exercises(code,name) VALUES(?,?)');
DEFAULT_PR_EXERCISES.forEach(([c, n]) => insEx.run(c, n));

const DEFAULT_BADGES = [
  ['first_pr', 'Primer PR', 'Validaste tu primer récord personal', '🥇'],
  ['workouts_10', '10 entrenamientos', 'Completaste 10 entrenamientos', '💪'],
  ['workouts_50', '50 entrenamientos', 'Completaste 50 entrenamientos', '🔥'],
  ['workouts_100', '100 entrenamientos', 'Completaste 100 entrenamientos', '💯'],
  ['streak_1', '1 semana de racha', 'Una semana completa de entrenamiento', '⚡'],
  ['streak_4', '4 semanas de racha', 'Cuatro semanas consecutivas', '🔥'],
  ['streak_8', '8 semanas de racha', 'Ocho semanas consecutivas', '🌋'],
  ['streak_12', '12 semanas de racha', 'Doce semanas consecutivas', '☄️'],
  ['streak_26', '26 semanas de racha', 'Medio año sin fallar', '👑'],
  ['challenge_winner', 'Ganador de reto', 'Ganaste un reto semanal', '🏆'],
  ['top3_monthly', 'Top 3 mensual', 'Entre los 3 mejores del mes', '🎖️'],
  ['deadlift_2x', '2x peso corporal en peso muerto', 'Levantaste el doble de tu peso corporal', '🦍'],
  ['gym_record', 'Récord del gimnasio', 'Tienes el mejor registro del gimnasio en un levantamiento', '⭐'],
];
const insBadge = db.prepare('INSERT OR IGNORE INTO badges(code,name,description,icon) VALUES(?,?,?,?)');
DEFAULT_BADGES.forEach((b) => insBadge.run(...b));

module.exports = { db, getSetting: (k) => getSetting.get(k)?.value, putSetting: (k, v) => putSetting.run(k, String(v)) };
