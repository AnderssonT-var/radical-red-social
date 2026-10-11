// Núcleo compartido: API, estado, utilidades, iconos, hojas modales, router y acciones
export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const state = { user: null, counters: { notifications: 0, messages: 0 }, config: {}, extras: null };
export const isStaff = (u = state.user) => u && (u.role === 'admin' || u.role === 'owner');

// ---------------- API ----------------
export async function api(path, { method = 'GET', body, form } = {}) {
  const opt = { method, credentials: 'same-origin', headers: {} };
  if (form) opt.body = form;
  else if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  let res;
  try { res = await fetch('/api/' + path, opt); } catch { throw new Error('Sin conexión. Revisa tu internet.'); }
  let data = {}; try { data = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error(data.error || 'Ocurrió un error'); err.status = res.status; err.data = data;
    if (res.status === 401 && state.user) { state.user = null; location.hash = '#/login'; }
    throw err;
  }
  return data;
}
export const postForm = (path, fd, method = 'POST') => api(path, { method, form: fd });

// ---------------- Fechas ----------------
export const parse = (s) => new Date(String(s).includes('T') ? s : String(s).replace(' ', 'T') + 'Z');
export function ago(s) {
  const d = (Date.now() - parse(s)) / 1000;
  if (d < 60) return 'ahora';
  if (d < 3600) return `${Math.floor(d / 60)} min`;
  if (d < 86400) return `${Math.floor(d / 3600)} h`;
  if (d < 604800) return `${Math.floor(d / 86400)} d`;
  return parse(s).toLocaleDateString('es', { day: 'numeric', month: 'short' });
}
export const hhmm = (s) => parse(s).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
export const dateLong = (s) => parse(s).toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'long' });
export const dateShort = (s) => parse(s).toLocaleDateString('es', { day: 'numeric', month: 'short' });
export function dayLabel(s) {
  const d = parse(s), n = new Date(); const y = new Date(n - 864e5);
  if (d.toDateString() === n.toDateString()) return 'Hoy';
  if (d.toDateString() === y.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es', { weekday: 'long', day: 'numeric', month: 'short' });
}
export function countdown(end) {
  const ms = parse(end) - Date.now(); if (ms <= 0) return 'Finalizado';
  const d = Math.floor(ms / 864e5), h = Math.floor(ms % 864e5 / 36e5), m = Math.floor(ms % 36e5 / 6e4);
  return d > 0 ? `${d}d ${h}h` : h > 0 ? `${h}h ${m}m` : `${m} min`;
}
export const toLocalInput = (s) => { const d = parse(s); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

// ---------------- Formato ----------------
export const num = (n) => Number(n ?? 0).toLocaleString('es');
export function fmtResult(v, unit) {
  if (unit === 's') { const m = Math.floor(v / 60), s = Math.round(v % 60); return m ? `${m}:${String(s).padStart(2, '0')}` : `${s} s`; }
  return `${Number.isInteger(+v) ? num(v) : (+v).toFixed(1)} ${unit || ''}`.trim();
}
export const ORDER_ST = { nuevo: 'Nuevo', confirmado: 'Confirmado', preparando: 'En preparación', listo: '¡Listo para recoger!', entregado: 'Entregado', cancelado: 'Cancelado' };
export const ROLE = { owner: 'Dueño', admin: 'Admin', coach: 'Coach', user: '' };
export const TYPE_NAME = { max_reps: 'Máx. repeticiones', max_weight: 'Mayor peso', max_pullups: 'Máx. dominadas', max_plank: 'Plancha (tiempo)', weekly_volume: 'Volumen semanal', most_workouts: 'Más entrenamientos', team: 'Por equipos' };
export const ANN = { promo: ['Promoción', 'megaphone'], discount: ['Descuento', 'tag'], event: ['Evento', 'calendar'], notice: ['Aviso', 'bell'], schedule: ['Horario especial', 'clock'], closure: ['Cierre', 'lock'], competition: ['Competencia', 'trophy'] };
export const AWARD = { champion_m: 'Campeón masculino', champion_f: 'Campeona femenina', consistent: 'Más constante', progress: 'Mejor progreso', lifter: 'Mejor levantador', rookie: 'Revelación', team: 'Equipo campeón' };

// ---------------- Iconos ----------------
const P = {
  home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
  rank: '<rect x="2" y="12" width="6" height="9" rx="1.5"/><rect x="9" y="4" width="6" height="17" rx="1.5"/><rect x="16" y="9" width="6" height="12" rx="1.5"/>',
  plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
  bolt: '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
  user: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  users: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
  comment: '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
  send: '<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>',
  bookmark: '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>',
  bag: '<path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/><path d="M16 10a4 4 0 0 1-8 0"/>',
  bell: '<path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>',
  more: '<circle cx="12" cy="12" r="1.2"/><circle cx="19" cy="12" r="1.2"/><circle cx="5" cy="12" r="1.2"/>',
  x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
  check: '<polyline points="20 6 9 17 4 12"/>',
  back: '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>',
  chevR: '<polyline points="9 18 15 12 9 6"/>', chevL: '<polyline points="15 18 9 12 15 6"/>',
  camera: '<path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
  video: '<polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/>',
  trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>',
  shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>',
  calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>',
  pin: '<path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/>',
  at: '<circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/>',
  search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
  flame: '<path d="M12 2c1 4 6 6 6 12a6 6 0 0 1-12 0c0-3 2-4 3-7 1 1 2 2 3-5z"/>',
  trophy: '<path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/><path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/><path d="M4 22h16"/><path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/><path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/><path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>',
  dumbbell: '<path d="M3 9v6M6.5 6v12M17.5 6v12M21 9v6M6.5 12h11"/>',
  megaphone: '<path d="M3 11v2a1 1 0 0 0 1 1h2l5 4V6L6 10H4a1 1 0 0 0-1 1z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  play: '<polygon points="6 3 20 12 6 21 6 3"/>',
  star: '<polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>',
  eye: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>',
  flag: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/>',
  lock: '<rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  tag: '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
  trend: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  clip: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/>',
  link: '<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>',
  sliders: '<line x1="4" y1="21" x2="4" y2="14"/><line x1="4" y1="10" x2="4" y2="3"/><line x1="12" y1="21" x2="12" y2="12"/><line x1="12" y1="8" x2="12" y2="3"/><line x1="20" y1="21" x2="20" y2="16"/><line x1="20" y1="12" x2="20" y2="3"/><line x1="1" y1="14" x2="7" y2="14"/><line x1="9" y1="8" x2="15" y2="8"/><line x1="17" y1="16" x2="23" y2="16"/>',
  grid: '<rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  mail: '<path d="M4 4h16a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z"/><polyline points="22,6 12,13 2,6"/>',
};
export function ico(name, size = 22, extra = '') {
  return `<svg class="ico ${extra}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[name] || ''}</svg>`;
}
export const icoFill = (name, size = 22, extra = '') => ico(name, size, extra + ' fill');

// ---------------- Componentes pequeños ----------------
export function avatar(u, size = 40, cls = '') {
  const name = u?.name || '?'; const ini = name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase();
  if (u?.gym || u?.id === 0) return `<span class="av ${cls}" style="--s:${size}px"><span class="av-gym">R</span></span>`;
  return `<span class="av ${cls}" style="--s:${size}px">${u?.avatar ? `<img src="${esc(u.avatar)}" alt="" loading="lazy">` : `<span class="av-ini">${esc(ini)}</span>`}</span>`;
}
export const chip = (txt, cls = '') => `<span class="chip ${cls}">${txt}</span>`;
export const roleTag = (r) => (ROLE[r] ? `<span class="rtag rtag-${r}">${ROLE[r]}</span>` : '');
export const empty = (icon, title, sub = '') => `<div class="empty">${ico(icon, 34)}<b>${esc(title)}</b>${sub ? `<span>${esc(sub)}</span>` : ''}</div>`;
export const spinner = () => '<div class="loading"><div class="spin"></div></div>';
export const skeleton = (n = 3) => Array.from({ length: n }, () => '<div class="skel"><div class="skel-h"></div><div class="skel-b"></div></div>').join('');
export function linkify(t) { return esc(t).replace(/@([a-z0-9_.]{3,20})/g, '<a class="mention" href="#/buscar/$1">@$1</a>').replace(/#(\w+)/g, '<span class="hash">#$1</span>').replace(/\n/g, '<br>'); }
export const mediaTag = (url, type, cls = '') => !url ? '' : type === 'video'
  ? `<video class="${cls}" src="${esc(url)}" playsinline controls preload="metadata"></video>` : `<img class="${cls}" src="${esc(url)}" alt="" loading="lazy">`;

// ---------------- Toast ----------------
let toastT;
export function toast(msg, type = '') {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.className = 'show ' + type; t.textContent = msg; clearTimeout(toastT); toastT = setTimeout(() => (t.className = ''), 2800);
}

// ---------------- Hojas modales ----------------
export function sheet(html, { title = '', full = false, cls = '', onClose } = {}) {
  const wrap = document.createElement('div'); wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-bg"></div><div class="sheet ${full ? 'full' : ''} ${cls}" role="dialog" aria-modal="true">
    <div class="sheet-grip"></div>${title !== null ? `<div class="sheet-head"><b>${esc(title)}</b><button class="icon-btn" data-sheet-close aria-label="Cerrar">${ico('x', 22)}</button></div>` : ''}
    <div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(wrap); document.body.classList.add('noscroll');
  requestAnimationFrame(() => wrap.classList.add('open'));
  const api = {
    el: wrap, body: $('.sheet-body', wrap),
    close() { wrap.classList.remove('open'); setTimeout(() => { wrap.remove(); if (!$('.sheet-wrap') && !$('.story-view')) document.body.classList.remove('noscroll'); onClose?.(); }, 220); },
    set(h) { $('.sheet-body', wrap).innerHTML = h; },
  };
  wrap.addEventListener('click', (e) => { if (e.target.classList.contains('sheet-bg') || e.target.closest('[data-sheet-close]')) api.close(); });
  return api;
}
export const closeSheets = () => $$('.sheet-wrap').forEach((w) => { w.remove(); });
export function confirmBox(msg, okText = 'Confirmar', danger = false) {
  return new Promise((resolve) => {
    const s = sheet(`<p class="confirm-msg">${esc(msg)}</p><div class="row gap"><button class="btn ghost grow" data-no>Cancelar</button><button class="btn ${danger ? 'danger' : ''} grow" data-ok>${esc(okText)}</button></div>`, { title: '' , cls: 'small'});
    s.el.addEventListener('click', (e) => { if (e.target.closest('[data-ok]')) { resolve(true); s.close(); } else if (e.target.closest('[data-no]') || e.target.classList.contains('sheet-bg') || e.target.closest('[data-sheet-close]')) resolve(false); });
  });
}
export function menuSheet(items) { // items: [{label, icon, act, danger}]
  const s = sheet(`<div class="menu">${items.map((i, k) => `<button class="menu-item ${i.danger ? 'danger' : ''}" data-i="${k}">${i.icon ? ico(i.icon, 20) : ''}<span>${esc(i.label)}</span></button>`).join('')}</div>`, { title: null, cls: 'small' });
  s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (b) { s.close(); items[b.dataset.i].run(); } });
  return s;
}

// ---------------- Acciones / formularios (delegación) ----------------
export const actions = {}; export const forms = {};
actions.back = () => (history.length > 1 ? history.back() : (location.hash = '#/'));
actions.reload = () => location.reload();
actions.closeSheets = () => closeSheets();
document.addEventListener('focusin', (e) => { if (e.target.matches?.('[data-select]')) e.target.select(); });
document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const fn = actions[el.dataset.act]; if (!fn) return;
  if (el.tagName === 'A') e.preventDefault();
  try { await fn(el, e); } catch (err) { toast(err.message || 'Error', 'err'); }
});
document.addEventListener('submit', async (e) => {
  const f = e.target.closest('form[data-form]'); if (!f) return; e.preventDefault();
  const fn = forms[f.dataset.form]; if (!fn) return;
  const btn = f.querySelector('[type=submit]'); if (btn?.disabled) return;
  btn && (btn.disabled = true, btn.classList.add('busy'));
  try { await fn(f, e); } catch (err) { toast(err.message || 'Error', 'err'); }
  finally { if (btn) { btn.disabled = false; btn.classList.remove('busy'); } }
});
export const formData = (f) => new FormData(f);
export const formObj = (f) => Object.fromEntries(new FormData(f).entries());

