// Publicar: publicación, historia, nuevo PR, entrenamiento y progreso
import { $, $$, esc, api, postForm, state, ico, avatar, empty, toast, sheet, actions, forms, go, render, isStaff, formObj } from './core.js';

const closeAll = () => { $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll'); };
const todayStr = () => new Date().toLocaleDateString('en-CA');

// Reduce fotos grandes antes de subirlas (ahorra datos y espacio en el servidor)
export async function shrink(file, max = 1600) {
  if (!file || !file.type.startsWith('image/') || file.type === 'image/gif' || file.size < 700 * 1024) return file;
  try {
    const bmp = await createImageBitmap(file); const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const c = document.createElement('canvas'); c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
    c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
    const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
    return blob && blob.size < file.size ? new File([blob], file.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : file;
  } catch { return file; }
}
async function prepare(fd, field) { const f = fd.get(field); if (!f || !f.size) { fd.delete(field); return; } const g = await shrink(f); fd.set(field, g, g.name); }

// Selector de archivo con vista previa
const picker = (name, label, accept = 'image/*,video/*', icon = 'image') => `<label class="drop" data-drop><span class="drop-prev"></span><span class="drop-hint">${ico(icon, 28)}<b>${label}</b><small>Foto o video</small></span>
  <input type="file" name="${name}" accept="${accept}" hidden></label>`;
document.addEventListener('change', (e) => {
  const inp = e.target.closest('[data-drop] input[type=file]'); if (!inp) return;
  const box = inp.closest('[data-drop]'); const f = inp.files[0]; const prev = $('.drop-prev', box);
  if (!f) { prev.innerHTML = ''; box.classList.remove('has'); return; }
  const url = URL.createObjectURL(f); box.classList.add('has');
  prev.innerHTML = f.type.startsWith('video') ? `<video src="${url}" muted playsinline controls></video>` : `<img src="${url}" alt="">`;
});

// ---------------------------------------------------------------- hub
const TYPES = [
  ['post', 'image', 'Publicación', 'Comparte una foto o video con la comunidad'],
  ['story', 'camera', 'Historia', 'Desaparece en 24 horas'],
  ['pr', 'trophy', 'Nuevo PR', 'Registra un récord personal (se valida)'],
  ['workout', 'dumbbell', 'Entrenamiento', 'Ejercicios, series, repeticiones y peso'],
  ['progress', 'trend', 'Progreso', 'Peso corporal, fotos y notas'],
];
export function openCompose(type) {
  if (!type) {
    const s = sheet(`<div class="hub">${TYPES.map(([k, i, t, d]) => `<button class="hub-item" data-t="${k}"><span class="hub-ic">${ico(i, 24)}</span><div><b>${t}</b><small>${d}</small></div>${ico('chevR', 18)}</button>`).join('')}
      <button class="hub-item hub-check" data-t="checkin"><span class="hub-ic">${ico('check', 24)}</span><div><b>Marcar asistencia de hoy</b><small>+ puntos y suma a tu racha</small></div>${ico('chevR', 18)}</button></div>`, { title: 'Crear' });
    s.el.addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; s.close(); setTimeout(() => (b.dataset.t === 'checkin' ? actions.checkin() : openCompose(b.dataset.t)), 240); });
    return;
  }
  if (type === 'post') return postForm_();
  if (type === 'story') return storyForm();
  if (type === 'pr') return prForm();
  if (type === 'workout') return workoutForm();
  if (type === 'progress') return progressForm();
}
actions.compose = (el) => openCompose(el?.dataset?.type || '');

