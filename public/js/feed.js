import { $, $$, esc, api, state, ico, avatar, ago, hhmm, linkify, mediaTag, roleTag, empty, toast, sheet, menuSheet, confirmBox, actions, forms, route, go, render, isStaff, num, countdown, TYPE_NAME, ANN, fmtResult, formObj, dateLong, chip, onCleanup, refreshCounters } from './core.js';

const DAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
let storyGroups = [];
const KIND = { pr: ['trophy', 'Nuevo PR'], streak: ['flame', 'Racha'], challenge: ['bolt', 'Reto'], result: ['trophy', 'Resultados'], progress: ['trend', 'Progreso'], workout: ['dumbbell', 'Entrenamiento'], gym: ['megaphone', 'RADICAL'] };

// =============================================================== Historias (barra)
export function storiesBar(groups) {
  storyGroups = groups;
  const mineIdx = groups.findIndex((g) => g.mine);
  const me = state.user;
  const mine = `<button class="story ${mineIdx >= 0 ? (groups[mineIdx].seen ? 'seen' : '') : 'add'}" data-act="${mineIdx >= 0 ? 'story' : 'compose'}" data-i="${mineIdx}" data-type="story">
    <span class="ring">${avatar(me, 62)}<i class="plus">${ico('plus', 14)}</i></span><small>Tu historia</small></button>`;
  const others = groups.map((g, i) => g.mine ? '' : `<button class="story ${g.seen ? 'seen' : ''}" data-act="story" data-i="${i}">
    <span class="ring">${avatar(g.user, 62)}${g.stories.some((s) => s.kind === 'pr') ? `<i class="badge-pr">${ico('trophy', 11)}</i>` : ''}</span><small>${esc(g.user.gym ? 'RADICAL' : g.user.name.split(' ')[0])}</small></button>`).join('');
  return `<div class="stories scroller">${mine}${others}</div>`;
}
actions.story = (el) => openStories(storyGroups, +el.dataset.i);
export function openStoryGroups(groups, i = 0) { storyGroups = groups; openStories(groups, i); }

