const fs = require('fs');
const path = require('path');
// Modo demostración: con RADICAL_DEMO=1 y sin base de datos, la primera vez se cargan usuarios, publicaciones, retos y rankings de ejemplo.
const DATA = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
if (process.env.RADICAL_DEMO === '1' && !fs.existsSync(path.join(DATA, 'radical.db'))) {
  console.log('[RADICAL] Cargando datos de demostración…');
  require('child_process').execFileSync(process.execPath, [path.join(__dirname, 'seed.js')], { stdio: 'inherit', env: process.env });
}
if (process.env.NODE_ENV === 'production' && !process.env.DATA_DIR) console.warn('[RADICAL] ⚠ DATA_DIR no está definido: la base de datos y las fotos se guardan dentro de la app y podrían borrarse al volver a desplegar. Define DATA_DIR y UPLOADS_DIR en una carpeta fuera de la app.');
const express = require('express');
const cookieParser = require('cookie-parser');
const C = require('./common');
const social = require('./social');
const train = require('./train');
const game = require('./game');
const admin = require('./admin');
const compression = require('compression');
require('./init').bootstrap();

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(compression());
app.use((req, res, next) => {
  res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin', 'X-Frame-Options': 'SAMEORIGIN', 'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
    'Content-Security-Policy': "default-src 'self'; img-src 'self' data: blob:; media-src 'self' blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'; manifest-src 'self'; worker-src 'self'; frame-ancestors 'self'; base-uri 'self'; form-action 'self'" });
  next();
});
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

// Archivos subidos (fotos/videos). Cache larga: los nombres son únicos.
app.use('/uploads', express.static(C.UPLOADS, { maxAge: '30d', immutable: true, fallthrough: true, setHeaders: (res) => res.set('Content-Disposition', 'inline') }));

// API: social.js incluye rutas públicas (login/registro) y luego exige sesión + cuenta aprobada
const api = express.Router();
api.use(social);
api.use(train);
api.use(game.router);
api.use(require('./store'));
api.use(require('./routines'));
api.use('/admin', admin);
api.use((req, res) => res.status(404).json({ error: 'Ruta no encontrada' }));
app.use('/api', api);

// Frontend estático (PWA)
app.use(express.static(path.join(__dirname, '..', 'public'), {
  setHeaders: (res, p) => {
    if (/(sw\.js|manifest\.webmanifest|index\.html)$/.test(p)) res.set('Cache-Control', 'no-cache');
  },
}));
app.use((req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

// Errores (p.ej. archivo demasiado grande)
app.use((err, req, res, next) => {
  console.error('[error]', err.message);
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'El archivo es demasiado grande (máx. 120 MB)' : 'Ocurrió un error en el servidor';
  res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 500).json({ error: msg });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`RADICAL escuchando en http://localhost:${PORT}`));
game.periodic(); setInterval(game.periodic, 10 * 60 * 1000);