// ---------------------------------------------------------------- publicación
let tagged = [];
function postForm_() {
  tagged = [];
  const s = sheet(`<form class="form" data-form="newPost">
    <div class="compose-top">${avatar(state.user, 40)}<textarea name="text" rows="3" maxlength="2000" placeholder="¿Cómo estuvo tu entrenamiento hoy?" autofocus></textarea></div>
    ${picker('media', 'Añadir foto o video')}
    <label class="inl">${ico('pin', 18)}<input name="location" maxlength="80" placeholder="Ubicación (opcional)"></label>
    <div class="tag-box"><label class="inl">${ico('at', 18)}<input id="tag-q" placeholder="Etiquetar a alguien" autocomplete="off"></label><div id="tag-res" class="tag-res"></div><div id="tag-list" class="tag-list"></div></div>
    <label>Visibilidad<select name="visibility"><option value="all">Todo el gimnasio</option><option value="followers">Solo mis seguidores</option></select></label>
    <button class="btn block lg" type="submit">Publicar</button></form>`, { title: 'Nueva publicación', full: true });
  let t; $('#tag-q', s.el).addEventListener('input', (e) => {
    clearTimeout(t); const v = e.target.value.trim(); if (!v) { $('#tag-res', s.el).innerHTML = ''; return; }
    t = setTimeout(async () => { const u = (await api('users?q=' + encodeURIComponent(v))).filter((x) => x.id !== state.user.id && !tagged.some((y) => y.id === x.id)).slice(0, 5);
      $('#tag-res', s.el).innerHTML = u.map((x) => `<button type="button" class="person sm" data-tag="${x.id}" data-name="${esc(x.username)}">${avatar(x, 28)}<b>${esc(x.name)}</b><small>@${esc(x.username)}</small></button>`).join(''); }, 180);
  });
  s.el.addEventListener('click', (e) => {
    const b = e.target.closest('[data-tag]'); if (b) { tagged.push({ id: +b.dataset.tag, username: b.dataset.name }); $('#tag-q', s.el).value = ''; $('#tag-res', s.el).innerHTML = ''; drawTags(s.el); }
    const r = e.target.closest('[data-untag]'); if (r) { tagged = tagged.filter((x) => x.id !== +r.dataset.untag); drawTags(s.el); }
  });
}
const drawTags = (root) => { $('#tag-list', root).innerHTML = tagged.map((t) => `<span class="chip orange">@${esc(t.username)} <button type="button" data-untag="${t.id}" aria-label="Quitar">${ico('x', 12)}</button></span>`).join(''); };
forms.newPost = async (f) => {
  const fd = new FormData(f); await prepare(fd, 'media'); fd.set('tags', tagged.map((t) => t.id).join(','));
  if (!fd.get('text').trim() && !fd.get('media')) throw new Error('Escribe algo o adjunta una foto o video');
  await postForm('posts', fd); closeAll(); toast('¡Publicado!', 'ok'); go('#/'); render();
};

// ---------------------------------------------------------------- historia
function storyForm() {
  const kinds = isStaff() ? `<label>Tipo de historia<select name="kind"><option value="normal">Mi historia</option><option value="gym">Historia del gimnasio</option><option value="event">Evento</option><option value="challenge">Reto</option><option value="pr">PR</option></select></label>`
    : `<label>Tipo<select name="kind"><option value="normal">Historia normal</option><option value="pr">Historia de PR</option></select></label>`;
  sheet(`<form class="form" data-form="newStory">${picker('media', 'Elige tu foto o video')}${kinds}
    <label>Texto (opcional)<input name="caption" maxlength="200" placeholder="Escribe algo…"></label>
    <label>Guardar en destacadas (opcional)<input name="highlight" maxlength="30" placeholder="Ej. Retos, Entrenos"></label>
    <p class="muted sm">Se verá durante 24 horas. Podrás ver quién la vio.</p><button class="btn block lg" type="submit">Compartir historia</button></form>`, { title: 'Nueva historia', full: true });
}
forms.newStory = async (f) => {
  const fd = new FormData(f); await prepare(fd, 'media'); if (!fd.get('media')) throw new Error('Elige una foto o video');
  await postForm('stories', fd); closeAll(); toast('Historia publicada', 'ok'); render();
};

// ---------------------------------------------------------------- PR
async function prForm() {
  const ex = await api('pr-exercises');
  sheet(`<form class="form" data-form="newPr"><label>Ejercicio<select name="exercise_id">${ex.map((e) => `<option value="${e.id}">${esc(e.name)}</option>`).join('')}</select></label>
    <div class="grid2"><label>Peso (kg)<input name="value" type="number" inputmode="decimal" step="0.5" min="1" required placeholder="Ej. 140"></label><label>Repeticiones<input name="reps" type="number" min="1" value="1"></label></div>
    ${picker('video', 'Video de evidencia', 'video/*,image/*', 'video')}
    <label>Nota (opcional)<input name="note" maxlength="300" placeholder="Cómo se sintió, equipo usado…"></label>
    <p class="muted sm">Tu PR quedará <b>pendiente</b> hasta que tu entrenador o la administración lo validen. Al aprobarse ganas puntos y se publica en el feed.</p>
    <button class="btn block lg" type="submit">Enviar PR</button></form>`, { title: 'Nuevo PR', full: true });
}
forms.newPr = async (f) => {
  const fd = new FormData(f); if (!fd.get('video')?.size) fd.delete('video');
  await postForm('prs', fd); closeAll(); toast('PR enviado: pendiente de validación', 'ok'); render();
};