const KIND_LABEL = { pr: 'PR', challenge: 'Reto', event: 'Evento', gym: 'Gimnasio' };
export function openStories(groups, gi = 0, si = 0) {
  if (!groups[gi]) return;
  const root = document.createElement('div'); root.className = 'story-view'; document.body.appendChild(root); document.body.classList.add('noscroll');
  let raf, elapsed = 0, last = 0, dur = 5500, paused = false, vid = null, down = 0, closed = false;
  const close = () => { closed = true; cancelAnimationFrame(raf); root.classList.remove('in'); setTimeout(() => { root.remove(); if (!$('.sheet-wrap')) document.body.classList.remove('noscroll'); }, 180); window.removeEventListener('keydown', key); $$('.story', document).forEach(() => {}); if (location.hash === '#/' || location.hash === '') render(); };
  const key = (e) => { if (e.key === 'Escape') close(); if (e.key === 'ArrowRight') next(); if (e.key === 'ArrowLeft') prev(); };
  window.addEventListener('keydown', key);
  function next() { const g = groups[gi]; if (si < g.stories.length - 1) { si++; show(); } else if (gi < groups.length - 1) { gi++; si = 0; show(); } else close(); }
  function prev() { if (si > 0) { si--; show(); } else if (gi > 0) { gi--; si = 0; show(); } else { elapsed = 0; if (vid) vid.currentTime = 0; } }
  function cardHtml(s) {
    const c = s.card || {}; const k = c.kind || s.kind;
    return `<div class="story-card k-${esc(k)}">${ico(k === 'pr' ? 'trophy' : k === 'challenge' || k === 'result' ? 'bolt' : 'megaphone', 56)}
      <small>${esc({ pr: 'NUEVO PR', challenge: 'RETO DE LA SEMANA', result: 'RESULTADOS', event: 'EVENTO' }[k] || 'RADICAL')}</small><h2>${esc(c.title || s.caption || '')}</h2>
      ${c.value ? `<div class="big">${esc(c.value)}</div>` : ''}${c.body ? `<p>${esc(c.body)}</p>` : ''}</div>`;
  }
  function show() {
    cancelAnimationFrame(raf); const g = groups[gi], s = g.stories[si]; elapsed = 0; paused = false; last = performance.now(); vid = null;
    if (!s.mine && !s.announcement && typeof s.id === 'number') { api('stories/' + s.id + '/view', { method: 'POST' }).catch(() => {}); } s.seen = true;
    g.seen = g.stories.every((x) => x.seen);
    const media = s.media_type === 'video' ? `<video class="sv-media" src="${esc(s.media)}" playsinline autoplay></video>`
      : s.media_type === 'image' ? `<img class="sv-media" src="${esc(s.media)}" alt="">` : cardHtml(s);
    const own = s.mine || isStaff();
    root.innerHTML = `<div class="sv-stage">
      <div class="sv-bars">${g.stories.map((_, i) => `<i class="${i < si ? 'done' : ''}"><b></b></i>`).join('')}</div>
      <div class="sv-head"><a href="${g.user.gym ? '#/' : '#/u/' + g.user.id}" class="sv-user">${avatar(g.user, 36)}<b>${esc(g.user.gym ? 'RADICAL' : g.user.username)}</b><span>${ago(s.created_at)}</span>${KIND_LABEL[s.kind] ? chip(KIND_LABEL[s.kind], 'orange sm') : ''}</a>
        <button class="sv-x" data-sv="close" aria-label="Cerrar">${ico('x', 26)}</button></div>
      ${media}${s.caption && s.media_type !== 'card' ? `<div class="sv-caption">${esc(s.caption)}</div>` : ''}
      <div class="sv-zones"><i data-sv="prev"></i><i data-sv="next"></i></div>
      <div class="sv-foot">${s.mine ? `<button class="sv-views" data-sv="viewers">${ico('eye', 18)} ${s.views || 0} ${s.views === 1 ? 'vista' : 'vistas'}</button><div class="row gap"><button class="sv-ic" data-sv="highlight" title="Destacar">${ico('star', 20)}</button><button class="sv-ic" data-sv="delete" title="Eliminar">${ico('trash', 20)}</button></div>`
        : g.user.gym || s.announcement ? (isStaff() && typeof s.id === 'number' ? `<button class="sv-ic" data-sv="delete">${ico('trash', 20)}</button>` : '<span></span>')
        : `<form class="sv-reply" data-sv-form><input name="text" placeholder="Responder a ${esc(g.user.name.split(' ')[0])}…" autocomplete="off" maxlength="300"><button aria-label="Enviar">${ico('send', 20)}</button></form>`}</div></div>`;
    window.dispatchEvent(new Event('counters'));
    requestAnimationFrame(() => root.classList.add('in'));
    const fills = $$('.sv-bars i b', root); vid = $('video', root);
    if (vid) { vid.play().catch(() => { vid.muted = true; vid.play().catch(() => {}); }); }
    const tick = (now) => {
      if (closed) return; if (!paused) elapsed += now - last; last = now;
      let pct = elapsed / dur;
      if (vid && vid.duration) pct = vid.currentTime / vid.duration; else if (vid) pct = 0;
      fills[si].style.width = Math.min(100, pct * 100) + '%';
      if (vid && vid.ended) return next();
      if (!vid && pct >= 1) return next();
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
  }
  const hold = (p) => { paused = p; if (vid) p ? vid.pause() : vid.play().catch(() => {}); };
  root.addEventListener('pointerdown', (e) => { if (e.target.closest('.sv-zones')) { down = Date.now(); hold(true); } });
  root.addEventListener('pointerup', (e) => { if (e.target.closest('.sv-zones')) { hold(false); if (Date.now() - down < 260) (e.target.dataset.sv === 'prev' ? prev : next)(); } });
  root.addEventListener('pointerleave', () => hold(false));
  root.addEventListener('focusin', (e) => { if (e.target.matches('.sv-reply input')) hold(true); });
  root.addEventListener('focusout', (e) => { if (e.target.matches('.sv-reply input')) hold(false); });
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-sv]'); if (!b) return; const s = groups[gi].stories[si]; const a = b.dataset.sv;
    if (a === 'close') close();
    if (a === 'viewers') { hold(true); const v = await api(`stories/${s.id}/viewers`); const sh = sheet(v.length ? `<div class="people">${v.map((u) => `<a href="#/u/${u.id}" class="person">${avatar(u, 42)}<div><b>${esc(u.name)}</b><small>@${esc(u.username)} · ${ago(u.created_at)}</small></div></a>`).join('')}</div>` : empty('eye', 'Aún nadie la ha visto'), { title: 'Visto por', onClose: () => hold(false) }); sh.el.addEventListener('click', (ev) => { if (ev.target.closest('a')) { sh.close(); close(); } }); }
    if (a === 'delete') { hold(true); if (await confirmBox('¿Eliminar esta historia?', 'Eliminar', true)) { await api('stories/' + s.id, { method: 'DELETE' }); toast('Historia eliminada'); groups[gi].stories.splice(si, 1); if (!groups[gi].stories.length) { groups.splice(gi, 1); if (!groups.length) return close(); gi = Math.min(gi, groups.length - 1); } si = Math.min(si, groups[gi].stories.length - 1); show(); } else hold(false); }
    if (a === 'highlight') { hold(true); const name = prompt('Nombre de la colección destacada (deja vacío para quitar):', s.highlight || ''); if (name !== null) { await api(`stories/${s.id}/highlight`, { method: 'PUT', body: { name } }); toast(name ? `Destacada en “${name}”` : 'Quitada de destacados'); s.highlight = name; } hold(false); }
  });
  root.addEventListener('submit', async (e) => {
    if (!e.target.matches('[data-sv-form]')) return; e.preventDefault();
    const inp = e.target.elements.text; const t = inp.value.trim(); if (!t) return;
    try { await api(`stories/${groups[gi].stories[si].id}/reply`, { method: 'POST', body: { text: t } }); inp.value = ''; inp.blur(); toast('Respuesta enviada'); } catch (err) { toast(err.message, 'err'); }
  });
  show();
}

