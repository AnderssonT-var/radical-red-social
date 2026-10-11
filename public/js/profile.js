// Perfil de usuario: cabecera, destacadas, insignias y pestañas (publicaciones, PRs, logros, progreso)
import { $, $$, esc, api, postForm, state, ico, avatar, ago, empty, toast, sheet, menuSheet, actions, forms, route, go, render, isStaff, num, chip, roleTag, dateShort, dateLong, formObj, AWARD, linkify, mediaTag, confirmBox } from './core.js';
import { openStoryGroups, shareSheet, postCard } from './feed.js';

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
let P = null; let tab = 'posts'; let allBadges = [];
const isMe = () => P && P.id === state.user.id;

// ---------------------------------------------------------------- vistas
route('/perfil', async (el) => { await showProfile(el, state.user.id); }, { name: 'profile' });
route('/u/(\\d+)', async (el, id) => { await showProfile(el, +id); }, { name: 'profile' });

async function showProfile(el, id) {
  const [p, hl] = await Promise.all([api('users/' + id), api(`users/${id}/highlights`).catch(() => [])]);
  P = p; tab = 'posts'; if (!allBadges.length) allBadges = await api('badges').catch(() => []);
  const me = isMe(); const st = p.streak;
  const info = [p.discipline && ['dumbbell', p.discipline], p.goal && ['flag', p.goal], p.weight && ['trend', `${p.weight} kg${p.wcat ? ' · ' + p.wcat : ''}`], p.age && ['user', `${p.age} años`],
    p.gender && ['users', p.gender === 'M' ? 'Hombre' : 'Mujer'], p.coach && ['shield', `Coach: ${p.coach.name}`]].filter(Boolean);
  el.innerHTML = `<div class="profile">
    <div class="page-head tight">${me ? '<span></span>' : `<button class="icon-btn" data-act="back" aria-label="Volver">${ico('back', 24)}</button>`}<h2>@${esc(p.username)}</h2>
      <button class="icon-btn" data-act="profileMenu" aria-label="Opciones">${ico(me ? 'sliders' : 'more', 24)}</button></div>
    <div class="ph">
      <div class="ph-av">${avatar(p, 92)}</div>
      <div class="ph-stats"><button data-act="noop"><b>${num(p.posts)}</b><small>publicaciones</small></button>
        <button data-act="people" data-which="followers"><b id="n-followers">${num(p.followers)}</b><small>seguidores</small></button>
        <button data-act="people" data-which="following"><b>${num(p.following)}</b><small>seguidos</small></button></div></div>
    <div class="ph-info"><div class="ph-name"><b>${esc(p.name)}</b>${roleTag(p.role)}${p.status === 'pending' ? chip('Pendiente', 'amber sm') : p.status === 'blocked' ? chip('Bloqueado', 'red sm') : ''}</div>
      ${p.bio ? `<p class="ph-bio">${linkify(p.bio)}</p>` : ''}
      <div class="info-chips">${info.map(([i, t]) => `<span class="info">${ico(i, 13)} ${esc(t)}</span>`).join('')}</div></div>
    <div class="ph-btns">${me ? `<button class="btn grow ghost" data-act="editProfile">Editar perfil</button><button class="btn grow ghost" data-act="shareMe">Compartir perfil</button>`
      : `<button class="btn grow ${p.isFollowing ? 'ghost' : ''}" data-act="followMain" data-id="${p.id}">${p.isFollowing ? 'Siguiendo' : 'Seguir'}</button><a class="btn grow ghost" href="#/mensajes/${p.id}">Mensaje</a>`}</div>
    <div class="stat-row">
      <div class="stat">${ico('flame', 20)}<b>${st.current}</b><small>${st.current === 1 ? 'semana' : 'semanas'} de racha</small></div>
      <div class="stat">${ico('star', 20)}<b>${num(p.season_points)}</b><small>puntos RADICAL</small></div>
      <div class="stat">${ico('trophy', 20)}<b>${p.season_position ? '#' + p.season_position : '–'}</b><small>en el ranking</small></div></div>
    ${hl.length ? `<div class="highlights scroller">${hl.map((h, i) => `<button class="hl" data-act="openHl" data-i="${i}"><span class="ring seen">${h.stories[0].media_type === 'image' ? `<img src="${esc(h.stories[0].media)}" alt="">` : `<span class="hl-ic">${ico('star', 24)}</span>`}</span><small>${esc(h.name)}</small></button>`).join('')}</div>` : ''}
    ${p.badges.length ? `<div class="badge-strip scroller">${p.badges.map((b) => `<button class="bdg" data-act="badgeInfo" data-code="${esc(b.code)}" title="${esc(b.name)}"><i>${b.icon}</i><small>${esc(b.name)}</small></button>`).join('')}</div>` : ''}
    <div class="ptabs" id="ptabs">${[['posts', 'grid', 'Publicaciones'], ['prs', 'trophy', 'PRs'], ['ach', 'star', 'Logros'], ['prog', 'trend', 'Progreso']].map(([k, i, l]) => `<button class="ptab ${k === 'posts' ? 'on' : ''}" data-act="ptab" data-v="${k}" aria-label="${l}">${ico(i, 22)}<small>${l}</small></button>`).join('')}</div>
    <div id="ptab-body"></div></div>`;
  window.__hl = hl;
  await renderTab();
}
actions.noop = () => {};
actions.ptab = async (el) => { tab = el.dataset.v; $$('#ptabs .ptab').forEach((b) => b.classList.toggle('on', b === el)); await renderTab(); };