// ---------------------------------------------------------------- entrenamiento
const rowHtml = (v = {}) => `<div class="set-row"><input name="ex" placeholder="Ejercicio" maxlength="60" list="ex-list" required value="${esc(v.exercise || '')}"><input name="sets" type="number" inputmode="numeric" min="1" value="${v.sets || 3}" aria-label="Series"><input name="reps" type="number" inputmode="numeric" min="1" value="${v.reps || 10}" aria-label="Repeticiones"><input name="kg" type="number" inputmode="decimal" step="0.5" min="0" placeholder="kg" aria-label="Peso"><button type="button" class="icon-btn sm" data-act="rmSet" aria-label="Quitar">${ico('x', 16)}</button></div>`;
let pendingRoutine = null;
export function openWorkout(pre) { pendingRoutine = pre?.routine || null; workoutForm(pre); }
function workoutForm(pre = null) {
  if (!pre) pendingRoutine = null;
  sheet(`<form class="form" data-form="newWorkout">${pre ? '' : '<a class="btn sm ghost block" href="#/rutinas" data-act="closeSheets">¿No sabes qué entrenar? Ver rutinas sugeridas</a>'}
    <div class="grid2"><label>Título<input name="title" maxlength="60" value="${esc(pre?.title || 'Entrenamiento')}" required></label><label>Fecha<input name="date" type="date" value="${todayStr()}" max="${todayStr()}" required></label></div>
    <div class="set-head"><span>Ejercicio</span><span>Series</span><span>Reps</span><span>Peso</span><span></span></div>
    <div id="sets">${pre?.sets?.length ? pre.sets.map((x) => rowHtml(x)).join('') : rowHtml() + rowHtml()}</div>
    <datalist id="ex-list">${['Sentadilla', 'Press banca', 'Peso muerto', 'Press militar', 'Remo con barra', 'Dominadas', 'Prensa de pierna', 'Fondos', 'Curl de bíceps', 'Hip thrust', 'Zancadas'].map((x) => `<option value="${x}">`).join('')}</datalist>
    <button type="button" class="btn ghost block" data-act="addSet">${ico('plus', 16)} Añadir ejercicio</button>
    <label>Notas<textarea name="notes" rows="2" maxlength="500" placeholder="¿Cómo te sentiste?"></textarea></label>
    <label class="check"><input type="checkbox" name="publish"><span>Publicar en el feed</span></label>
    <button class="btn block lg" type="submit">Guardar entrenamiento</button></form>`, { title: 'Registrar entrenamiento', full: true });
}
actions.addSet = () => $('#sets').insertAdjacentHTML('beforeend', rowHtml());
actions.rmSet = (el) => { if ($$('#sets .set-row').length > 1) el.closest('.set-row').remove(); };
forms.newWorkout = async (f) => {
  const sets = $$('#sets .set-row').map((r) => ({ exercise: $('[name=ex]', r).value, sets: +$('[name=sets]', r).value, reps: +$('[name=reps]', r).value, weight: +$('[name=kg]', r).value || 0 })).filter((s) => s.exercise.trim());
  const r = await api('workouts', { method: 'POST', body: { title: f.title.value, date: f.date.value, notes: f.notes.value, publish: f.publish.checked, sets } });
  if (pendingRoutine) { try { await api(`routines/${pendingRoutine}/advance`, { method: 'POST' }); } catch {} pendingRoutine = null; }
  closeAll(); toast(r.points ? `Entrenamiento guardado · +${r.points} pts` : 'Entrenamiento guardado', 'ok'); render();
};

// ---------------------------------------------------------------- progreso
function progressForm() {
  sheet(`<form class="form" data-form="newProgress"><div class="grid2"><label>Peso corporal (kg)<input name="weight" type="number" inputmode="decimal" step="0.1" min="30" max="300" value="${state.user.weight ?? ''}"></label>
    <label>Fecha<input name="date" type="date" value="${todayStr()}" max="${todayStr()}"></label></div>
    ${picker('photo', 'Foto de progreso', 'image/*', 'camera')}
    <label>Nota<textarea name="note" rows="2" maxlength="300" placeholder="¿Cómo vas?"></textarea></label>
    <label class="check"><input type="checkbox" name="publish" value="1"><span>Publicar en el feed</span></label>
    <button class="btn block lg" type="submit">Guardar progreso</button></form>`, { title: 'Registrar progreso', full: true });
}
forms.newProgress = async (f) => {
  const fd = new FormData(f); await prepare(fd, 'photo'); if (!f.publish.checked) fd.delete('publish');
  await postForm('progress', fd); closeAll(); toast('Progreso guardado', 'ok'); render();
};