// =============================================================== Bloques laterales / extras
export function streakCard(ex) {
  const st = ex.streak; const week = st.thisWeek; const done = week.trained >= st.goal;
  const todayDone = week.days.find((d) => d.today)?.trained;
  return `<section class="card streak-card">
    <div class="sc-top"><div><small class="muted">TU SEMANA</small><h3>${week.trained} de ${st.goal} entrenamientos ${done ? '🔥' : ''}</h3></div>
      <div class="sc-num">${ico('flame', 20)}<b>${st.current}</b><small>${st.current === 1 ? 'semana' : 'semanas'}</small></div></div>
    <div class="week">${week.days.map((d, i) => `<div class="wd ${d.trained ? 'on' : ''} ${d.today ? 'today' : ''}"><small>${DAYS[i]}</small><i>${d.trained ? ico('check', 14) : '·'}</i></div>`).join('')}</div>
    <div class="sc-foot"><span class="muted">Mejor racha: <b>${st.best}</b> sem · <b>${num(ex.me?.points || 0)}</b> pts</span>
      ${todayDone ? `<span class="chip green">${ico('check', 12)} Asististe hoy</span>` : `<button class="btn sm" data-act="checkin">+ Asistencia de hoy</button>`}</div></section>`;
}
export function challengeCard(ch) {
  if (!ch) return '';
  return `<a class="card feat-ch" href="#/reto/${ch.id}" style="${ch.image ? `--bg:url('${esc(ch.image)}')` : ''}">
    <div class="fc-body"><span class="chip orange">${ico('bolt', 12)} Reto de la semana</span>
      <h3>${esc(ch.title)}</h3><p>${esc(ch.exercise || '')}${ch.weight ? ` · ${ch.weight} kg` : ''} · ${esc(TYPE_NAME[ch.type] || '')}</p>
      <div class="fc-meta"><span>${ico('clock', 14)} ${countdown(ch.end_at)}</span><span>${ico('users', 14)} ${ch.participants}</span><span>${ico('star', 14)} ${ch.points} pts</span></div>
      ${ch.top.length ? `<div class="fc-top">${ch.top.map((t) => `<span class="mini-rank">#${t.position} ${avatar(t, 20)} ${esc(t.name.split(' ')[0])} <b>${fmtResult(t.result, ch.unit || '')}</b></span>`).join('')}</div>` : ''}
      <span class="btn sm fc-cta">${ch.joined ? 'Registrar resultado' : 'Participar'} ${ico('chevR', 14)}</span></div></a>`;
}
export function recentBlock(list) {
  if (!list?.length) return '';
  return `<section class="block"><h4 class="blk-h">Logros recientes</h4><div class="scroller ach-row">${list.map((a) => `<a class="ach" href="#/post/${a.id}">${avatar(a.author, 34)}<div><b>${esc(a.author.name.split(' ')[0])}</b><span>${ico(KIND[a.kind]?.[0] || 'trophy', 13)} ${esc(a.text.replace(/\n/g, ' ').slice(0, 54))}</span></div></a>`).join('')}</div></section>`;
}
export function activityBlock(list) {
  if (!list?.length) return '';
  return `<section class="block"><h4 class="blk-h">Actividad de tus amigos</h4><div class="card list-card">${list.slice(0, 5).map((a) => `<a class="act" href="#/u/${a.user.id}">${avatar(a.user, 32)}<span><b>${esc(a.user.name)}</b> ${esc(a.text)}</span><small>${ago(a.created_at)}</small></a>`).join('')}</div></section>`;
}
export function rightColumn(ex) {
  if (!ex) return '';
  return `${challengeCard(ex.challenge)}
  <section class="block"><h4 class="blk-h">Top temporada <a href="#/ranking" class="link">Ver todo</a></h4><div class="card list-card">${ex.topSeason.map((r) => `<a class="act" href="#/u/${r.id}"><b class="pos">${r.position}</b>${avatar(r, 30)}<span>${esc(r.name)}</span><b class="orange">${num(r.result)}</b></a>`).join('') || '<p class="muted pad">Aún no hay puntos</p>'}</div></section>
  ${ex.suggestions.length ? `<section class="block"><h4 class="blk-h">Sugerencias</h4><div class="card list-card">${ex.suggestions.map((u) => `<div class="act"><a href="#/u/${u.id}">${avatar(u, 32)}</a><a href="#/u/${u.id}" class="grow"><b>${esc(u.name)}</b><small class="muted">@${esc(u.username)}</small></a><button class="btn sm ghost" data-act="follow" data-id="${u.id}">Seguir</button></div>`).join('')}</div></section>` : ''}
  <p class="foot-note">RADICAL · comunidad privada del gimnasio</p>`;
}
actions.follow = async (el) => {
  const r = await api(`users/${el.dataset.id}/follow`, { method: 'POST' });
  el.textContent = r.following ? 'Siguiendo' : 'Seguir'; el.classList.toggle('ghost', !r.following);
};
actions.checkin = async () => {
  const r = await api('checkin', { method: 'POST', body: {} });
  toast(r.points ? `¡Asistencia registrada! +${r.points} puntos` : 'Ya registraste tu asistencia hoy', r.points ? 'ok' : '');
  render();
};