// ---------------- Router ----------------
const table = []; let current = null; let cleanup = null; let guard = null;
export const setGuard = (f) => { guard = f; };
export const route = (re, fn, opts = {}) => table.push({ re: new RegExp('^' + re + '$'), fn, ...opts });
export const go = (h) => { if (location.hash === h) render(); else location.hash = h; };
export const onCleanup = (fn) => { cleanup = fn; };
export async function render() {
  const view = $('#view'); if (!view) return;
  const hash = location.hash.replace(/^#/, '') || '/';
  const redirect = guard?.(hash); if (redirect) { if (location.hash !== redirect) { location.hash = redirect; return; } }
  if (cleanup) { try { cleanup(); } catch {} cleanup = null; }
  for (const r of table) {
    const m = hash.match(r.re); if (!m) continue;
    const token = (current = Symbol());
    document.body.dataset.route = r.name || '';
    view.innerHTML = r.skeleton === false ? '' : skeleton(2); window.scrollTo(0, 0);
    try { await r.fn(view, ...m.slice(1).map(decodeURIComponent)); } catch (err) {
      if (token === current) view.innerHTML = `<div class="empty">${ico('flag', 34)}<b>${esc(err.message || 'Error')}</b><button class="btn ghost" data-act="reload">Reintentar</button></div>`;
    }
    window.dispatchEvent(new CustomEvent('route', { detail: hash }));
    return;
  }
  view.innerHTML = empty('flag', 'Página no encontrada');
}
window.addEventListener('hashchange', render);

export async function refreshCounters() {
  try { state.counters = await api('counters'); window.dispatchEvent(new Event('counters')); } catch {}
}
