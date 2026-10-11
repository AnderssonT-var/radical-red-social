import { $, $$, esc, api, postForm, state, ico, avatar, ago, empty, toast, sheet, actions, forms, route, go, render, isStaff, num, countdown, TYPE_NAME, fmtResult, chip, onCleanup, dateShort, dateLong, hhmm, AWARD, mediaTag, linkify, parse } from './core.js';
import { shareSheet } from './feed.js';

const MEDAL = ['🥇', '🥈', '🥉'];
const statusChip = (s, note = '') => ({ pending: `<span class="chip amber">${ico('clock', 12)} Pendiente de validación</span>`, approved: `<span class="chip green">${ico('check', 12)} Aprobado</span>`, rejected: `<span class="chip red">${ico('x', 12)} Rechazado${note ? ': ' + esc(note) : ''}</span>` }[s]);

// =============================================================== Filas de ranking
function rankRows(rows, unit, { extra, me = state.user.id } = {}) {
  if (!rows.length) return empty('trophy', 'Todavía no hay resultados', 'Sé el primero en aparecer aquí');
  const row = (r) => `<a class="rk-row ${r.id === me ? 'me' : ''}" href="#/u/${r.id}"><b class="rk-pos ${r.position <= 3 ? 'p' + r.position : ''}">${r.position <= 3 ? MEDAL[r.position - 1] : r.position}</b>${avatar(r, 44)}
    <div class="grow"><b>${esc(r.name)}</b><small>@${esc(r.username)}${r.wcat ? ' · ' + esc(r.wcat) : ''}${extra ? ' · ' + extra(r) : ''}</small></div>
    <div class="rk-val"><b>${esc(fmtResult(r.result, unit === 'pts' ? 'pts' : unit))}</b>${r.pending ? `<small class="amber-t">${ico('clock', 10)} ${esc(fmtResult(r.pending, unit))} pendiente</small>` : ''}</div></a>`;
  const top = rows.slice(0, 3);
  const podium = rows.length >= 3 ? `<div class="podium">${[1, 0, 2].map((i) => { const r = top[i]; return `<a class="pod p${i + 1}" href="#/u/${r.id}"><span class="medal">${MEDAL[i]}</span>${avatar(r, i === 0 ? 74 : 58)}<b>${esc(r.name.split(' ')[0])}</b><span class="val">${esc(fmtResult(r.result, unit))}</span><i class="bar"></i></a>`; }).join('')}</div>` : '';
  const rest = rows.length >= 3 ? rows.slice(3) : rows;
  return `${podium}<div class="card list-card rk-list">${rest.map(row).join('')}</div>`;
}