// =============================================================== Tarjetas del feed
function featCard(p) {
  const m = p.meta || {};
  if (p.kind === 'pr') return `<div class="feat feat-pr">${ico('trophy', 40)}<small>NUEVO PR</small><h3>${esc(m.exercise || '')}</h3><div class="big">${esc(m.value ?? '')}<span>${esc(m.unit || 'kg')}</span></div>${m.reps > 1 ? `<small>× ${m.reps} reps</small>` : ''}</div>`;
  if (p.kind === 'streak') return `<div class="feat feat-streak">${ico('flame', 44)}<small>RACHA SEMANAL</small><div class="big">${esc(m.weeks || '')}<span>${m.weeks === 1 ? 'semana' : 'semanas'}</span></div><small>sin fallar</small></div>`;
  if (p.kind === 'result') return `<div class="feat feat-res">${ico('trophy', 38)}<small>RESULTADOS FINALES</small>${(m.winners || []).map((w) => `<a class="winner" href="#/u/${w.id}">${avatar(w, 34)}<div><b>${esc(w.name)}</b><small>${esc(w.label)}</small></div><span class="orange">${esc(fmtResult(w.result, m.unit))}</span></a>`).join('') || ''}${m.challenge_id ? `<a class="btn sm ghost" href="#/reto/${m.challenge_id}">Ver clasificación</a>` : ''}</div>`;
  if (p.kind === 'workout') { const sets = m.sets || []; return `<div class="feat feat-wo">${ico('dumbbell', 30)}<small>${esc((m.title || 'Entrenamiento').toUpperCase())}</small>${sets.slice(0, 5).map((s) => `<div class="wo-row"><span>${esc(s.exercise)}</span><b>${s.sets}×${s.reps}${s.weight ? ` · ${s.weight} kg` : ''}</b></div>`).join('')}${sets.length > 5 ? `<small>+${sets.length - 5} más</small>` : ''}${m.volume ? `<div class="wo-vol">Volumen total <b>${num(Math.round(m.volume))} kg</b></div>` : ''}</div>`; }
  if (p.kind === 'progress' && m.weight) return `<div class="feat feat-streak">${ico('trend', 40)}<small>PROGRESO</small><div class="big">${esc(m.weight)}<span>kg</span></div></div>`;
  return '';
}
export function postCard(p, { detail = false } = {}) {
  const k = KIND[p.kind]; const a = p.author;
  const media = p.media ? `<div class="post-media" data-dbl="${p.id}">${mediaTag(p.media, p.media_type)}<i class="heart-pop">${ico('heart', 90)}</i></div>` : (featCard(p) ? `<div class="post-media feat-wrap" data-dbl="${p.id}">${featCard(p)}<i class="heart-pop">${ico('heart', 90)}</i></div>` : '');
  return `<article class="post" id="post-${p.id}" data-id="${p.id}">
    <header class="post-h"><a href="${a.id ? '#/u/' + a.id : '#/'}">${avatar(a, 38)}</a>
      <div class="post-who"><a href="${a.id ? '#/u/' + a.id : '#/'}"><b>${esc(a.name)}</b></a>${roleTag(a.role)}${k && p.kind !== 'gym' ? `<span class="kind k-${p.kind}">${ico(k[0], 12)} ${k[1]}</span>` : ''}
        <small>${p.location ? `${ico('pin', 11)} ${esc(p.location)} · ` : ''}${ago(p.created_at)}${p.visibility === 'followers' ? ' · ' + ico('lock', 11) : ''}</small></div>
      <button class="icon-btn" data-act="postMenu" data-id="${p.id}" aria-label="Opciones">${ico('more', 22)}</button></header>
    ${media}
    <div class="post-actions"><button class="pa like ${p.liked ? 'on' : ''}" data-act="like" data-id="${p.id}" aria-label="Me gusta">${ico('heart', 26)}</button>
      <button class="pa" data-act="comments" data-id="${p.id}" aria-label="Comentar">${ico('comment', 25)}</button>
      <button class="pa" data-act="share" data-kind="post" data-id="${p.id}" aria-label="Compartir">${ico('send', 24)}</button>
      <button class="pa save ${p.saved ? 'on' : ''}" data-act="save" data-id="${p.id}" aria-label="Guardar">${ico('bookmark', 25)}</button></div>
    <div class="post-likes"><b class="lc">${num(p.likes)}</b> ${p.likes === 1 ? 'me gusta' : 'me gustas'}</div>
    ${p.text && !(p.kind === 'result') ? `<div class="post-text"><a href="${a.id ? '#/u/' + a.id : '#/'}"><b>${esc(a.username)}</b></a> ${linkify(p.text)}</div>` : ''}
    ${p.tags.length ? `<div class="post-tags">${p.tags.map((t) => `<a href="#/u/${t.id}">@${esc(t.username)}</a>`).join(' ')}</div>` : ''}
    ${detail ? '' : `<button class="post-cm" data-act="comments" data-id="${p.id}">${p.comments ? `Ver los ${p.comments} comentarios` : 'Añade un comentario…'}</button>`}
    <time class="post-time">${ago(p.created_at)}</time></article>`;
}
export function annCard(a) {
  const [label, icon] = ANN[a.kind] || ANN.notice;
  return `<article class="post ann k-${a.kind}" data-ann="${a.id}">
    <header class="post-h"><span class="ann-ico">${ico(icon, 18)}</span><div class="post-who"><b>${esc(label)}</b><span class="kind k-gym">RADICAL</span><small>${a.pinned ? ico('star', 11) + ' Fijado · ' : ''}${ago(a.created_at)}</small></div>
      ${isStaff() ? `<button class="icon-btn" data-act="annMenu" data-id="${a.id}">${ico('more', 22)}</button>` : ''}</header>
    ${a.image ? `<div class="post-media">${mediaTag(a.image, 'image')}</div>` : ''}
    <div class="ann-body"><h3>${esc(a.title)}</h3>${a.body ? `<p>${linkify(a.body)}</p>` : ''}
      ${a.event_at ? `<div class="ann-when">${ico('calendar', 15)} ${dateLong(a.event_at)} · ${hhmm(a.event_at)}</div>` : ''}</div></article>`;
}
export const routineCard = (r) => r
  ? `<a class="today-card" href="#/rutinas/${r.id}"><small class="k">Tu rutina de hoy · día ${r.n} de ${r.total}</small><h3>${esc(r.day)}</h3><ul>${r.exercises.slice(0, 3).map((e) => `<li>${esc(e.name)} · ${e.sets} × ${esc(e.reps)}</li>`).join('')}${r.exercises.length > 3 ? `<li>y ${r.exercises.length - 3} más…</li>` : ''}</ul></a>`
  : `<a class="today-card" href="#/rutinas"><small class="k">Entrenamientos sugeridos</small><h3>¿No sabes qué entrenar hoy?</h3><span class="muted">Elige una rutina con ejercicios, series y repeticiones.</span></a>`;
