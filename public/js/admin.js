// Panel de administración (administrador y dueño). El entrenador solo ve la validación de PRs de sus alumnos.
import { $, $$, esc, api, postForm, state, ico, avatar, ago, empty, toast, sheet, confirmBox, actions, forms, route, go, render, isStaff, num, chip, roleTag, dateShort, dateLong, hhmm, fmtResult, formObj, mediaTag, toLocalInput, TYPE_NAME, ANN, AWARD, linkify } from './core.js';
import { adminStore } from './store.js';

const TABS = [['', 'Resumen'], ['usuarios', 'Usuarios'], ['resultados', 'Resultados'], ['prs', 'PRs'], ['retos', 'Retos'], ['temporadas', 'Temporadas'], ['puntos', 'Puntos'], ['anuncios', 'Anuncios'], ['tienda', 'Tienda'], ['insignias', 'Insignias'], ['reportes', 'Reportes'], ['moderacion', 'Moderación']];
const closeAll = () => { $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll'); };
const seg = (opts, cur, act) => `<div class="seg">${opts.map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
let current = ''; let counts = {};

async function shell(el, sec) {
  current = sec; const coachOnly = !isStaff();
  try { counts = await api('admin/dashboard'); } catch { counts = {}; }
  const badge = { usuarios: counts.pending, resultados: counts.pendingEntries, prs: counts.pendingPrs, reportes: counts.openReports, tienda: counts.pendingOrders };
  el.innerHTML = `<div class="page-head"><h2>${coachOnly ? 'Validar PRs' : 'Administración'}</h2></div>
    ${coachOnly ? '' : `<div class="tabs scroller" id="ad-tabs">${TABS.map(([k, n]) => `<a class="tab ${k === sec ? 'on' : ''}" href="#/admin${k ? '/' + k : ''}">${n}${badge[k] ? `<i class="pill">${badge[k]}</i>` : ''}</a>`).join('')}</div>`}
    <div id="ad-body" class="ad-body"></div>`;
  $('#ad-tabs .on')?.scrollIntoView({ inline: 'center', block: 'nearest' });
  return $('#ad-body');
}
const reload = () => render();

route('/admin', async (el) => { const box = await shell(el, ''); await dashboard(box); }, { name: 'admin' });
route('/admin/(\\w+)', async (el, sec) => {
  const box = await shell(el, sec);
  const map = { usuarios: users, resultados: entries, prs, retos: challenges, temporadas: seasons, puntos: settings, anuncios: announcements, tienda: adminStore, insignias: badges, reportes: reports, moderacion: moderation };
  if (!map[sec]) { box.innerHTML = empty('flag', 'Sección no encontrada'); return; }
  await map[sec](box);
}, { name: 'admin' });

// ================================================================= Resumen
async function dashboard(box) {
  const d = counts; const max = Math.max(1, ...d.week.map((x) => Math.max(x.checkins, x.posts, x.workouts)));
  const card = (i, n, l, href, hot) => `<a class="kpi ${hot ? 'hot' : ''}" ${href ? `href="${href}"` : ''}>${ico(i, 20)}<b>${num(n)}</b><small>${l}</small></a>`;
  box.innerHTML = `<div class="kpis">${card('users', d.active, 'Miembros activos', '#/admin/usuarios')}${card('clock', d.pending, 'Miembros pendientes', '#/admin/usuarios', d.pending)}${card('image', d.posts, `Publicaciones · ${d.postsWeek} esta semana`)}
    ${card('bolt', d.challenge ? d.challenge.participants : 0, d.challenge ? `Participantes · ${esc(d.challenge.title)}` : 'Sin reto activo', '#/admin/retos')}${card('check', d.pendingEntries, 'Resultados por validar', '#/admin/resultados', d.pendingEntries)}${card('trophy', d.pendingPrs, 'PRs por validar', '#/admin/prs', d.pendingPrs)}${card('flag', d.openReports, 'Reportes abiertos', '#/admin/reportes', d.openReports)}${card('lock', d.blocked, 'Bloqueados', '#/admin/usuarios')}</div>
    <section class="card pad"><div class="row between"><h4 class="blk-h flat">Actividad semanal</h4><span class="legend"><i class="l1"></i>Asistencias <i class="l2"></i>Publicaciones <i class="l3"></i>Entrenos</span></div>
      <div class="bars">${d.week.map((x) => `<div class="bar-col"><div class="bar-g"><i class="b1" style="height:${x.checkins / max * 100}%" title="${x.checkins}"></i><i class="b2" style="height:${x.posts / max * 100}%" title="${x.posts}"></i><i class="b3" style="height:${x.workouts / max * 100}%" title="${x.workouts}"></i></div><small>${new Date(x.date + 'T12:00:00').toLocaleDateString('es', { weekday: 'short' }).slice(0, 3)}</small><span class="bn">${x.checkins}</span></div>`).join('')}</div></section>
    <h4 class="blk-h">Usuarios más activos · últimos 30 días</h4>
    <div class="card list-card">${d.top.map((u, i) => `<a class="act" href="#/u/${u.id}"><b class="pos">${i + 1}</b>${avatar(u, 34)}<span class="grow"><b>${esc(u.name)}</b><small class="muted"> @${esc(u.username)}</small></span><b class="orange">${u.score}</b></a>`).join('')}</div>
    ${d.season ? `<h4 class="blk-h">Temporada actual</h4><a class="card pad row between" href="#/admin/temporadas"><div><b>${esc(d.season.name)}</b><small class="muted"> · ${dateShort(d.season.start_at + ' 12:00:00')} → ${dateShort(d.season.end_at + ' 12:00:00')}</small></div>${ico('chevR', 18)}</a>` : `<a class="btn block" href="#/admin/temporadas">Crear temporada</a>`}`;
}

// ================================================================= Usuarios
let uf = 'pending'; let uq = '';
async function users(box) {
  if (uf === 'pending' && !counts.pending) uf = 'active';
  box.innerHTML = `${seg([['pending', 'Pendientes'], ['active', 'Activos'], ['blocked', 'Bloqueados'], ['', 'Todos']], uf, 'adUF')}<input class="search" id="uq" placeholder="Buscar por nombre, usuario o correo" value="${esc(uq)}" autocomplete="off"><div id="ulist"></div>`;
  let t; $('#uq').addEventListener('input', (e) => { uq = e.target.value; clearTimeout(t); t = setTimeout(loadUsers, 220); });
  await loadUsers();
}
actions.adUF = (el) => { uf = el.dataset.v; users($('#ad-body')); };
let userCache = [];
async function loadUsers() {
  const list = await api(`admin/users?status=${uf}&q=${encodeURIComponent(uq)}`); userCache = list;
  $('#ulist').innerHTML = list.length ? `<div class="card list-card">${list.map((u) => `<div class="urow"><a href="#/u/${u.id}">${avatar(u, 46)}</a><div class="grow"><b>${esc(u.name)}</b> ${roleTag(u.role)}<small class="muted block">@${esc(u.username)} · ${esc(u.email)}</small><small class="muted">Se unió ${ago(u.created_at)}</small></div>
    <div class="urow-btns">${u.status === 'pending' ? `<button class="btn sm" data-act="adApprove" data-id="${u.id}">Aprobar</button><button class="btn sm ghost" data-act="adBlock" data-id="${u.id}">Rechazar</button>`
      : `${u.status === 'blocked' ? chip('Bloqueado', 'red sm') : ''}<button class="btn sm ghost" data-act="adEditUser" data-id="${u.id}">Editar</button>`}</div></div>`).join('')}</div>` : empty('users', 'No hay usuarios en esta vista');
}
actions.adApprove = async (el) => { await api('admin/users/' + el.dataset.id, { method: 'PUT', body: { status: 'active' } }); toast('Usuario aprobado', 'ok'); reload(); };
actions.adBlock = async (el) => { if (!(await confirmBox('¿Bloquear esta cuenta? No podrá entrar a RADICAL.', 'Bloquear', true))) return; await api('admin/users/' + el.dataset.id, { method: 'PUT', body: { status: 'blocked' } }); toast('Cuenta bloqueada'); reload(); };
actions.adEditUser = async (el) => {
  const u = userCache.find((x) => x.id === +el.dataset.id); const owner = state.user.role === 'owner';
  const coaches = (await api('admin/users?status=active')).filter((x) => x.role === 'coach');
  const locked = (u.role === 'owner' || u.role === 'admin') && !owner && u.id !== state.user.id;
  if (locked) return toast('Solo el dueño puede editar administradores', 'err');
  const roles = [['user', 'Miembro'], ['coach', 'Entrenador'], ...(owner ? [['admin', 'Administrador'], ['owner', 'Dueño']] : [])];
  sheet(`<form class="form" data-form="adUser" data-id="${u.id}"><label>Nombre<input name="name" value="${esc(u.name)}" required maxlength="60"></label>
    <div class="grid2"><label>Rol<select name="role" ${u.id === state.user.id ? 'disabled' : ''}>${roles.map(([k, n]) => `<option value="${k}" ${u.role === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
      <label>Estado<select name="status" ${u.id === state.user.id ? 'disabled' : ''}>${[['active', 'Activo'], ['pending', 'Pendiente'], ['blocked', 'Bloqueado']].map(([k, n]) => `<option value="${k}" ${u.status === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label>Entrenador asignado<select name="coach_id"><option value="">Sin entrenador</option>${coaches.map((c) => `<option value="${c.id}" ${u.coach_id === c.id ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
    <div class="grid2"><label>Equipo<input name="team" value="${esc(u.team || '')}" maxlength="30" placeholder="Ej. Fuego"></label><label>Disciplina<input name="discipline" value="${esc(u.discipline || '')}" maxlength="40"></label></div>
    <div class="grid2"><label>Género<select name="gender"><option value="" ${!u.gender ? 'selected' : ''}>—</option><option value="M" ${u.gender === 'M' ? 'selected' : ''}>Hombre</option><option value="F" ${u.gender === 'F' ? 'selected' : ''}>Mujer</option></select></label><label>Peso (kg)<input name="weight" type="number" step="0.1" value="${u.weight ?? ''}"></label></div>
    <label>Meta semanal (días)<select name="weekly_goal">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === u.weekly_goal ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <button class="btn block lg" type="submit">Guardar</button>
    <button type="button" class="btn ghost block" data-act="adResetLink" data-id="${u.id}">${ico('link', 16)} Generar enlace para restablecer contraseña</button></form>`, { title: `Editar · ${u.name}`, full: true });
};
forms.adUser = async (f) => {
  const b = formObj(f); ['role', 'status'].forEach((k) => { if (f.elements[k].disabled) delete b[k]; });
  await api('admin/users/' + f.dataset.id, { method: 'PUT', body: b }); closeAll(); toast('Usuario actualizado', 'ok'); reload();
};
actions.adResetLink = async (el) => {
  const r = await api(`admin/users/${el.dataset.id}/reset-link`, { method: 'POST' }); const url = location.origin + r.path;
  navigator.clipboard?.writeText(url).catch(() => {});
  sheet(`<p class="muted">Envía este enlace al miembro (vale 24 horas). Ya se copió al portapapeles.</p><input class="search" readonly value="${esc(url)}" data-select>`, { title: 'Enlace de recuperación', cls: 'small' });
};

// ================================================================= Resultados de retos
let ef = 'pending';
async function entries(box) {
  box.innerHTML = `${seg([['pending', 'Pendientes'], ['approved', 'Aprobados'], ['rejected', 'Rechazados']], ef, 'adEF')}<div id="elist"></div>`;
  const list = await api('admin/entries?status=' + ef);
  $('#elist').innerHTML = list.length ? list.map((e) => `<article class="card rev" id="en-${e.id}"><div class="rev-h">${avatar(e, 40)}<div class="grow"><b>${esc(e.name)}</b><small class="muted block">${esc(e.challenge)} · ${ago(e.created_at)}</small></div><b class="rev-val">${esc(fmtResult(e.result, e.unit))}</b></div>
    ${e.video ? `<div class="rev-media">${/\.(mp4|mov|webm|m4v)$/i.test(e.video) ? mediaTag(e.video, 'video') : mediaTag(e.video, 'image')}</div>` : '<p class="note amberbox">Sin evidencia en video</p>'}
    ${e.note ? `<p class="muted sm">“${esc(e.note)}”</p>` : ''}${e.review_note ? `<p class="muted sm">Revisión: ${esc(e.review_note)}</p>` : ''}
    <div class="row gap">${e.status !== 'approved' ? `<button class="btn grow" data-act="adEntry" data-id="${e.id}" data-s="approved">Aprobar</button>` : ''}${e.status !== 'rejected' ? `<button class="btn grow ghost" data-act="adEntry" data-id="${e.id}" data-s="rejected">Rechazar</button>` : ''}<button class="btn ghost icon" data-act="adEntryEdit" data-id="${e.id}" data-r="${e.result}" data-u="${esc(e.unit)}" aria-label="Editar resultado">${ico('edit', 16)}</button></div></article>`).join('')
    : empty('check', 'Nada por aquí', ef === 'pending' ? 'No hay resultados por validar' : '');
}
actions.adEF = (el) => { ef = el.dataset.v; reload(); };
actions.adEntry = async (el) => {
  const status = el.dataset.s; let review_note = '';
  if (status === 'rejected') { review_note = prompt('Motivo del rechazo (opcional):', '') ?? null; if (review_note === null) return; }
  await api('admin/entries/' + el.dataset.id, { method: 'PUT', body: { status, review_note } }); toast(status === 'approved' ? 'Resultado aprobado' : 'Resultado rechazado', status === 'approved' ? 'ok' : ''); reload();
};
actions.adEntryEdit = (el) => {
  sheet(`<form class="form" data-form="adEntryEdit" data-id="${el.dataset.id}"><label>Resultado (${esc(el.dataset.u)})<input name="result" type="number" step="any" min="0" value="${el.dataset.r}" required></label>
    <label>Nota de revisión<input name="review_note" maxlength="300" placeholder="Ej. Corregido tras revisar el video"></label>
    <button class="btn block lg" type="submit" name="s" value="approved">Guardar y aprobar</button></form>`, { title: 'Editar resultado', cls: 'small' });
};
forms.adEntryEdit = async (f) => { await api('admin/entries/' + f.dataset.id, { method: 'PUT', body: { result: f.result.value, review_note: f.review_note.value, status: 'approved' } }); closeAll(); toast('Resultado actualizado y aprobado', 'ok'); reload(); };

// ================================================================= PRs
async function prs(box) {
  const list = await api('review/prs');
  box.innerHTML = list.length ? list.map((p) => `<article class="card rev" id="pr-${p.id}"><div class="rev-h">${avatar(p, 40)}<div class="grow"><b>${esc(p.name)}</b><small class="muted block">${esc(p.exercise)} · ${ago(p.created_at)}</small></div><b class="rev-val">${num(p.value)} ${esc(p.unit)}${p.reps > 1 ? ` ×${p.reps}` : ''}</b></div>
    ${p.video ? `<div class="rev-media">${/\.(mp4|mov|webm|m4v)$/i.test(p.video) ? mediaTag(p.video, 'video') : mediaTag(p.video, 'image')}</div>` : '<p class="note amberbox">Sin video de evidencia</p>'}${p.note ? `<p class="muted sm">“${esc(p.note)}”</p>` : ''}
    <div class="row gap"><button class="btn grow" data-act="adPr" data-id="${p.id}" data-s="approved">Validar PR</button><button class="btn grow ghost" data-act="adPr" data-id="${p.id}" data-s="rejected">Rechazar</button></div></article>`).join('')
    : empty('trophy', 'No hay PRs por validar', 'Cuando alguien registre un récord aparecerá aquí');
}
actions.adPr = async (el) => {
  const status = el.dataset.s; let review_note = '';
  if (status === 'rejected') { review_note = prompt('Motivo del rechazo (opcional):', '') ?? null; if (review_note === null) return; }
  await api('review/prs/' + el.dataset.id, { method: 'PUT', body: { status, review_note } }); toast(status === 'approved' ? 'PR validado · se publicó en el feed' : 'PR rechazado', status === 'approved' ? 'ok' : ''); reload();
};

// ================================================================= Retos
const toISO = (v) => (v ? new Date(v).toISOString() : '');
async function challenges(box) {
  const d = await api('challenges'); const all = [...d.active, ...d.upcoming, ...d.past];
  const row = (c) => `<div class="card rev"><div class="rev-h"><div class="grow"><b>${esc(c.title)}</b> ${c.featured ? chip('Destacado', 'orange sm') : ''}<small class="muted block">${esc(c.exercise || '')}${c.weight ? ` · ${c.weight} kg` : ''} · ${esc(TYPE_NAME[c.type])} · ${dateShort(c.start_at)} → ${dateShort(c.end_at)}</small><small class="muted">${c.participants} participantes · ${c.points} pts</small></div>${chip(c.status === 'active' ? 'Activo' : c.status === 'upcoming' ? 'Próximo' : 'Finalizado', c.status === 'active' ? 'green sm' : c.status === 'upcoming' ? 'amber sm' : 'sm')}</div>
    <div class="row gap wrap"><a class="btn sm ghost" href="#/reto/${c.id}">Ver</a><button class="btn sm ghost" data-act="adChEdit" data-id="${c.id}">Editar</button>${c.finalized ? '' : `<button class="btn sm ghost" data-act="adChFin" data-id="${c.id}">Finalizar y premiar</button>`}<button class="btn sm ghost danger-t" data-act="adChDel" data-id="${c.id}">Eliminar</button></div></div>`;
  window.__chs = all;
  box.innerHTML = `<button class="btn block" data-act="adChNew">${ico('plus', 18)} Crear reto semanal</button>${all.length ? all.map(row).join('') : empty('bolt', 'Aún no hay retos', 'Crea el primer reto de la semana')}`;
}
function challengeForm(c) {
  const now = new Date(); now.setHours(0, 0, 0, 0); const end = new Date(now.getTime() + 7 * 864e5 - 60e3);
  const loc = (d) => { const x = new Date(d); x.setMinutes(x.getMinutes() - x.getTimezoneOffset()); return x.toISOString().slice(0, 16); };
  const v = c || { title: '', description: '', exercise: '', weight: '', type: 'max_reps', attempts: 2, classification: 'gender', prize: '', points: 50, rules: '', featured: 1 };
  const sv = c ? toLocalInput(c.start_at) : loc(now), ev = c ? toLocalInput(c.end_at) : loc(end);
  sheet(`<form class="form" data-form="adChallenge" ${c ? `data-id="${c.id}"` : ''}>
    <label>Título<input name="title" value="${esc(v.title)}" maxlength="80" required placeholder="Ej. Reto Press de Pierna 120 kg"></label>
    <label>Descripción<textarea name="description" rows="3" maxlength="1000">${esc(v.description)}</textarea></label>
    <div class="grid2"><label>Ejercicio<input name="exercise" value="${esc(v.exercise)}" maxlength="60" placeholder="Press de pierna"></label><label>Peso obligatorio (kg)<input name="weight" type="number" step="0.5" min="0" value="${v.weight ?? ''}"></label></div>
    <label>Tipo de reto<select name="type">${Object.entries(TYPE_NAME).map(([k, n]) => `<option value="${k}" ${v.type === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <div class="grid2"><label>Inicio<input name="start_at" type="datetime-local" value="${sv}" required></label><label>Fin<input name="end_at" type="datetime-local" value="${ev}" required></label></div>
    <div class="grid2"><label>Intentos<input name="attempts" type="number" min="1" max="10" value="${v.attempts}"></label><label>Puntos<input name="points" type="number" min="0" value="${v.points}"></label></div>
    <label>Clasificación<select name="classification">${[['gender', 'Hombres y mujeres separados'], ['general', 'General'], ['weight', 'Por categorías de peso']].map(([k, n]) => `<option value="${k}" ${v.classification === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
    <label>Premio<input name="prize" value="${esc(v.prize)}" maxlength="120" placeholder="Ej. Un mes de membresía gratis"></label>
    <label>Reglas<textarea name="rules" rows="4" maxlength="1500" placeholder="• Rango completo&#10;• Video continuo obligatorio">${esc(v.rules)}</textarea></label>
    <label class="file">${ico('image', 20)}<span>Imagen del reto</span><input type="file" name="image" accept="image/*"></label>
    <label class="file">${ico('video', 20)}<span>Video explicativo (opcional)</span><input type="file" name="video" accept="video/*"></label>
    <label class="check"><input type="checkbox" name="featured" ${v.featured ? 'checked' : ''}><span>Reto destacado de la semana (aparece en Inicio)</span></label>
    <button class="btn block lg" type="submit">${c ? 'Guardar cambios' : 'Publicar reto'}</button></form>`, { title: c ? 'Editar reto' : 'Nuevo reto', full: true });
}
actions.adChNew = () => challengeForm(null);
actions.adChEdit = (el) => challengeForm(window.__chs.find((c) => c.id === +el.dataset.id));
forms.adChallenge = async (f) => {
  const fd = new FormData(f); fd.set('start_at', toISO(f.start_at.value)); fd.set('end_at', toISO(f.end_at.value)); fd.set('featured', f.featured.checked ? '1' : '0');
  ['image', 'video'].forEach((k) => { if (!fd.get(k)?.size) fd.delete(k); });
  await postForm(f.dataset.id ? 'admin/challenges/' + f.dataset.id : 'admin/challenges', fd, f.dataset.id ? 'PUT' : 'POST');
  closeAll(); toast(f.dataset.id ? 'Reto actualizado' : '¡Reto publicado! Se avisó a todos los miembros', 'ok'); reload();
};
actions.adChFin = async (el) => { if (!(await confirmBox('Se cerrará el reto, se darán los puntos de victoria y se publicarán los resultados. ¿Continuar?', 'Finalizar'))) return; const r = await api(`admin/challenges/${el.dataset.id}/finalize`, { method: 'POST' }); toast(r.winners.length ? `Ganadores: ${r.winners.map((w) => w.name).join(', ')}` : 'Reto finalizado', 'ok'); reload(); };
actions.adChDel = async (el) => { if (!(await confirmBox('¿Eliminar este reto y todos sus resultados? No se puede deshacer.', 'Eliminar', true))) return; await api('admin/challenges/' + el.dataset.id, { method: 'DELETE' }); toast('Reto eliminado'); reload(); };

// ================================================================= Temporadas
async function seasons(box) {
  const d = await api('seasons'); const c = d.current;
  box.innerHTML = `${c ? `<section class="card pad"><span class="chip orange">En curso</span><h3>${esc(c.name)}</h3><p class="muted">${dateShort(c.start_at + ' 12:00:00')} → ${dateShort(c.end_at + ' 12:00:00')}</p>
    <div class="row gap"><a class="btn ghost grow" href="#/temporadas">Ver clasificación</a><button class="btn ghost grow danger-t" data-act="adSeasonClose" data-id="${c.id}">Cerrar temporada</button></div>
    <p class="muted sm">Al cerrar: se guardan los resultados históricos, se entregan los premios y el ranking de temporada vuelve a cero. Insignias y trofeos se conservan.</p></section>` : '<p class="note">No hay una temporada activa.</p>'}
  <button class="btn block" data-act="adSeasonNew">${ico('plus', 18)} ${c ? 'Cerrar la actual y crear nueva temporada' : 'Crear temporada'}</button>
  <h4 class="blk-h">Historial</h4>${d.history.length ? d.history.map((s) => `<div class="card pad"><b>${esc(s.name)}</b><small class="muted block">${dateShort(s.start_at + ' 12:00:00')} → ${dateShort(s.end_at + ' 12:00:00')}</small>${s.awards.length ? `<div class="chips">${s.awards.map((a) => chip(`${AWARD[a.award]}: ${esc(a.team ? 'Equipo ' + a.team : a.name)}`, 'sm')).join('')}</div>` : ''}</div>`).join('') : empty('trophy', 'Sin temporadas finalizadas')}`;
}
actions.adSeasonNew = () => {
  const s = new Date(); const day = (s.getDay() + 6) % 7; s.setDate(s.getDate() - day); const e = new Date(s.getTime() + 70 * 864e5 - 864e5); const f = (d) => d.toLocaleDateString('en-CA');
  sheet(`<form class="form" data-form="adSeason"><label>Nombre<input name="name" required maxlength="60" placeholder="Temporada 2 · Hierro"></label>
    <div class="grid2"><label>Inicio<input name="start_at" type="date" value="${f(s)}" required></label><label>Fin<input name="end_at" type="date" value="${f(e)}" required></label></div>
    <p class="muted sm">Una temporada dura entre 4 y 16 semanas (recomendado 8 a 12). Si hay una activa, se cerrará y se entregarán sus premios.</p><button class="btn block lg" type="submit">Crear temporada</button></form>`, { title: 'Nueva temporada', cls: 'small' });
};
forms.adSeason = async (f) => { await api('admin/seasons', { method: 'POST', body: formObj(f) }); closeAll(); toast('Temporada creada', 'ok'); reload(); };
actions.adSeasonClose = async (el) => { if (!(await confirmBox('¿Cerrar la temporada ahora y entregar premios? El ranking se reinicia.', 'Cerrar temporada', true))) return; await api(`admin/seasons/${el.dataset.id}/close`, { method: 'POST' }); toast('Temporada cerrada', 'ok'); reload(); };

// ================================================================= Puntos / ajustes
const PTS = [['points.attendance', 'Asistencia al gimnasio'], ['points.workout', 'Entrenamiento completado'], ['points.pr_validated', 'PR validado'], ['points.challenge_join', 'Participar en un reto'], ['points.challenge_complete', 'Completar un reto'], ['points.challenge_win', 'Ganar un reto'], ['points.event', 'Asistir a un evento del gimnasio']];
async function settings(box) {
  const s = await api('admin/settings'); let bands = []; try { bands = JSON.parse(s['weight.bands']); } catch {}
  box.innerHTML = `<form class="form" data-form="adSettings"><h4 class="blk-h flat">Puntos RADICAL</h4><div class="card pad pts">${PTS.map(([k, n]) => `<label class="pts-row"><span>${n}</span><input name="${k}" type="number" min="0" max="10000" value="${esc(s[k] ?? 0)}"></label>`).join('')}</div>
    <p class="muted sm">${ico('lock', 12)} Los likes, seguidores y publicaciones <b>nunca</b> dan puntos, para evitar abusos.</p>
    <h4 class="blk-h flat">Gimnasio</h4><label>Nombre<input name="gym.name" value="${esc(s['gym.name'] || 'RADICAL')}" maxlength="40"></label>
    <label>Código de invitación para registrarse (opcional)<input name="gym.invite_code" value="${esc(s['gym.invite_code'] || '')}" maxlength="30" placeholder="Déjalo vacío para registro abierto"></label>
    <label>Categorías de peso (límites en kg)<input name="weight.bands" value="${bands.join(', ')}" placeholder="65, 80, 95"></label><p class="muted sm">Con 65, 80, 95 las categorías son: -65, 65-80, 80-95 y +95 kg.</p>
    <button class="btn block lg" type="submit">Guardar configuración</button></form>`;
}
forms.adSettings = async (f) => { await api('admin/settings', { method: 'PUT', body: formObj(f) }); toast('Configuración guardada', 'ok'); };

// ================================================================= Anuncios / promociones / eventos
async function announcements(box) {
  const list = await api('admin/announcements'); window.__anns = list;
  box.innerHTML = `<button class="btn block" data-act="adAnnNew">${ico('plus', 18)} Nuevo anuncio, promoción o evento</button>${list.length ? list.map((a) => { const [l] = ANN[a.kind] || ANN.notice; return `<div class="card rev"><div class="rev-h"><div class="grow"><b>${esc(a.title)}</b><small class="muted block">${l} · ${ago(a.created_at)}${a.event_at ? ' · ' + dateShort(a.event_at) : ''}</small>${a.pinned ? chip('Fijado', 'orange sm') : ''} ${a.in_story ? chip('En historias', 'sm') : ''}</div></div>
    <div class="row gap wrap"><button class="btn sm ghost" data-act="adAnnEdit" data-id="${a.id}">Editar</button>${['event', 'competition'].includes(a.kind) ? `<button class="btn sm ghost" data-act="adAnnAtt" data-id="${a.id}">Registrar asistencia</button>` : ''}<button class="btn sm ghost danger-t" data-act="adAnnDel" data-id="${a.id}">Eliminar</button></div></div>`; }).join('') : empty('megaphone', 'Aún no hay anuncios')}`;
}
function annForm(a) {
  sheet(`<form class="form" data-form="adAnn" ${a ? `data-id="${a.id}"` : ''}>
    ${a ? '' : `<label>Tipo<select name="kind">${Object.entries(ANN).map(([k, [n]]) => `<option value="${k}">${n}</option>`).join('')}</select></label>`}
    <label>Título<input name="title" value="${esc(a?.title || '')}" maxlength="100" required></label><label>Detalle<textarea name="body" rows="4" maxlength="1500">${esc(a?.body || '')}</textarea></label>
    ${a ? '' : `<label>Fecha y hora del evento (opcional)<input name="event_at" type="datetime-local"></label>`}
    <label class="file">${ico('image', 20)}<span>Imagen (opcional)</span><input type="file" name="image" accept="image/*"></label>
    <label class="check"><input type="checkbox" name="pinned" ${a?.pinned ? 'checked' : ''}><span>Fijar arriba del feed</span></label><label class="check"><input type="checkbox" name="in_story" ${a?.in_story ? 'checked' : ''}><span>Mostrar también en historias (24 h)</span></label>
    <button class="btn block lg" type="submit">${a ? 'Guardar' : 'Publicar'}</button></form>`, { title: a ? 'Editar anuncio' : 'Nuevo anuncio', full: true });
}
actions.adAnnNew = () => annForm(null);
actions.adAnnEdit = (el) => annForm(window.__anns.find((a) => a.id === +el.dataset.id));
forms.adAnn = async (f) => {
  const fd = new FormData(f); fd.set('pinned', f.pinned.checked ? '1' : '0'); fd.set('in_story', f.in_story.checked ? '1' : '0'); if (f.event_at) fd.set('event_at', toISO(f.event_at.value)); if (!fd.get('image')?.size) fd.delete('image');
  await postForm(f.dataset.id ? 'admin/announcements/' + f.dataset.id : 'admin/announcements', fd, f.dataset.id ? 'PUT' : 'POST'); closeAll(); toast(f.dataset.id ? 'Anuncio actualizado' : 'Anuncio publicado y notificado', 'ok'); reload();
};
actions.adAnnDel = async (el) => { if (!(await confirmBox('¿Eliminar este anuncio?', 'Eliminar', true))) return; await api('admin/announcements/' + el.dataset.id, { method: 'DELETE' }); toast('Anuncio eliminado'); reload(); };
actions.adAnnAtt = async (el) => {
  const us = (await api('admin/users?status=active')); const id = el.dataset.id;
  const s = sheet(`<p class="muted sm">Marca a quienes asistieron: recibirán los puntos de evento.</p><form data-form="adAtt" data-id="${id}" class="form"><div class="people">${us.map((u) => `<label class="person chk"><input type="checkbox" name="u" value="${u.id}">${avatar(u, 36)}<div class="grow"><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></div></label>`).join('')}</div><button class="btn block lg" type="submit">Otorgar puntos</button></form>`, { title: 'Asistencia al evento', cls: 'tall' });
};
forms.adAtt = async (f) => { const ids = $$('input[name=u]:checked', f).map((x) => +x.value); const r = await api(`admin/announcements/${f.dataset.id}/attendance`, { method: 'POST', body: { user_ids: ids } }); closeAll(); toast(`Puntos otorgados a ${r.awarded} miembros`, 'ok'); };

// ================================================================= Insignias
async function badges(box) {
  const list = await api('admin/badges'); window.__bdg = list;
  box.innerHTML = `<button class="btn block" data-act="adBadgeNew">${ico('plus', 18)} Crear insignia personalizada</button><div class="badge-grid admin">${list.map((b) => `<div class="bdg-card on ${b.active ? '' : 'off'}"><i>${b.icon}</i><b>${esc(b.name)}</b><small>${esc(b.description)}</small><small class="muted">${b.holders} ${b.holders === 1 ? 'miembro' : 'miembros'} · ${b.kind === 'manual' ? 'manual' : 'automática'}</small>
    <div class="row gap wrap center"><button class="btn sm ghost" data-act="adBadgeGrant" data-id="${b.id}">Otorgar</button><button class="btn sm ghost" data-act="adBadgeToggle" data-id="${b.id}" data-a="${b.active}">${b.active ? 'Desactivar' : 'Activar'}</button></div></div>`).join('')}</div>`;
}
actions.adBadgeNew = () => sheet(`<form class="form" data-form="adBadge"><div class="grid2"><label>Emoji<input name="icon" maxlength="4" value="🏅" required></label><label>Nombre<input name="name" maxlength="40" required placeholder="Ej. Madrugador"></label></div><label>Descripción<input name="description" maxlength="120"></label><button class="btn block lg" type="submit">Crear</button></form>`, { title: 'Nueva insignia', cls: 'small' });
forms.adBadge = async (f) => { await api('admin/badges', { method: 'POST', body: formObj(f) }); closeAll(); toast('Insignia creada', 'ok'); reload(); };
actions.adBadgeToggle = async (el) => { await api('admin/badges/' + el.dataset.id, { method: 'PUT', body: { active: el.dataset.a === '1' ? 0 : 1 } }); reload(); };
actions.adBadgeGrant = async (el) => {
  const us = await api('admin/users?status=active');
  sheet(`<form class="form" data-form="adGrant" data-id="${el.dataset.id}"><label>Miembro<select name="user_id">${us.map((u) => `<option value="${u.id}">${esc(u.name)} (@${esc(u.username)})</option>`).join('')}</select></label><button class="btn block lg" type="submit">Otorgar insignia</button></form>`, { title: 'Otorgar insignia', cls: 'small' });
};
forms.adGrant = async (f) => { const r = await api(`admin/badges/${f.dataset.id}/grant`, { method: 'POST', body: { user_id: +f.user_id.value } }); closeAll(); toast(r.ok ? 'Insignia otorgada' : 'Ya la tenía'); reload(); };

// ================================================================= Reportes y moderación
async function reports(box) {
  const list = await api('admin/reports');
  const T = { post: 'Publicación', comment: 'Comentario', user: 'Perfil', story: 'Historia' };
  box.innerHTML = list.length ? list.map((r) => `<div class="card rev"><div class="rev-h"><span class="n-ic red">${ico('flag', 18)}</span><div class="grow"><b>${T[r.target_type]}</b><small class="muted block">Reportado por ${esc(r.reporter)} · ${ago(r.created_at)}</small></div></div>
    <p class="quote">${esc(r.preview || '—')}</p><p class="muted sm">Motivo: ${esc(r.reason || 'sin motivo')}</p>
    <div class="row gap wrap">${r.target_type === 'post' ? `<a class="btn sm ghost" href="#/post/${r.target_id}">Ver</a>` : r.target_type === 'user' ? `<a class="btn sm ghost" href="#/u/${r.target_id}">Ver perfil</a>` : ''}${r.target_type !== 'user' ? `<button class="btn sm danger" data-act="adRep" data-id="${r.id}" data-a="delete">Eliminar contenido</button>` : ''}<button class="btn sm ghost" data-act="adRep" data-id="${r.id}" data-a="dismiss">Descartar</button></div></div>`).join('')
    : empty('shield', 'Sin reportes abiertos', 'La comunidad está en orden');
}
actions.adRep = async (el) => { await api('admin/reports/' + el.dataset.id, { method: 'PUT', body: { action: el.dataset.a } }); toast(el.dataset.a === 'delete' ? 'Contenido eliminado' : 'Reporte cerrado'); reload(); };
async function moderation(box) {
  const [posts, cms] = await Promise.all([api('admin/posts?q='), api('admin/comments')]);
  box.innerHTML = `<h4 class="blk-h flat">Publicaciones recientes</h4>${posts.map((p) => `<div class="card mod" id="mp-${p.id}"><a href="#/u/${p.author.id}">${avatar(p.author, 34)}</a><div class="grow"><b>${esc(p.author.name)}</b><small class="muted"> · ${ago(p.created_at)}</small><p class="clamp">${esc(p.text || (p.media ? '📷 Foto/video' : ''))}</p></div><a class="icon-btn" href="#/post/${p.id}" aria-label="Ver">${ico('eye', 18)}</a><button class="icon-btn danger-t" data-act="adModPost" data-id="${p.id}" aria-label="Eliminar">${ico('trash', 18)}</button></div>`).join('') || empty('image', 'Sin publicaciones')}
    <h4 class="blk-h">Comentarios recientes</h4>${cms.map((c) => `<div class="card mod" id="mc-${c.id}"><div class="grow"><b>@${esc(c.username)}</b><small class="muted"> · ${ago(c.created_at)}</small><p class="clamp">${esc(c.text)}</p></div><a class="icon-btn" href="#/post/${c.post_id}" aria-label="Ver">${ico('eye', 18)}</a><button class="icon-btn danger-t" data-act="adModCm" data-id="${c.id}" aria-label="Eliminar">${ico('trash', 18)}</button></div>`).join('') || empty('comment', 'Sin comentarios')}`;
}
actions.adModPost = async (el) => { if (!(await confirmBox('¿Eliminar esta publicación?', 'Eliminar', true))) return; await api('posts/' + el.dataset.id, { method: 'DELETE' }); $('#mp-' + el.dataset.id)?.remove(); toast('Publicación eliminada'); };
actions.adModCm = async (el) => { if (!(await confirmBox('¿Eliminar este comentario?', 'Eliminar', true))) return; await api('comments/' + el.dataset.id, { method: 'DELETE' }); $('#mc-' + el.dataset.id)?.remove(); toast('Comentario eliminado'); };
