// Arranque de la app: sesión, pantallas de acceso, navegación (barra inferior / menú lateral) y PWA
import { $, $$, esc, api, state, ico, avatar, toast, actions, forms, route, go, render, setGuard, refreshCounters, formObj, isStaff, sheet, menuSheet, confirmBox, empty } from './core.js';
import './feed.js'; import './game.js'; import './profile.js'; import './compose.js'; import './inbox.js'; import './store.js'; import './rutinas.js'; import './admin.js';

const PUBLIC = ['/login', '/registro', '/olvide', '/pendiente'];
const isPublic = (h) => PUBLIC.includes(h) || /^\/reset\//.test(h);

// ------------------------------------------------------------- guard de rutas
setGuard((hash) => {
  if (!state.user) return isPublic(hash) && hash !== '/pendiente' ? null : '#/login';
  if (state.user.status === 'pending') return hash === '/pendiente' ? null : '#/pendiente';
  if (isPublic(hash) && !/^\/reset\//.test(hash)) return '#/';
  if (hash.startsWith('/admin') && !(isStaff() || (state.user.role === 'coach' && hash === '/admin/prs'))) return '#/';
  return null;
});

// ------------------------------------------------------------- navegación
const NAV = [
  ['/', 'home', 'Inicio', ['home', 'post', 'saved', 'search']],
  ['/ranking', 'rank', 'Ranking', ['ranking', 'seasons']],
  ['compose', 'plus', 'Publicar', []],
  ['/retos', 'bolt', 'Retos', ['challenges', 'challenge']],
  ['/perfil', 'user', 'Perfil', ['profile', 'edit']],
];
function buildNav() {
  const me = state.user; if (!me) return;
  $('#tabbar').innerHTML = NAV.map(([href, icon, label]) => href === 'compose'
    ? `<button class="tab-item tab-compose" data-act="compose" aria-label="Publicar"><span>${ico('plus', 26)}</span></button>`
    : `<a class="tab-item" href="#${href}" data-nav="${href}">${icon === 'user' ? `<span class="tab-av">${avatar(me, 26)}</span>` : ico(icon, 26)}<small>${label}</small></a>`).join('');
  const side = [['/', 'home', 'Inicio'], ['/noticias', 'megaphone', 'Noticias'], ['/rutinas', 'dumbbell', 'Rutinas'], ['/tienda', 'bag', 'Tienda'], ['/ranking', 'rank', 'Ranking'], ['/retos', 'bolt', 'Retos'], ['/mensajes', 'send', 'Mensajes', 'messages'], ['/notificaciones', 'bell', 'Notificaciones', 'notifications'], ['/buscar', 'search', 'Buscar']];
  $('#sidebar').innerHTML = `<a href="#/" class="logo lg" aria-label="RADICAL CLUB"><img class="lk-h" src="/img/logo-h.svg" alt="RADICAL CLUB"><img class="lk-m" src="/img/logo-mark.svg" alt=""></a>
    <nav>${side.map(([h, i, l, b]) => `<a class="side-item" href="#${h}" data-nav="${h}">${ico(i, 24)}<span>${l}</span>${b ? `<em class="dot" data-badge="${b}"></em>` : ''}</a>`).join('')}
      <button class="side-item" data-act="compose">${ico('plus', 24)}<span>Publicar</span></button>
      <a class="side-item" href="#/perfil" data-nav="/perfil"><span class="side-av">${avatar(me, 26)}</span><span>Perfil</span></a>
      ${isStaff() ? `<a class="side-item" href="#/admin" data-nav="/admin">${ico('shield', 24)}<span>Administración</span></a>` : me.role === 'coach' ? `<a class="side-item" href="#/admin/prs" data-nav="/admin/prs">${ico('shield', 24)}<span>Validar PRs</span></a>` : ''}
    </nav>
    <div class="side-foot"><button class="side-item" data-act="moreMenu">${ico('sliders', 24)}<span>Más</span></button></div>`;
  $$('[data-i]').forEach((el) => { if (!el.firstChild || !el.querySelector('svg')) el.insertAdjacentHTML('afterbegin', ico(el.dataset.i, 24)); });
  paintBadges(); markActive();
}
function paintBadges() {
  $$('[data-badge]').forEach((el) => { const n = state.counters[el.dataset.badge] || 0; el.textContent = n > 9 ? '9+' : n; el.classList.toggle('on', n > 0); });
  const n = state.counters.notifications || 0; document.title = n ? `(${n}) RADICAL` : 'RADICAL';
}
function markActive() {
  const hash = (location.hash.replace(/^#/, '') || '/'); const name = document.body.dataset.route;
  const mine = hash === '/perfil' || hash === '/u/' + state.user?.id;
  $$('[data-nav]').forEach((a) => {
    const h = a.dataset.nav; let on = false;
    if (h === '/') on = ['home', 'post', 'saved'].includes(name);
    else if (h === '/ranking') on = ['ranking', 'seasons'].includes(name);
    else if (h === '/retos') on = ['challenges', 'challenge'].includes(name);
    else if (h === '/perfil') on = mine;
    else if (h === '/admin') on = hash.startsWith('/admin');
    else on = hash === h || hash.startsWith(h + '/');
    a.classList.toggle('on', on);
  });
}
window.addEventListener('counters', paintBadges);
window.addEventListener('route', () => {
  markActive();
  const name = document.body.dataset.route;
  document.body.classList.toggle('auth-mode', ['login', 'register', 'forgot', 'reset', 'pending'].includes(name));
  fillRight();
  window.scrollTo(0, 0);
});
import { streakCard, rightColumn } from './feed.js';
async function fillRight() {
  const rc = $('#right-col'); if (!rc || !state.user || state.user.status !== 'active' || document.body.classList.contains('auth-mode')) { rc && (rc.innerHTML = ''); return; }
  if (!state.extras) { try { state.extras = await api('home/extras'); } catch { return; } }
  rc.innerHTML = `${streakCard(state.extras)}${rightColumn(state.extras)}`;
}
window.addEventListener('me', () => { buildNav(); });

actions.moreMenu = () => menuSheet([
  { label: 'Temporadas y campeones', icon: 'trophy', run: () => go('#/temporadas') },
  { label: 'Guardados', icon: 'bookmark', run: () => go('#/guardados') },
  { label: 'Instalar la app', icon: 'download', run: installHelp },
  { label: 'Cerrar sesión', icon: 'logout', danger: true, run: logout },
]);
export async function logout() { try { await api('auth/logout', { method: 'POST' }); } catch {} state.user = null; state.extras = null; location.hash = '#/login'; document.body.classList.add('auth-mode'); }
actions.logout = logout;

// ------------------------------------------------------------- instalación PWA
let deferred = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
export function installHelp() {
  if (deferred) { deferred.prompt(); deferred = null; return; }
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  sheet(ios ? `<ol class="steps"><li>Abre RADICAL en <b>Safari</b>.</li><li>Toca el botón <b>Compartir</b> ${ico('send', 16)} de la barra inferior.</li><li>Elige <b>“Añadir a pantalla de inicio”</b>.</li><li>Toca <b>Añadir</b>. ¡Listo! Se abrirá como una app.</li></ol>`
    : `<ol class="steps"><li>Abre el menú del navegador (⋮).</li><li>Elige <b>“Instalar app”</b> o <b>“Añadir a pantalla de inicio”</b>.</li><li>Confirma. RADICAL aparecerá como una app más en tu teléfono o computadora.</li></ol>`, { title: 'Instalar RADICAL' });
}

// ------------------------------------------------------------- pantallas de acceso
const authShell = (inner, extra = '') => `<div class="auth"><div class="auth-glow"></div><div class="auth-card">
  <div class="auth-logo"><img src="/img/logo-stack.svg" alt="RADICAL CLUB"></div><p class="auth-tag">${extra || 'La comunidad privada de tu gimnasio'}</p>${inner}</div>
  <p class="auth-foot">Si no duele, no es radical.</p></div>`;

route('/login', async (el) => {
  const demo = state.config.demo;
  el.innerHTML = authShell(`<form data-form="login" class="form" autocomplete="on">
    <label>Correo o usuario<input name="email" autocomplete="username" inputmode="email" autocapitalize="none" required></label>
    <label>Contraseña<input name="password" type="password" autocomplete="current-password" required></label>
    <button class="btn block lg" type="submit">Entrar</button>
    <a class="link center" href="#/olvide">¿Olvidaste tu contraseña?</a></form>
    <div class="auth-alt">¿Aún no tienes cuenta? <a href="#/registro" class="link">Solicita tu acceso</a></div>
    ${demo ? `<div class="demo-box"><small>MODO DEMO · contraseña <b>radical123</b></small><div class="chips">${[['andersson', 'Dueño'], ['maria', 'Admin'], ['gabriel', 'Coach'], ['diego', 'Miembro']].map(([u, r]) => `<button type="button" class="chip-btn" data-act="demoLogin" data-u="${u}">${r} · ${u}</button>`).join('')}</div></div>` : ''}`);
}, { name: 'login', skeleton: false });
actions.demoLogin = (el) => { const f = $('form[data-form=login]'); f.email.value = el.dataset.u + '@radical.test'; f.password.value = 'radical123'; f.requestSubmit(); };
forms.login = async (f) => { const r = await api('auth/login', { method: 'POST', body: formObj(f) }); await afterAuth(r.user); };

route('/registro', async (el) => {
  const inv = state.config.invite;
  el.innerHTML = authShell(`<form data-form="register" class="form">
    <label>Nombre completo<input name="name" autocomplete="name" required minlength="2" maxlength="60"></label>
    <div class="grid2"><label>Usuario<input name="username" autocapitalize="none" required pattern="[a-zA-Z0-9_.]{3,20}" placeholder="tu_usuario"></label>
    <label>Género<select name="gender"><option value="">Prefiero no decir</option><option value="M">Hombre</option><option value="F">Mujer</option></select></label></div>
    <label>Correo<input name="email" type="email" autocomplete="email" required></label>
    <label>Contraseña (mín. 8)<input name="password" type="password" autocomplete="new-password" minlength="8" required></label>
    ${inv ? '<label>Código de invitación del gimnasio<input name="invite" required></label>' : ''}
    ${state.config.firstRun ? '<p class="note">🔥 Eres la primera persona en registrarse: tu cuenta será la del <b>dueño</b> y tendrás acceso total al panel de administración.</p>' : '<p class="muted sm">Tu cuenta será revisada por la administración del gimnasio antes de darte acceso completo.</p>'}
    <button class="btn block lg" type="submit">${state.config.firstRun ? 'Crear cuenta de dueño' : 'Solicitar acceso'}</button></form>
    <div class="auth-alt">¿Ya tienes cuenta? <a href="#/login" class="link">Inicia sesión</a></div>`, 'Únete a la comunidad');
}, { name: 'register', skeleton: false });
forms.register = async (f) => { const r = await api('auth/register', { method: 'POST', body: formObj(f) }); await afterAuth(r.user); };

route('/olvide', async (el) => {
  el.innerHTML = authShell(`<form data-form="forgot" class="form"><label>Correo de tu cuenta<input name="email" type="email" required autocomplete="email"></label>
    <button class="btn block lg" type="submit">Recuperar contraseña</button><div id="forgot-out"></div></form>
    <div class="auth-alt"><a href="#/login" class="link">Volver a iniciar sesión</a></div>`, 'Recupera tu acceso');
}, { name: 'forgot', skeleton: false });
forms.forgot = async (f) => {
  const r = await api('auth/forgot', { method: 'POST', body: formObj(f) });
  $('#forgot-out').innerHTML = `<p class="note">${esc(r.message)}</p>${r.link ? `<a class="btn ghost block" href="${esc(r.link)}">Abrir enlace de recuperación (demo)</a>` : ''}`;
};
route('/reset/([a-f0-9]+)', async (el, token) => {
  el.innerHTML = authShell(`<form data-form="reset" data-token="${esc(token)}" class="form"><label>Nueva contraseña (mín. 8)<input name="password" type="password" minlength="8" autocomplete="new-password" required></label>
    <button class="btn block lg" type="submit">Guardar contraseña</button></form>`, 'Crea una nueva contraseña');
}, { name: 'reset', skeleton: false });
forms.reset = async (f) => {
  await api('auth/reset', { method: 'POST', body: { token: f.dataset.token, password: f.password.value } });
  toast('Contraseña actualizada', 'ok'); const me = await api('auth/me'); await afterAuth(me.user);
};

route('/pendiente', async (el) => {
  el.innerHTML = authShell(`<div class="pending">${ico('clock', 44)}<h2>Cuenta en revisión</h2><p>Hola <b>${esc(state.user?.name.split(' ')[0] || '')}</b>, tu solicitud ya llegó a la administración de RADICAL. Te avisaremos apenas sea aprobada.</p>
    <button class="btn block" data-act="recheck">Ya me aprobaron · actualizar</button><button class="btn ghost block" data-act="logout">Cerrar sesión</button></div>`, 'Casi listo');
}, { name: 'pending', skeleton: false });
actions.recheck = async () => { const r = await api('auth/me'); state.user = r.user; if (r.user.status === 'active') { toast('¡Bienvenido a RADICAL!', 'ok'); await afterAuth(r.user); } else toast('Todavía está pendiente'); };

async function afterAuth(user) {
  state.user = user; state.extras = null;
  if (user.status === 'active') { const me = await api('auth/me'); state.user = me.user; state.counters = me.counters; }
  buildNav(); location.hash = user.status === 'pending' ? '#/pendiente' : '#/'; render();
}

// ------------------------------------------------------------- arranque
async function boot() {
  try { state.config = await api('config'); } catch { state.config = {}; }
  try { const me = await api('auth/me'); state.user = me.user; state.counters = me.counters; } catch { state.user = null; }
  buildNav();
  if (!location.hash || location.hash === '#') location.hash = state.user ? (state.user.status === 'pending' ? '#/pendiente' : '#/') : '#/login';
  await render();
  const sp = $('#splash'); sp?.classList.add('out'); setTimeout(() => sp?.remove(), 450);
  setInterval(() => { if (state.user?.status === 'active' && !document.hidden) refreshCounters(); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden && state.user?.status === 'active') refreshCounters(); });
}
window.addEventListener('online', () => $('#offline').classList.remove('show'));
window.addEventListener('offline', () => $('#offline').classList.add('show'));
if ('serviceWorker' in navigator) window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
boot();