export const feedItem = (i) => (i.type === 'announcement' ? annCard(i) : postCard(i));

// =============================================================== Acciones de publicaciones
actions.like = async (el) => {
  const card = el.closest('.post'); const was = el.classList.contains('on');
  el.classList.toggle('on', !was); el.classList.remove('pop'); void el.offsetWidth; if (!was) el.classList.add('pop');
  try { const r = await api(`posts/${el.dataset.id}/like`, { method: 'POST' }); $$('.lc', card).forEach((n) => (n.textContent = num(r.likes))); el.classList.toggle('on', r.liked); }
  catch (e) { el.classList.toggle('on', was); throw e; }
};
actions.save = async (el) => { const r = await api(`posts/${el.dataset.id}/save`, { method: 'POST' }); el.classList.toggle('on', r.saved); toast(r.saved ? 'Guardado' : 'Quitado de guardados'); };
// doble toque = me gusta
let lastTap = { t: 0, el: null };
document.addEventListener('pointerup', (e) => {
  const m = e.target.closest('[data-dbl]'); if (!m || e.target.closest('video')) return;
  const now = Date.now();
  if (lastTap.el === m && now - lastTap.t < 320) {
    const pop = $('.heart-pop', m); pop.classList.remove('go'); void pop.offsetWidth; pop.classList.add('go');
    const btn = $(`#post-${m.dataset.dbl} .like`); if (btn && !btn.classList.contains('on')) btn.click(); lastTap = { t: 0, el: null };
  } else lastTap = { t: now, el: m };
});