async function renderTab() {
  const box = $('#ptab-body'); if (!box) return; box.innerHTML = '<div class="loading"><div class="spin"></div></div>';
  if (tab === 'posts') await tabPosts(box); if (tab === 'prs') await tabPrs(box); if (tab === 'ach') await tabAch(box); if (tab === 'prog') await tabProg(box);
}

// ---------------------------------------------------------------- publicaciones
function tile(p) {
  const k = p.kind; const m = p.meta || {};
  let inner;
  if (p.media && p.media_type === 'video') inner = `<video src="${esc(p.media)}#t=0.1" preload="metadata" muted playsinline></video><i class="t-ic">${ico('play', 16)}</i>`;
  else if (p.media) inner = `<img src="${esc(p.media)}" alt="" loading="lazy">`;
  else inner = `<div class="t-text k-${k}">${ico(k === 'pr' ? 'trophy' : k === 'streak' ? 'flame' : k === 'workout' ? 'dumbbell' : 'comment', 26)}<span>${esc((m.exercise ? `${m.exercise} ${m.value}${m.unit || ''}` : p.text).slice(0, 70))}</span></div>`;
  return `<a class="tile" href="#/post/${p.id}">${inner}</a>`;
}
async function tabPosts(box) {
  const posts = await api(`users/${P.id}/posts`);
  box.innerHTML = posts.length ? `<div class="grid3">${posts.map(tile).join('')}</div>` : empty('image', isMe() ? 'Aún no has publicado' : 'Sin publicaciones', isMe() ? 'Toca Publicar y comparte tu entrenamiento' : '');
}

// ---------------------------------------------------------------- PRs
const STATUS = { pending: '<span class="chip amber sm">Por validar</span>', rejected: '<span class="chip red sm">Rechazado</span>', approved: '' };
async function tabPrs(box) {
  const list = await api('prs/' + P.id);
  const best = Object.fromEntries(P.prs.map((x) => [x.code, x.value || 0]));
  const total = (best.squat || 0) + (best.bench || 0) + (best.deadlift || 0);
  box.innerHTML = `${isMe() ? `<button class="btn block" data-act="compose" data-type="pr">${ico('plus', 18)} Registrar nuevo PR</button>` : ''}
    ${total ? `<div class="card total-card"><small>TOTAL (SENTADILLA + BANCA + PESO MUERTO)</small><b>${num(total)} <span>kg</span></b>${P.weight ? `<small>${(total / P.weight).toFixed(1)}× su peso corporal</small>` : ''}</div>` : ''}
    <div class="pr-grid">${P.prs.map((x) => `<div class="pr-box ${x.value ? '' : 'nil'}"><small>${esc(x.name)}</small><b>${x.value ? num(x.value) : '–'}</b><span>${x.value ? esc(x.unit) : 'sin registro'}</span></div>`).join('')}</div>
    <h4 class="blk-h">Historial</h4>
    ${list.length ? `<div class="card list-card">${list.map((x) => `<div class="act pr-row"><span class="pr-ic">${ico('trophy', 16)}</span><div class="grow"><b>${esc(x.exercise)}</b><small class="muted">${dateShort(x.created_at)}${x.reps > 1 ? ` · ${x.reps} reps` : ''}${x.note ? ' · ' + esc(x.note) : ''}</small></div>${STATUS[x.status] || ''}<b class="orange">${num(x.value)} ${esc(x.unit)}</b></div>`).join('')}</div>` : empty('trophy', 'Sin PRs registrados', isMe() ? 'Registra tu primer récord y gana puntos al validarse' : '')}`;
}

