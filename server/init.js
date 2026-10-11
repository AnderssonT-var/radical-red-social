// Inicialización para PRODUCCIÓN: crea la cuenta del dueño y la primera temporada en una base vacía.
//  · Automático: si defines OWNER_EMAIL y OWNER_PASSWORD (variables de entorno), se hace solo al arrancar la app.
//  · Manual (SSH):  OWNER_EMAIL=tu@correo.com OWNER_PASSWORD='ClaveSegura123' OWNER_NAME='Tu Nombre' npm run init
const bcrypt = require('bcryptjs');
const { db, putSetting } = require('./db');
const L = require('./lib');

function ensureSeason() {
  if (!db.prepare('SELECT 1 FROM seasons').get()) {
    const start = L.weekStart(L.todayStr());
    db.prepare("INSERT INTO seasons(name,start_at,end_at,status) VALUES('Temporada 1',?,?,'active')").run(start, L.addDays(start, 70));
  }
}
function bootstrap() {
  const email = (process.env.OWNER_EMAIL || '').toLowerCase().trim(); const pw = process.env.OWNER_PASSWORD || '';
  if (db.prepare('SELECT 1 FROM users').get()) return 'exists';
  if (!email || pw.length < 8) return 'none';
  const name = process.env.OWNER_NAME || 'Dueño RADICAL';
  const username = (process.env.OWNER_USERNAME || email.split('@')[0]).toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'owner';
  db.prepare("INSERT INTO users(email,username,name,password_hash,role,status) VALUES(?,?,?,?, 'owner','active')").run(email, username, name, bcrypt.hashSync(pw, 10));
  ensureSeason(); putSetting('demo', '0');
  console.log(`[RADICAL] ✔ Cuenta de dueño creada: ${email} (@${username})`);
  return 'created';
}
module.exports = { bootstrap, ensureSeason };
if (require.main === module) {
  const r = bootstrap();
  if (r === 'none') { console.error('Define OWNER_EMAIL y OWNER_PASSWORD (mínimo 8 caracteres).'); process.exit(1); }
  if (r === 'exists') console.log('La base ya tiene usuarios; no se hace nada.');
  process.exit(0);
}