actions.postMenu = async (el) => {
  const id = +el.dataset.id; const p = await api('posts/' + id);
  const items = [{ label: 'Ver publicación', icon: 'eye', run: () => go('#/post/' + id) }, { label: 'Compartir por mensaje', icon: 'send', run: () => shareSheet('post', id) },
    { label: 'Copiar enlace', icon: 'link', run: () => { navigator.clipboard?.writeText(`${location.origin}/#/post/${id}`); toast('Enlace copiado'); } }];
  if (p.author.id === state.user.id || isStaff()) items.push({ label: 'Eliminar publicación', icon: 'trash', danger: true, run: async () => { if (await confirmBox('¿Eliminar esta publicación?', 'Eliminar', true)) { await api('posts/' + id, { method: 'DELETE' }); $$(`#post-${id}`).forEach((n) => n.remove()); toast('Publicación eliminada'); if (location.hash.startsWith('#/post/')) go('#/'); } } });
  if (p.author.id !== state.user.id) items.push({ label: 'Reportar', icon: 'flag', danger: true, run: async () => { const reason = prompt('¿Por qué reportas esta publicación?'); if (reason) { await api('reports', { method: 'POST', body: { type: 'post', id, reason } }); toast('Reporte enviado a administración'); } } });
  menuSheet(items);
};
actions.annMenu = (el) => {
  const id = +el.dataset.id;
  menuSheet([{ label: 'Eliminar anuncio', icon: 'trash', danger: true, run: async () => { if (await confirmBox('¿Eliminar este anuncio?', 'Eliminar', true)) { await api('admin/announcements/' + id, { method: 'DELETE' }); $(`[data-ann="${id}"]`)?.remove(); toast('Anuncio eliminado'); } } }]);
};