// ---------------------------------------------------------------- logros
async function tabAch(box) {
  const st = P.streak; const have = new Set(P.badges.map((b) => b.code));
  box.innerHTML = `<div class="card streak-card"><div class="sc-top"><div><small class="muted">SEMANA ACTUAL</small><h3>${st.thisWeek.trained} de ${st.goal} entrenamientos</h3></div>
      <div class="sc-num">${ico('flame', 20)}<b>${st.current}</b><small>semanas</small></div></div>
      <div class="week">${st.thisWeek.days.map((d, i) => `<div class="wd ${d.trained ? 'on' : ''} ${d.today ? 'today' : ''}"><small>${DAYS[i]}</small><i>${d.trained ? ico('check', 14) : '·'}</i></div>`).join('')}</div>
      <div class="sc-foot"><span class="muted">Mejor racha histórica: <b>${st.best}</b> sem · <b>${st.totalWorkouts}</b> días entrenados</span></div></div>
    ${P.awards.length ? `<h4 class="blk-h">Trofeos de temporada</h4><div class="awards">${P.awards.map((a) => `<div class="award">${ico('trophy', 18)}<div><small>${esc(a.season)}</small><b>${esc(AWARD[a.award] || a.award)}</b></div></div>`).join('')}</div>` : ''}
    <h4 class="blk-h">Insignias <span class="muted sm">${P.badges.length} de ${allBadges.length}</span></h4>
    <div class="badge-grid">${allBadges.map((b) => { const got = P.badges.find((x) => x.code === b.code); return `<button class="bdg-card ${got ? 'on' : ''}" data-act="badgeInfo" data-code="${esc(b.code)}"><i>${b.icon}</i><b>${esc(b.name)}</b><small>${got ? dateShort(got.created_at) : 'Bloqueada'}</small></button>`; }).join('')}</div>`;
}
actions.badgeInfo = (el) => {
  const b = allBadges.find((x) => x.code === el.dataset.code); if (!b) return; const got = P?.badges.find((x) => x.code === b.code);
  sheet(`<div class="badge-big"><i class="${got ? '' : 'lock'}">${b.icon}</i><h3>${esc(b.name)}</h3><p>${esc(b.description)}</p>${got ? `<span class="chip green">${ico('check', 12)} Conseguida el ${dateLong(got.created_at)}</span>` : '<span class="chip">Aún por desbloquear</span>'}</div>`, { title: null, cls: 'small' });
};