// =============================================================== Ranking
const rk = { tab: 'challenge', gender: 'all', wcat: 'all', lift: 'total', challenge_id: '' };
const TABS = [['challenge', 'Reto semanal'], ['season', 'Temporada'], ['streak', 'Racha'], ['strength', 'Fuerza'], ['prs', 'PRs']];
const LIFTS = [['total', 'Total'], ['squat', 'Sentadilla'], ['bench', 'Banca'], ['deadlift', 'Peso muerto']];
async function loadRanking() {
  const body = $('#rk-body'); if (!body) return;
  const q = new URLSearchParams({ gender: rk.gender, wcat: rk.wcat, lift: rk.lift, ...(rk.challenge_id ? { challenge_id: rk.challenge_id } : {}) });
  const d = await api(`rankings/${rk.tab}?${q}`);
  const cats = $('#rk-cat'); if (cats && !cats.options.length > 1) {}
  if (cats && cats.options.length <= 1) cats.innerHTML = '<option value="all">Todas las categorías</option>' + d.categories.map((c) => `<option ${c === rk.wcat ? 'selected' : ''}>${c}</option>`).join('');
  let head = '';
  if (rk.tab === 'challenge') {
    const c = d.challenge;
    head = c ? `<a class="rk-head" href="#/reto/${c.id}" style="${c.image ? `--bg:url('${esc(c.image)}')` : ''}"><div><small>${c.status === 'active' ? 'RETO EN CURSO' : c.status === 'ended' ? 'RETO FINALIZADO' : 'PRÓXIMO RETO'}</small><h3>${esc(c.title)}</h3><span>${esc(c.exercise || '')}${c.weight ? ` · ${c.weight} kg` : ''} · ${c.status === 'active' ? 'termina en ' + countdown(c.end_at) : esc(TYPE_NAME[c.type])}</span></div>${ico('chevR', 22)}</a>
      ${c.status === 'active' ? `<p class="live"><i></i> Clasificación en tiempo real · solo resultados validados</p>` : ''}` : '';
  }
  if (rk.tab === 'season') {
    const s = d.season;
    head = s ? `<a class="rk-head" href="#/temporadas"><div><small>TEMPORADA ACTUAL</small><h3>${esc(s.name)}</h3><span>${dateShort(s.start_at + ' 12:00:00')} → ${dateShort(s.end_at + ' 12:00:00')} · puntos RADICAL</span></div>${ico('chevR', 22)}</a>` : empty('trophy', 'No hay temporada activa');
  }
  if (rk.tab === 'streak') head = '<p class="rk-note">Semanas consecutivas cumpliendo tu meta de entrenamientos.</p>';
  if (rk.tab === 'prs') head = '<p class="rk-note">Cantidad de récords personales validados.</p>';
  const extra = rk.tab === 'streak' ? (r) => `mejor ${r.best} sem` : rk.tab === 'strength' && rk.lift === 'total' ? (r) => `S ${r.squat} · B ${r.bench} · P ${r.deadlift}` : null;
  const unit = rk.tab === 'challenge' ? d.unit : d.unit;
  body.innerHTML = `${head}${rankRows(d.rows, unit, { extra })}`;
  const mine = d.rows.find((r) => r.id === state.user.id);
  $('#my-pos').innerHTML = mine ? `<span>Tu posición</span><b>#${mine.position}</b><span class="grow">${esc(fmtResult(mine.result, unit))}</span>` : '';
  $('#my-pos').classList.toggle('show', !!mine);
}
route('/ranking', async (el) => {
  el.innerHTML = `<div class="page-head"><h2>Ranking</h2></div>
    <div class="tabs scroller" id="rk-tabs">${TABS.map(([k, n]) => `<button class="tab ${rk.tab === k ? 'on' : ''}" data-act="rkTab" data-v="${k}">${n}</button>`).join('')}</div>
    <div class="filters"><div class="seg">${[['all', 'General'], ['M', 'Hombres'], ['F', 'Mujeres']].map(([k, n]) => `<button class="${rk.gender === k ? 'on' : ''}" data-act="rkGender" data-v="${k}">${n}</button>`).join('')}</div>
      <select id="rk-cat" class="select" data-act-change="rkCat"><option value="all">Todas las categorías</option></select></div>
    <div id="rk-lifts" class="chips scroller ${rk.tab === 'strength' ? '' : 'hide'}">${LIFTS.map(([k, n]) => `<button class="chip-btn ${rk.lift === k ? 'on' : ''}" data-act="rkLift" data-v="${k}">${n}</button>`).join('')}</div>
    <div id="rk-body">${'<div class="loading"><div class="spin"></div></div>'}</div><div id="my-pos" class="my-pos"></div>`;
  await loadRanking();
  const t = setInterval(() => $('#rk-body') && loadRanking().catch(() => {}), 20000); onCleanup(() => clearInterval(t));
}, { name: 'ranking' });
document.addEventListener('change', (e) => { if (e.target.matches('[data-act-change="rkCat"]')) { rk.wcat = e.target.value; loadRanking(); } });
const setOn = (el, sel) => { $$(sel).forEach((b) => b.classList.toggle('on', b === el)); };
actions.rkTab = (el) => { rk.tab = el.dataset.v; setOn(el, '#rk-tabs .tab'); $('#rk-lifts').classList.toggle('hide', rk.tab !== 'strength'); if (rk.tab !== 'challenge') rk.challenge_id = ''; $('#rk-body').innerHTML = '<div class="loading"><div class="spin"></div></div>'; loadRanking(); el.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); };
actions.rkGender = (el) => { rk.gender = el.dataset.v; setOn(el, '.seg button'); loadRanking(); };
actions.rkLift = (el) => { rk.lift = el.dataset.v; setOn(el, '#rk-lifts .chip-btn'); loadRanking(); };