// ---------------- comentarios ----------------
function commentHtml(c, postOwner) {
  const can = c.user_id === state.user.id || postOwner === state.user.id || isStaff();
  return `<div class="cm" id="cm-${c.id}"><a href="#/u/${c.user_id}">${avatar(c, 34)}</a><div class="grow"><div><a href="#/u/${c.user_id}"><b>${esc(c.username)}</b></a> ${linkify(c.text)}</div><small class="muted">${ago(c.created_at)}</small></div>${can ? `<button class="icon-btn sm" data-act="delComment" data-id="${c.id}" aria-label="Eliminar">${ico('trash', 16)}</button>` : ''}</div>`;
}
export async function commentsInto(box, postId, ownerId) {
  const list = await api(`posts/${postId}/comments`);
  box.innerHTML = list.length ? list.map((c) => commentHtml(c, ownerId)).join('') : empty('comment', 'Sé el primero en comentar');
}
actions.comments = async (el) => {
  const id = +el.dataset.id; const p = await api('posts/' + id);
  const s = sheet(`<div class="cm-list" id="cm-box"></div><form class="cm-form" data-form="comment" data-id="${id}" data-owner="${p.author.id}">${avatar(state.user, 34)}<input name="text" placeholder="Añade un comentario…" maxlength="500" autocomplete="off" required><button class="btn sm" type="submit">Publicar</button></form>`, { title: 'Comentarios', full: true, cls: 'cm-sheet' });
  await commentsInto($('#cm-box', s.el), id, p.author.id);
};
forms.comment = async (f) => {
  const id = f.dataset.id; const text = f.elements.text.value.trim(); if (!text) return;
  const c = await api(`posts/${id}/comments`, { method: 'POST', body: { text } });
  const box = $('#cm-box') || $('#detail-cm'); if (box.querySelector('.empty')) box.innerHTML = '';
  box.insertAdjacentHTML('beforeend', commentHtml(c, +f.dataset.owner)); f.reset(); box.scrollTop = box.scrollHeight;
  $$(`#post-${id} .post-cm`).forEach((b) => { const n = $$('.cm', box).length; b.textContent = `Ver los ${n} comentarios`; });
};
actions.delComment = async (el) => { await api('comments/' + el.dataset.id, { method: 'DELETE' }); $('#cm-' + el.dataset.id)?.remove(); };

// ---------------- compartir (mensaje privado) ----------------
export async function shareSheet(kind, id) {
  const s = sheet(`<input class="search" id="sh-q" placeholder="Buscar miembro…" autocomplete="off"><div id="sh-list" class="people"></div>
    <button class="btn ghost block" data-copy>${ico('link', 18)} Copiar enlace</button>`, { title: 'Compartir con…', cls: 'tall' });
  const list = $('#sh-list', s.el);
  const load = async (q = '') => {
    const users = (await api('users?q=' + encodeURIComponent(q))).filter((u) => u.id !== state.user.id);
    list.innerHTML = users.map((u) => `<div class="person">${avatar(u, 42)}<div class="grow"><b>${esc(u.name)}</b><small>@${esc(u.username)}</small></div><button class="btn sm" data-send="${u.id}">Enviar</button></div>`).join('') || empty('search', 'Sin resultados');
  };
  load(); let t; $('#sh-q', s.el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 200); });
  s.el.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-send]');
    if (b) { b.disabled = true; try { await api('messages/' + b.dataset.send, { method: 'POST', body: { kind, ref_id: id } }); b.textContent = '✓ Enviado'; b.classList.add('ghost'); } catch (er) { toast(er.message, 'err'); b.disabled = false; } }
    if (e.target.closest('[data-copy]')) { const path = { post: 'post', challenge: 'reto', profile: 'u' }[kind]; navigator.clipboard?.writeText(`${location.origin}/#/${path}/${id}`); toast('Enlace copiado'); }
  });
}
actions.share = (el) => shareSheet(el.dataset.kind, +el.dataset.id);

