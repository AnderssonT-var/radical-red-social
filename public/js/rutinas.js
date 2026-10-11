// Rutinas sugeridas: qué entrenar, con días, ejercicios, series y repeticiones
import { $, $$, esc, api, state, ico, avatar, empty, toast, sheet, menuSheet, confirmBox, actions, forms, route, render, isStaff, chip } from './core.js';
import { openWorkout } from './compose.js';

const GOALS = { fuerza: 'Fuerza', hipertrofia: 'Hipertrofia', grasa: 'Pérdida de grasa', resistencia: 'Resistencia', general: 'General' };
const LEVELS = { principiante: 'Principiante', intermedio: 'Intermedio', avanzado: 'Avanzado' };
const canEdit = () => isStaff() || state.user?.role === 'coach';
let F = { goal: '', level: '', days: '' };

route('/rutinas', async (el) => {
  const q = new URLSearchParams(Object.entries(F).filter(([, v]) => v)).toString();
  const [d, ex] = await Promise.all([api('routines' + (q ? '?' + q : '') + (canEdit() ? (q ? '&' : '?') + 'all=1' : '')), api('home/extras')]);
  const fl = (key, opts, all) => `<div class="rt-filters">${[['', all], ...Object.entries(opts)].map(([k, n]) => `<button class="pill-f ${String(F[key]) === String(k) ? 'on' : ''}" data-act="rtF" data-k="${key}" data-v="${k}">${n}</button>`).join('')}</div>`;
  const t = ex.routine;
  el.innerHTML = `<div class="page-head"><h2>Rutinas</h2>${canEdit() ? `<button class="btn sm" data-act="rtNew">${ico('plus', 14)} Nueva</button>` : ''}</div>
    <p class="muted" style="margin:-6px 0 12px">¿No sabes qué entrenar? Elige una rutina, síguela y cada día te diremos qué toca: ejercicios, series y repeticiones.</p>
    ${t ? `<div class="today-card"><small class="k">Hoy te toca · ${esc(t.title)}</small><h3>${esc(t.day)}</h3><ul>${t.exercises.slice(0, 4).map((e) => `<li>${esc(e.name)} · ${e.sets} × ${esc(e.reps)}</li>`).join('')}${t.exercises.length > 4 ? `<li class="muted">y ${t.exercises.length - 4} más…</li>` : ''}</ul>
      <div class="row gap"><a class="btn sm" href="#/rutinas/${t.id}">Ver el día completo</a></div></div>` : ''}
    ${fl('goal', GOALS, 'Todas')}${fl('level', LEVELS, 'Todos los niveles')}${fl('days', { 2: '2 días', 3: '3 días', 4: '4 días', 5: '5 días', 6: '6 días' }, 'Cualquier frecuencia')}
    ${d.items.length ? d.items.map((x) => `<a class="card rt-card" href="#/rutinas/${x.id}"><div class="row between"><b class="t">${esc(x.title)}</b>${x.following ? chip('Siguiendo', 'orange sm') : ''}${x.active ? '' : chip('Oculta', 'red sm')}</div>
      <div class="rt-meta">${chip(GOALS[x.goal] || x.goal, 'orange sm')}${chip(LEVELS[x.level] || x.level, 'sm')}</div><p>${esc(x.description)}</p>
      <div class="rt-stats"><span>${ico('calendar', 14)} ${x.days_per_week} días/semana</span><span>${ico('clock', 14)} ~${x.duration_min} min</span><span>${ico('dumbbell', 14)} ${x.exercises} ejercicios</span></div></a>`).join('') : empty('dumbbell', 'No hay rutinas con esos filtros', 'Prueba con otro objetivo o nivel')}`;
}, { name: 'routines' });
actions.rtF = (el) => { F[el.dataset.k] = el.dataset.v; render(); };