// =============================================================== Temporadas
route('/temporadas', async (el) => {
  const d = await api('seasons');
  const awards = (s) => s.awards.length ? `<div class="awards">${s.awards.map((a) => `<div class="award">${ico('trophy', 18)}<div><small>${AWARD[a.award]}</small><b>${a.team ? 'Equipo ' + esc(a.team) : `<a href="#/u/${a.user_id}">${esc(a.name)}</a>`}</b></div></div>`).join('')}</div>` : '';
  const c = d.current;
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-act="back">${ico('back', 24)}</button><h2>Temporadas</h2></div>
    ${c ? `<section class="card season-card"><span class="chip orange">En curso</span><h3>${esc(c.name)}</h3><p class="muted">${dateShort(c.start_at + ' 12:00:00')} → ${dateShort(c.end_at + ' 12:00:00')} · termina ${countdown(c.end_at + ' 23:59:00')}</p>
      ${rankRows(c.top.map((r) => r), 'pts')}</section>` : empty('trophy', 'No hay temporada activa')}
    <h4 class="blk-h">Salón de campeones</h4>
    ${d.history.map((s) => `<section class="card season-card"><span class="chip">Finalizada</span><h3>${esc(s.name)}</h3><p class="muted">${dateShort(s.start_at + ' 12:00:00')} → ${dateShort(s.end_at + ' 12:00:00')}</p>${awards(s)}
      ${s.top.length ? `<details><summary>Clasificación final</summary><div class="list-card">${s.top.map((r) => `<a class="act" href="#/u/${r.id}"><b class="pos">${r.position}</b>${avatar(r, 30)}<span>${esc(r.name)}</span><b class="orange">${num(r.points)} pts</b></a>`).join('')}</div></details>` : ''}</section>`).join('') || empty('trophy', 'Aún no hay campeones', 'Al terminar la primera temporada aparecerán aquí')}`;
}, { name: 'seasons' });

// =============================================================== Retos
const chCard = (c) => `<a class="card ch-card" href="#/reto/${c.id}"><div class="ch-img" style="${c.image ? `--bg:url('${esc(c.image)}')` : ''}">${c.featured ? '<span class="chip orange abs">Destacado</span>' : ''}
  <span class="chip abs r ${c.status === 'active' ? 'green' : c.status === 'upcoming' ? 'amber' : ''}">${c.status === 'active' ? 'Activo' : c.status === 'upcoming' ? 'Próximo' : 'Finalizado'}</span></div>
  <div class="ch-body"><h3>${esc(c.title)}</h3><p>${esc(c.exercise || '')}${c.weight ? ` · ${c.weight} kg` : ''} · ${esc(TYPE_NAME[c.type])}</p>
  <div class="fc-meta"><span>${ico('clock', 14)} ${c.status === 'upcoming' ? 'Empieza ' + dateShort(c.start_at) : c.status === 'active' ? countdown(c.end_at) : dateShort(c.end_at)}</span><span>${ico('users', 14)} ${c.participants}</span><span>${ico('star', 14)} ${c.points} pts</span>${c.joined ? `<span class="orange">${ico('check', 14)} Inscrito</span>` : ''}</div></div></a>`;
route('/retos', async (el) => {
  const d = await api('challenges');
  el.innerHTML = `<div class="page-head"><h2>Retos</h2>${isStaff() ? `<a class="btn sm" href="#/admin/retos">${ico('plus', 14)} Crear reto</a>` : ''}</div>
    <h4 class="blk-h">En curso</h4>${d.active.map(chCard).join('') || empty('bolt', 'No hay retos activos', 'Pronto habrá uno nuevo')}
    ${d.upcoming.length ? `<h4 class="blk-h">Próximos</h4>${d.upcoming.map(chCard).join('')}` : ''}
    ${d.past.length ? `<h4 class="blk-h">Anteriores</h4>${d.past.map(chCard).join('')}` : ''}`;
}, { name: 'challenges' });

let dFilter = 'all';
function chRanking(c) {
  let rows = c.ranking;
  if (dFilter === 'M' || dFilter === 'F') rows = rows.filter((r) => r.gender === dFilter); else if (dFilter !== 'all') rows = rows.filter((r) => r.wcat === dFilter);
  rows = rows.map((r, i) => ({ ...r, position: i + 1 }));
  return rankRows(rows, c.unit);
}
function chFilters(c) {
  if (c.classification === 'general') return '';
  const opts = c.classification === 'weight' ? c.categories.map((x) => [x, x]) : [['M', 'Hombres'], ['F', 'Mujeres']];
  return `<div class="chips scroller"><button class="chip-btn ${dFilter === 'all' ? 'on' : ''}" data-act="dFilter" data-v="all">General</button>${opts.map(([k, n]) => `<button class="chip-btn ${dFilter === k ? 'on' : ''}" data-act="dFilter" data-v="${esc(k)}">${esc(n)}</button>`).join('')}</div>`;
}
let curCh = null;
function chDetail(c) {
  curCh = c; const live = c.status === 'active';
  const cta = c.status === 'ended' ? '<div class="note">Este reto ya finalizó.</div>' : c.status === 'upcoming' ? `<div class="note">Empieza el ${dateLong(c.start_at)}.</div>` :
    !c.joined ? `<button class="btn block lg" data-act="joinCh" data-id="${c.id}">Participar en el reto</button>` :
      c.attemptsLeft > 0 ? `<button class="btn block lg" data-act="entryForm" data-id="${c.id}">${ico('plus', 18)} Registrar resultado <small>(${c.attemptsLeft} ${c.attemptsLeft === 1 ? 'intento' : 'intentos'})</small></button>` : '<div class="note">Usaste todos tus intentos.</div>';
  return `<div class="ch-hero" style="${c.image ? `--bg:url('${esc(c.image)}')` : ''}"><button class="icon-btn float" data-act="back">${ico('back', 24)}</button><button class="icon-btn float r" data-act="share" data-kind="challenge" data-id="${c.id}">${ico('send', 22)}</button>
      <div class="hero-t"><span class="chip ${live ? 'green' : c.status === 'upcoming' ? 'amber' : ''}">${live ? 'En curso · ' + countdown(c.end_at) : c.status === 'upcoming' ? 'Próximo' : 'Finalizado'}</span><h1>${esc(c.title)}</h1></div></div>
    <div class="ch-info">${c.exercise ? `<div class="kv">${ico('dumbbell', 18)}<small>Ejercicio</small><b>${esc(c.exercise)}</b></div>` : ''}${c.weight ? `<div class="kv">${ico('bolt', 18)}<small>Peso obligatorio</small><b>${c.weight} kg</b></div>` : ''}
      <div class="kv">${ico('trend', 18)}<small>Tipo</small><b>${esc(TYPE_NAME[c.type])}</b></div><div class="kv">${ico('check', 18)}<small>Intentos</small><b>${c.attempts}</b></div>
      <div class="kv">${ico('star', 18)}<small>Puntos</small><b>${c.points}</b></div><div class="kv">${ico('users', 18)}<small>Participantes</small><b>${c.participants}</b></div>
      <div class="kv">${ico('calendar', 18)}<small>Inicio</small><b>${dateShort(c.start_at)} ${hhmm(c.start_at)}</b></div><div class="kv">${ico('calendar', 18)}<small>Fin</small><b>${dateShort(c.end_at)} ${hhmm(c.end_at)}</b></div></div>
    ${c.prize ? `<div class="prize">${ico('trophy', 22)}<div><small>PREMIO</small><b>${esc(c.prize)}</b></div></div>` : ''}
    <p class="ch-desc">${linkify(c.description)}</p>
    ${c.video ? `<div class="ch-video">${mediaTag(c.video, 'video')}</div>` : ''}
    ${c.rules ? `<details class="rules" open><summary>Reglas</summary><p>${linkify(c.rules)}</p></details>` : ''}
    <div class="cta-bar">${cta}</div>
    ${c.myEntries.length ? `<h4 class="blk-h">Tus resultados</h4><div class="card list-card">${c.myEntries.map((e) => `<div class="entry"><div><b>${esc(fmtResult(e.result, c.unit))}</b><small class="muted">${ago(e.created_at)}${e.video ? ' · con video' : ''}${e.note ? ' · ' + esc(e.note) : ''}</small></div>${statusChip(e.status, e.review_note)}</div>`).join('')}</div>` : ''}
    <h4 class="blk-h">Clasificación ${live ? '<span class="live"><i></i> en vivo</span>' : ''}</h4>
    ${c.type === 'team' && c.teams?.length ? `<div class="card list-card">${c.teams.map((t) => `<div class="act"><b class="pos">${t.position}</b><span class="grow"><b>Equipo ${esc(t.team)}</b></span><b class="orange">${num(t.result)} ${esc(c.unit)}</b></div>`).join('')}</div>` : ''}
    <div id="ch-filters">${chFilters(c)}</div><div id="ch-rank">${chRanking(c)}</div>`;
}
route('/reto/(\\d+)', async (el, id) => {
  dFilter = 'all'; const c = await api('challenges/' + id); el.innerHTML = chDetail(c);
  if (c.status === 'active') { const t = setInterval(async () => { if (!$('#ch-rank')) return; try { const n = await api('challenges/' + id); curCh = n; $('#ch-rank').innerHTML = chRanking(n); } catch {} }, 12000); onCleanup(() => clearInterval(t)); }
}, { name: 'challenge', skeleton: false });
actions.dFilter = (el) => { dFilter = el.dataset.v; $('#ch-filters').innerHTML = chFilters(curCh); $('#ch-rank').innerHTML = chRanking(curCh); };
actions.joinCh = async (el) => { const r = await api(`challenges/${el.dataset.id}/join`, { method: 'POST' }); toast(r.points ? `¡Estás dentro! +${r.points} puntos` : '¡Estás dentro!', 'ok'); render(); };
actions.entryForm = async (el) => {
  const c = curCh; const unit = c.unit === 's' ? 'segundos' : c.unit;
  sheet(`<form data-form="entry" data-id="${c.id}" class="form"><p class="muted">${esc(c.title)} · ${c.attemptsLeft} ${c.attemptsLeft === 1 ? 'intento disponible' : 'intentos disponibles'}</p>
    <label>Resultado (${esc(unit)})<input name="result" type="number" inputmode="decimal" step="any" min="0" required placeholder="Ej. 24" autofocus></label>
    <label class="file">${ico('video', 20)}<span>Subir video como evidencia</span><input type="file" name="video" accept="video/*,image/*"></label>
    <label>Nota (opcional)<input name="note" maxlength="200" placeholder="Ej. segundo intento"></label>
    <p class="muted sm">Tu resultado quedará <b>pendiente de validación</b> hasta que un administrador revise el video.</p>
    <button class="btn block lg" type="submit">Enviar resultado</button></form>`, { title: 'Registrar resultado' });
};
forms.entry = async (f) => {
  const fd = new FormData(f); if (!fd.get('video')?.size) fd.delete('video');
  await postForm(`challenges/${f.dataset.id}/entries`, fd); $('.sheet-wrap')?.remove(); document.body.classList.remove('noscroll');
  toast('Resultado enviado: pendiente de validación', 'ok'); render();
};