// =============================================================== Vistas
let feedState = { next: null, loading: false, scope: '' };
async function loadMore(box, sentinel) {
  if (feedState.loading || !feedState.next) return; feedState.loading = true;
  try { const d = await api('feed?' + (feedState.scope ? 'scope=' + feedState.scope + '&' : '') + 'before=' + encodeURIComponent(feedState.next)); box.insertAdjacentHTML('beforeend', d.items.map(feedItem).join('')); feedState.next = d.items.length ? d.next : null; if (!feedState.next) sentinel.innerHTML = '<p class="muted center pad">Estás al día 💪</p>'; }
  finally { feedState.loading = false; }
}
route('/', async (el) => {
  const [stories, feed, ex] = await Promise.all([api('stories'), api('feed'), api('home/extras')]);
  state.extras = ex; feedState = { next: feed.next, loading: false, scope: '' };
  const items = feed.items.map(feedItem);
  el.innerHTML = `${storiesBar(stories)}
    <div class="inline-extras">${challengeCard(ex.challenge)}${routineCard(ex.routine)}${streakCard(ex)}</div>
    <div id="feed">${items.slice(0, 2).join('')}${`<div class="inline-extras">${recentBlock(ex.recent)}${activityBlock(ex.activity)}</div>`}${items.slice(2).join('')}</div>
    ${feed.items.length ? '' : empty('dumbbell', 'Aún no hay publicaciones', 'Sé el primero en publicar')}
    <div id="sentinel" class="sentinel">${feed.next ? '<div class="spin"></div>' : '<p class="muted center pad">Estás al día 💪</p>'}</div>`;
  const io = new IntersectionObserver((en) => en[0].isIntersecting && loadMore($('#feed'), $('#sentinel')), { rootMargin: '600px' });
  const s = $('#sentinel'); s && feed.next && io.observe(s);
  $('#right-col') && ($('#right-col').innerHTML = `${streakCard(ex)}${rightColumn(ex)}`);
  onCleanup(() => io.disconnect());
}, { name: 'home' });

route('/noticias', async (el) => {
  const feed = await api('feed?scope=news'); feedState = { next: feed.next, loading: false, scope: 'news' };
  el.innerHTML = `<div class="page-head"><h2>Noticias</h2></div><p class="muted" style="margin:-6px 0 14px">Avisos, promociones y novedades oficiales del gimnasio.</p>
    <div id="feed">${feed.items.map(feedItem).join('')}</div>
    ${feed.items.length ? '' : empty('megaphone', 'Sin noticias por ahora', 'Aquí verás los avisos y novedades del gimnasio')}
    <div id="sentinel" class="sentinel">${feed.next ? '<div class="spin"></div>' : feed.items.length ? '<p class="muted center pad">Estás al día 💪</p>' : ''}</div>`;
  const io = new IntersectionObserver((en) => en[0].isIntersecting && loadMore($('#feed'), $('#sentinel')), { rootMargin: '600px' });
  const s = $('#sentinel'); s && feed.next && io.observe(s);
  onCleanup(() => io.disconnect());
}, { name: 'news' });

route('/post/(\\d+)', async (el, id) => {
  const p = await api('posts/' + id);
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-act="back">${ico('back', 24)}</button><h2>Publicación</h2></div>${postCard(p, { detail: true })}
    <div class="cm-list inline" id="detail-cm"></div><form class="cm-form" data-form="comment" data-id="${p.id}" data-owner="${p.author.id}">${avatar(state.user, 34)}<input name="text" placeholder="Añade un comentario…" maxlength="500" autocomplete="off" required><button class="btn sm" type="submit">Publicar</button></form>`;
  await commentsInto($('#detail-cm'), p.id, p.author.id);
}, { name: 'post' });

route('/guardados', async (el) => {
  const list = await api('saved');
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-act="back">${ico('back', 24)}</button><h2>Guardados</h2></div>${list.length ? list.map((p) => postCard(p)).join('') : empty('bookmark', 'Nada guardado todavía', 'Toca el marcador en una publicación para guardarla')}`;
}, { name: 'saved' });

route('/buscar(?:/([\\w.]*))?', async (el, q = '') => {
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-act="back">${ico('back', 24)}</button><h2>Buscar miembros</h2></div>
    <input class="search" id="q" placeholder="Nombre o @usuario" value="${esc(q)}" autocomplete="off" autofocus><div id="res" class="people card pad0"></div>`;
  const run = async (v) => { const u = await api('users?q=' + encodeURIComponent(v)); $('#res').innerHTML = u.map((x) => `<a class="person" href="#/u/${x.id}">${avatar(x, 44)}<div><b>${esc(x.name)}</b><small>@${esc(x.username)}${x.wcat ? ' · ' + x.wcat : ''}</small></div></a>`).join('') || empty('search', 'Sin resultados'); };
  run(q); let t; $('#q').addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => run(e.target.value), 200); });
}, { name: 'search', skeleton: false });