// ---------------------------------------------------------------- detalle
let R = null, dayIdx = 0;
route('/rutinas/(\\d+)', async (el, id) => { R = await api('routines/' + id); dayIdx = R.following ? R.next_day : 0; draw(el); }, { name: 'routine' });
function draw(el = $('#view')) {
  const d = R.days[dayIdx];
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-act="back" aria-label="Volver">${ico('back', 24)}</button><h2>${esc(R.title)}</h2>${canEdit() ? `<button class="icon-btn" data-act="rtMenu" aria-label="Más">${ico('more', 22)}</button>` : ''}</div>
    <div class="rt-meta">${chip(GOALS[R.goal] || R.goal, 'orange sm')}${chip(LEVELS[R.level] || R.level, 'sm')}${R.active ? '' : chip('Oculta', 'red sm')}</div>
    <p class="muted" style="line-height:1.5">${esc(R.description)}</p>
    <div class="rt-stats" style="margin-bottom:12px"><span>${ico('calendar', 14)} ${R.days_per_week} días/semana</span><span>${ico('clock', 14)} ~${R.duration_min} min</span>${R.equipment ? `<span>${ico('dumbbell', 14)} ${esc(R.equipment)}</span>` : ''}</div>
    <div class="rt-cta" style="margin-bottom:14px">${R.following ? `<button class="btn ghost block" data-act="rtUnfollow">Dejar de seguir esta rutina</button>` : `<button class="btn block lg" data-act="rtFollow">Seguir esta rutina</button>`}</div>
    <div class="day-tabs">${R.days.map((x, i) => `<button class="${i === dayIdx ? 'on' : ''} ${R.following && i === R.next_day ? 'next' : ''}" data-act="rtDay" data-i="${i}">${esc(x.name.split('·')[0].trim())}${R.following && i === R.next_day ? ' · hoy' : ''}</button>`).join('')}</div>
    <h3 style="margin:2px 0 0">${esc(d.name)}</h3>${d.focus ? `<small class="muted">${esc(d.focus)}</small>` : ''}
    <div class="ex-list">${d.exercises.map((e, i) => `<div class="ex"><span class="n">${i + 1}</span><div class="g"><b>${esc(e.name)}</b><small>${e.rest ? 'Descanso ' + esc(e.rest) : ''}${e.rest && e.notes ? ' · ' : ''}${esc(e.notes || '')}</small></div><div class="sr">${e.sets} × ${esc(e.reps)}<small>series × reps</small></div></div>`).join('')}</div>
    <button class="btn block lg" data-act="rtLog">${ico('check', 18)} Registrar este entrenamiento</button>
    <p class="muted center sm" style="margin-top:8px">Se abre tu registro con estos ejercicios; solo agrega el peso que usaste.</p>`;
}
actions.rtDay = (el) => { dayIdx = +el.dataset.i; draw(); };
actions.rtFollow = async () => { await api(`routines/${R.id}/follow`, { method: 'POST' }); R.following = true; R.next_day = 0; dayIdx = 0; toast('¡Rutina activada! Te mostraremos qué toca cada día', 'ok'); draw(); };
actions.rtUnfollow = async () => { await api(`routines/${R.id}/follow`, { method: 'DELETE' }); R.following = false; toast('Dejaste de seguir la rutina'); draw(); };
actions.rtLog = () => { const d = R.days[dayIdx]; openWorkout({ title: `${R.title} · ${d.name}`.slice(0, 60), sets: d.exercises.map((e) => ({ exercise: e.name, sets: e.sets, reps: parseInt(e.reps, 10) || 10 })), routine: R.following && dayIdx === R.next_day ? R.id : null }); };
actions.rtMenu = () => menuSheet([{ label: 'Editar rutina', icon: 'edit', run: () => editor(JSON.parse(JSON.stringify(R))) }, { label: R.active ? 'Ocultar' : 'Mostrar', icon: R.active ? 'lock' : 'check', run: () => actions.rtToggle() }, { label: 'Eliminar', icon: 'trash', danger: true, run: () => actions.rtDel() }]);
const closeAll = () => { $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll'); };
actions.rtToggle = async () => { await api('routines/' + R.id, { method: 'PUT', body: { ...R, active: R.active ? '0' : '1' } }); toast(R.active ? 'Rutina oculta' : 'Rutina visible', 'ok'); R = await api('routines/' + R.id); draw(); };
actions.rtDel = async () => { if (!(await confirmBox('¿Eliminar esta rutina? Quienes la siguen dejarán de verla.', 'Eliminar', true))) return; await api('routines/' + R.id, { method: 'DELETE' }); toast('Rutina eliminada'); location.hash = '#/rutinas'; };

// ---------------------------------------------------------------- editor (coach / admin / dueño)
let E = null;
const blank = () => ({ title: '', description: '', goal: 'general', level: 'principiante', days_per_week: 3, duration_min: 60, equipment: '', days: [{ name: 'Día 1', focus: '', exercises: [{ name: '', sets: 3, reps: '10', rest: '60 s', notes: '' }] }] });
actions.rtNew = () => editor(blank());
function editor(x) {
  E = x; const s = sheet(`<form class="form" data-form="rtSave"><label>Nombre<input name="title" maxlength="80" required value="${esc(x.title)}"></label>
    <label>Descripción<textarea name="description" rows="3" maxlength="800">${esc(x.description)}</textarea></label>
    <div class="grid2"><label>Objetivo<select name="goal">${Object.entries(GOALS).map(([k, n]) => `<option value="${k}" ${x.goal === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label><label>Nivel<select name="level">${Object.entries(LEVELS).map(([k, n]) => `<option value="${k}" ${x.level === k ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <div class="grid2"><label>Días por semana<input name="days_per_week" type="number" min="1" max="7" value="${x.days_per_week}"></label><label>Duración (min)<input name="duration_min" type="number" min="10" max="240" value="${x.duration_min}"></label></div>
    <label>Equipo necesario<input name="equipment" maxlength="80" value="${esc(x.equipment)}" placeholder="Barra, mancuernas…"></label>
    <h4 class="blk-h flat">Días y ejercicios</h4><div id="rt-days"></div>
    <button type="button" class="btn ghost block" data-act="rtAddDay">${ico('plus', 16)} Añadir día</button>
    <button class="btn block lg" type="submit">${x.id ? 'Guardar cambios' : 'Publicar rutina'}</button></form>`, { title: x.id ? 'Editar rutina' : 'Nueva rutina', full: true });
  drawDays();
  s.el.addEventListener('input', (e) => { const t = e.target; const d = t.dataset; if (d.rd !== undefined) E.days[+d.d][d.rd] = t.value; else if (d.re !== undefined) E.days[+d.d].exercises[+d.e][d.re] = t.value; });
}
function drawDays() {
  $('#rt-days').innerHTML = E.days.map((d, i) => `<div class="rd-day"><div class="row gap"><input data-rd="name" data-d="${i}" value="${esc(d.name)}" maxlength="60" placeholder="Día ${i + 1} · Pierna" style="flex:1"><button type="button" class="icon-btn" data-act="rtDelDay" data-d="${i}" aria-label="Quitar día">${ico('trash', 18)}</button></div>
    <div class="rd-head"><span>Ejercicio</span><span>Series</span><span>Reps</span><span>Desc.</span><span></span></div>
    ${d.exercises.map((e, j) => `<div class="rd-ex"><input data-re="name" data-d="${i}" data-e="${j}" value="${esc(e.name)}" maxlength="70" placeholder="Sentadilla"><input data-re="sets" data-d="${i}" data-e="${j}" value="${esc(e.sets)}" inputmode="numeric" aria-label="Series"><input data-re="reps" data-d="${i}" data-e="${j}" value="${esc(e.reps)}" aria-label="Repeticiones" placeholder="8-10"><input data-re="rest" data-d="${i}" data-e="${j}" value="${esc(e.rest || '')}" aria-label="Descanso" placeholder="90 s"><button type="button" class="icon-btn" data-act="rtDelEx" data-d="${i}" data-e="${j}" aria-label="Quitar ejercicio">${ico('x', 16)}</button></div>`).join('')}
    <button type="button" class="btn sm ghost" data-act="rtAddEx" data-d="${i}">${ico('plus', 14)} Ejercicio</button></div>`).join('');
}
actions.rtAddDay = () => { E.days.push({ name: `Día ${E.days.length + 1}`, focus: '', exercises: [{ name: '', sets: 3, reps: '10', rest: '60 s', notes: '' }] }); drawDays(); };
actions.rtDelDay = (el) => { if (E.days.length > 1) { E.days.splice(+el.dataset.d, 1); drawDays(); } };
actions.rtAddEx = (el) => { E.days[+el.dataset.d].exercises.push({ name: '', sets: 3, reps: '10', rest: '60 s', notes: '' }); drawDays(); };
actions.rtDelEx = (el) => { const d = E.days[+el.dataset.d]; if (d.exercises.length > 1) { d.exercises.splice(+el.dataset.e, 1); drawDays(); } };
forms.rtSave = async (f) => {
  const body = { title: f.title.value, description: f.description.value, goal: f.goal.value, level: f.level.value, days_per_week: f.days_per_week.value, duration_min: f.duration_min.value, equipment: f.equipment.value, active: E.active === false ? '0' : '1', days: E.days };
  const r = await api(E.id ? 'routines/' + E.id : 'routines', { method: E.id ? 'PUT' : 'POST', body }); closeAll(); toast(E.id ? 'Rutina actualizada' : 'Rutina publicada', 'ok');
  if (E.id) { R = await api('routines/' + E.id); draw(); } else location.hash = '#/rutinas/' + r.id;
};