// ---------------------------------------------------------------- progreso
function weightChart(rows) {
  const pts = rows.filter((r) => r.weight != null).reverse(); // cronológico
  if (pts.length < 2) return pts.length ? `<div class="card chart-card"><small class="muted">PESO CORPORAL</small><b class="big-n">${pts[0].weight} kg</b><p class="muted sm">Registra más semanas para ver tu evolución.</p></div>` : '';
  const W = 320, H = 130, pad = 10; const vals = pts.map((p) => p.weight); const mn = Math.min(...vals) - 0.5, mx = Math.max(...vals) + 0.5;
  const x = (i) => pad + (i / (pts.length - 1)) * (W - pad * 2), y = (v) => H - pad - ((v - mn) / (mx - mn)) * (H - pad * 2);
  const line = pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.weight).toFixed(1)}`).join(' ');
  const diff = (vals[vals.length - 1] - vals[0]).toFixed(1);
  return `<div class="card chart-card"><div class="row between"><div><small class="muted">PESO CORPORAL</small><b class="big-n">${vals[vals.length - 1]} kg</b></div><span class="chip ${diff > 0 ? 'orange' : 'green'}">${diff > 0 ? '+' : ''}${diff} kg</span></div>
    <svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="Evolución del peso"><defs><linearGradient id="wg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a1f" stop-opacity=".35"/><stop offset="1" stop-color="#ff5a1f" stop-opacity="0"/></linearGradient></defs>
    <path d="${line} L${x(pts.length - 1)},${H} L${x(0)},${H} Z" fill="url(#wg)"/><path d="${line}" fill="none" stroke="#ff5a1f" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>
    ${pts.map((p, i) => `<circle cx="${x(i)}" cy="${y(p.weight)}" r="${i === pts.length - 1 ? 5 : 3}" fill="${i === pts.length - 1 ? '#ff5a1f' : '#0b0b0d'}" stroke="#ff5a1f" stroke-width="2"/>`).join('')}</svg>
    <div class="row between muted sm"><span>${dateShort(pts[0].date + ' 12:00:00')}</span><span>${dateShort(pts[pts.length - 1].date + ' 12:00:00')}</span></div></div>`;
}
async function tabProg(box) {
  const [rows, wos] = await Promise.all([api('progress/' + P.id), api('workouts?user=' + P.id)]);
  box.innerHTML = `${isMe() ? `<div class="row gap"><button class="btn grow" data-act="compose" data-type="progress">${ico('trend', 18)} Registrar progreso</button><button class="btn grow ghost" data-act="compose" data-type="workout">${ico('dumbbell', 18)} Entrenamiento</button></div>` : ''}
    ${weightChart(rows)}
    ${rows.some((r) => r.photo) ? `<h4 class="blk-h">Fotos de progreso</h4><div class="grid3">${rows.filter((r) => r.photo).map((r) => `<a class="tile" href="${esc(r.photo)}" target="_blank" rel="noopener"><img src="${esc(r.photo)}" alt="" loading="lazy"><i class="t-date">${dateShort(r.date + ' 12:00:00')}</i></a>`).join('')}</div>` : ''}
    <h4 class="blk-h">Entrenamientos recientes</h4>
    ${wos.length ? wos.slice(0, 12).map((w) => `<div class="card wo-card"><div class="row between"><div><b>${esc(w.title)}</b><small class="muted"> · ${dateShort(w.date + ' 12:00:00')}</small></div>${isMe() ? `<button class="icon-btn sm" data-act="delWorkout" data-id="${w.id}" aria-label="Eliminar">${ico('trash', 16)}</button>` : ''}</div>
      ${w.sets.map((s) => `<div class="wo-row"><span>${esc(s.exercise)}</span><b>${s.sets}×${s.reps}${s.weight ? ` · ${s.weight} kg` : ''}</b></div>`).join('')}${w.notes ? `<p class="muted sm">${esc(w.notes)}</p>` : ''}</div>`).join('')
      : empty('dumbbell', 'Sin entrenamientos registrados', isMe() ? 'Registra tus series, repeticiones y pesos' : '')}`;
}
actions.delWorkout = async (el) => { if (!(await confirmBox('¿Eliminar este entrenamiento?', 'Eliminar', true))) return; await api('workouts/' + el.dataset.id, { method: 'DELETE' }); toast('Entrenamiento eliminado'); await renderTab(); };

// ---------------------------------------------------------------- acciones
actions.openHl = (el) => { const h = window.__hl[+el.dataset.i]; openStoryGroups([{ key: 'hl', user: { id: P.id, name: P.name, username: P.username, avatar: P.avatar }, stories: h.stories, seen: true, mine: isMe() }], 0); };
actions.followMain = async (el) => {
  const r = await api(`users/${el.dataset.id}/follow`, { method: 'POST' });
  el.textContent = r.following ? 'Siguiendo' : 'Seguir'; el.classList.toggle('ghost', r.following); $('#n-followers').textContent = num(r.followers); P.isFollowing = r.following;
};
actions.shareMe = () => shareSheet('profile', P.id);
actions.people = async (el) => {
  const which = el.dataset.which; const list = await api(`users/${P.id}/people/${which}`);
  const myF = new Set((await api(`users/${state.user.id}/people/following`)).map((u) => u.id));
  const s = sheet(list.length ? `<div class="people">${list.map((u) => `<div class="person"><a href="#/u/${u.id}" data-close>${avatar(u, 44)}</a><a href="#/u/${u.id}" data-close class="grow"><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></a>${u.id === state.user.id ? '' : `<button class="btn sm ${myF.has(u.id) ? 'ghost' : ''}" data-act="follow" data-id="${u.id}">${myF.has(u.id) ? 'Siguiendo' : 'Seguir'}</button>`}</div>`).join('')}</div>` : empty('users', which === 'followers' ? 'Aún sin seguidores' : 'No sigue a nadie todavía'), { title: which === 'followers' ? 'Seguidores' : 'Seguidos', cls: 'tall' });
  s.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) s.close(); });
};
actions.profileMenu = () => {
  const items = [];
  if (isMe()) {
    items.push({ label: 'Editar perfil', icon: 'edit', run: () => actions.editProfile() }, { label: 'Guardados', icon: 'bookmark', run: () => go('#/guardados') }, { label: 'Temporadas y campeones', icon: 'trophy', run: () => go('#/temporadas') },
      { label: 'Cambiar contraseña', icon: 'lock', run: changePassword });
    if (isStaff()) items.push({ label: 'Panel de administración', icon: 'shield', run: () => go('#/admin') });
    else if (state.user.role === 'coach') items.push({ label: 'Validar PRs de mis alumnos', icon: 'shield', run: () => go('#/admin/prs') });
    items.push({ label: 'Instalar la app', icon: 'download', run: () => import('./main.js').then((m) => m.installHelp()) }, { label: 'Cerrar sesión', icon: 'logout', danger: true, run: () => actions.logout() });
  } else {
    items.push({ label: 'Compartir perfil', icon: 'send', run: () => shareSheet('profile', P.id) }, { label: 'Copiar enlace', icon: 'link', run: () => { navigator.clipboard?.writeText(`${location.origin}/#/u/${P.id}`); toast('Enlace copiado'); } },
      { label: 'Reportar perfil', icon: 'flag', danger: true, run: async () => { const reason = prompt('¿Por qué reportas este perfil?'); if (reason) { await api('reports', { method: 'POST', body: { type: 'user', id: P.id, reason } }); toast('Reporte enviado'); } } });
    if (isStaff()) items.push({ label: 'Administrar usuario', icon: 'shield', run: () => go('#/admin/usuarios') });
  }
  menuSheet(items);
};
function changePassword() {
  sheet(`<form class="form" data-form="pw"><label>Contraseña actual<input type="password" name="current" autocomplete="current-password" required></label><label>Nueva contraseña (mín. 8)<input type="password" name="next" minlength="8" autocomplete="new-password" required></label><button class="btn block lg" type="submit">Actualizar</button></form>`, { title: 'Cambiar contraseña' });
}
forms.pw = async (f) => { await api('me/password', { method: 'PUT', body: formObj(f) }); closeAll(); toast('Contraseña actualizada', 'ok'); };
const closeAll = () => { $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll'); };

actions.editProfile = () => {
  const u = P && isMe() ? P : state.user;
  sheet(`<form class="form" data-form="editProfile">
    <div class="edit-av"><span id="edit-av-prev">${avatar(state.user, 84)}</span><label class="btn sm ghost">${ico('camera', 16)} Cambiar foto<input type="file" name="avatar" accept="image/*" hidden id="edit-av-in"></label></div>
    <label>Nombre<input name="name" value="${esc(u.name)}" maxlength="60" required></label>
    <label>Usuario<input name="username" value="${esc(u.username)}" pattern="[a-zA-Z0-9_.]{3,20}" required></label>
    <label>Biografía<textarea name="bio" rows="3" maxlength="220">${esc(u.bio || '')}</textarea></label>
    <div class="grid2"><label>Género<select name="gender"><option value="" ${!u.gender ? 'selected' : ''}>—</option><option value="M" ${u.gender === 'M' ? 'selected' : ''}>Hombre</option><option value="F" ${u.gender === 'F' ? 'selected' : ''}>Mujer</option></select></label>
      <label>Edad (opcional)<input name="age" type="number" min="12" max="99" value="${u.age ?? ''}"></label></div>
    <div class="grid2"><label>Peso corporal (kg)<input name="weight" type="number" step="0.1" min="30" max="300" value="${u.weight ?? ''}"></label>
      <label>Meta semanal (días)<select name="weekly_goal">${[1, 2, 3, 4, 5, 6, 7].map((n) => `<option ${n === (u.weekly_goal || 4) ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    <label>WhatsApp / teléfono (para pedidos de la tienda)<input name="phone" inputmode="tel" maxlength="20" value="${esc(u.phone || '')}" placeholder="Ej. 0991234567"></label>
    <label>Objetivo<input name="goal" value="${esc(u.goal || '')}" maxlength="80" placeholder="Ej. Ganar fuerza"></label>
    <label>Disciplina principal<input name="discipline" value="${esc(u.discipline || '')}" maxlength="40" placeholder="Ej. Powerlifting, CrossFit…"></label>
    <button class="btn block lg" type="submit">Guardar cambios</button></form>`, { title: 'Editar perfil', full: true });
  $('#edit-av-in').addEventListener('change', (e) => { const f = e.target.files[0]; if (f) $('#edit-av-prev').innerHTML = `<span class="av" style="--s:84px"><img src="${URL.createObjectURL(f)}" alt=""></span>`; });
};
forms.editProfile = async (f) => {
  const fd = new FormData(f); if (!fd.get('avatar')?.size) fd.delete('avatar');
  const r = await postForm('me', fd, 'PUT'); state.user = r.user; window.dispatchEvent(new Event('me')); closeAll(); toast('Perfil actualizado', 'ok'); render();
};
