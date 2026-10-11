// Mensajes privados y notificaciones
import { ORDER_ST, $, $$, esc, api, state, ico, avatar, ago, hhmm, dayLabel, linkify, empty, toast, actions, forms, route, go, onCleanup, refreshCounters, parse, chip, sheet } from './core.js';

// ---------------------------------------------------------------- lista de conversaciones
route('/mensajes', async (el) => {
  const list = await api('conversations'); refreshCounters();
  el.innerHTML = `<div class="page-head"><h2>Mensajes</h2><button class="btn sm" data-act="newChat">${ico('edit', 14)} Nuevo</button></div>
    ${list.length ? `<div class="card list-card convs">${list.map((c) => `<a class="conv ${c.unread ? 'unread' : ''}" href="#/mensajes/${c.user.id}">${avatar(c.user, 52)}<div class="grow"><b>${esc(c.user.name)}</b><span>${c.last.from_me ? 'Tú: ' : ''}${esc((c.last.text || '').slice(0, 60))}</span></div><div class="conv-meta"><small>${ago(c.last.created_at)}</small>${c.unread ? `<i class="pill">${c.unread}</i>` : ''}</div></a>`).join('')}</div>`
      : empty('send', 'Sin conversaciones todavía', 'Escríbele a otro miembro del gimnasio')}`;
}, { name: 'inbox' });
actions.newChat = () => {
  const s = sheet(`<input class="search" id="nc-q" placeholder="Buscar miembro…" autocomplete="off" autofocus><div id="nc-list" class="people"></div>`, { title: 'Nuevo mensaje', cls: 'tall' });
  const load = async (q = '') => { const u = (await api('users?q=' + encodeURIComponent(q))).filter((x) => x.id !== state.user.id); $('#nc-list', s.el).innerHTML = u.map((x) => `<a class="person" href="#/mensajes/${x.id}" data-close>${avatar(x, 44)}<div><b>${esc(x.name)}</b><small>@${esc(x.username)}</small></div></a>`).join('') || empty('search', 'Sin resultados'); };
  load(); let t; $('#nc-q', s.el).addEventListener('input', (e) => { clearTimeout(t); t = setTimeout(() => load(e.target.value), 200); });
  s.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) s.close(); });
};

// ---------------------------------------------------------------- chat
function bubble(m, me) {
  const mine = m.from_id === me; let body = '';
  if (m.kind === 'post' && m.ref) body = `<a class="share-card" href="#/post/${m.ref.id}">${m.ref.media ? `<img src="${esc(m.ref.media)}" alt="">` : `<span class="sc-ic">${ico('image', 22)}</span>`}<div><small>Publicación de ${esc(m.ref.author)}</small><span>${esc(m.ref.text || 'Ver publicación')}</span></div></a>`;
  else if (m.kind === 'challenge' && m.ref) body = `<a class="share-card" href="#/reto/${m.ref.id}">${m.ref.image ? `<img src="${esc(m.ref.image)}" alt="">` : `<span class="sc-ic">${ico('bolt', 22)}</span>`}<div><small>Reto</small><span>${esc(m.ref.title)}</span></div></a>`;
  else if (m.kind === 'profile' && m.ref) body = `<a class="share-card" href="#/u/${m.ref.id}">${avatar(m.ref, 44)}<div><small>Perfil</small><span>${esc(m.ref.name)} · @${esc(m.ref.username)}</span></div></a>`;
  else if (m.kind === 'order' && m.ref) body = `<a class="share-card order" href="#/tienda/${m.ref.product_id}"><img src="${esc(m.ref.image)}" alt=""><div><small>${m.ref.kind === 'reserva' ? 'Reserva' : 'Pedido'} · ${esc(ORDER_ST[m.ref.status] || m.ref.status)}</small><span>${esc(m.ref.product)}</span><small>${esc(m.ref.model || '')}${m.ref.model ? ' · ' : ''}Talla ${esc(m.ref.size || 'única')} · x${m.ref.qty}</small></div></a>`;
  else if (m.kind === 'story_reply') body = `<div class="reply-tag">${ico('camera', 12)} Respondió a una historia${m.ref?.caption ? ': ' + esc(m.ref.caption) : ''}</div>${m.text ? `<p>${linkify(m.text)}</p>` : ''}`;
  else if (!m.ref && m.kind !== 'text') body = `<p class="muted">Contenido no disponible</p>`;
  else body = `<p>${linkify(m.text)}</p>`;
  return `<div class="msg ${mine ? 'mine' : ''}" data-id="${m.id}"><div class="bub">${body}<span class="mt">${hhmm(m.created_at)}${mine ? `<i class="tick ${m.read ? 'read' : ''}">${ico('check', 11)}${ico('check', 11)}</i>` : ''}</span></div></div>`;
}
function withDays(list, me) {
  let last = ''; return list.map((m) => { const d = dayLabel(m.created_at); const sep = d !== last ? `<div class="day-sep"><span>${d}</span></div>` : ''; last = d; return sep + bubble(m, me); }).join('');
}
route('/mensajes/(\\d+)', async (el, uid) => {
  const d = await api('messages/' + uid); refreshCounters(); const me = state.user.id; let all = d.messages;
  el.innerHTML = `<div class="chat"><div class="chat-head"><button class="icon-btn" data-act="back" aria-label="Volver">${ico('back', 24)}</button><a href="#/u/${d.user.id}" class="chat-user">${avatar(d.user, 38)}<div><b>${esc(d.user.name)}</b><small>@${esc(d.user.username)}</small></div></a></div>
    <div class="chat-body" id="chat-body">${all.length ? withDays(all, me) : empty('send', 'Empieza la conversación', `Saluda a ${d.user.name.split(' ')[0]} 👋`)}</div>
    <form class="chat-form" data-form="send" data-uid="${uid}"><input name="text" placeholder="Escribe un mensaje…" autocomplete="off" maxlength="1000"><button class="send-btn" type="submit" aria-label="Enviar">${ico('send', 20)}</button></form></div>`;
  const body = $('#chat-body'); const down = () => { body.scrollTop = body.scrollHeight; window.scrollTo(0, document.body.scrollHeight); }; down();
  const poll = setInterval(async () => {
    if (!$('#chat-body') || document.hidden) return;
    try { const n = await api('messages/' + uid); const sig = (x) => x.map((m) => m.id + (m.read ? 'r' : '')).join(); if (sig(n.messages) !== sig(all)) { const atEnd = body.scrollHeight - body.scrollTop - body.clientHeight < 120; all = n.messages; body.innerHTML = withDays(all, me); if (atEnd) down(); refreshCounters(); } } catch {}
  }, 4000);
  onCleanup(() => clearInterval(poll));
}, { name: 'chat', skeleton: false });
forms.send = async (f) => {
  const text = f.text.value.trim(); if (!text) return; f.text.value = '';
  const m = await api('messages/' + f.dataset.uid, { method: 'POST', body: { text } });
  const body = $('#chat-body'); body.querySelector('.empty')?.remove(); body.insertAdjacentHTML('beforeend', bubble(m, state.user.id)); body.scrollTop = body.scrollHeight; f.text.focus();
};

// ---------------------------------------------------------------- notificaciones
const NI = { like: ['heart', 'red'], comment: ['comment', ''], follow: ['user', ''], message: ['send', ''], challenge: ['bolt', 'orange'], result_approved: ['check', 'green'], result_rejected: ['x', 'red'],
  pr: ['trophy', 'orange'], pr_pending: ['clock', 'amber'], pr_rejected: ['x', 'red'], streak: ['flame', 'orange'], ranking: ['trophy', 'orange'], announcement: ['megaphone', 'orange'], order: ['bag', 'orange'], order_status: ['bag', 'green'], badge: ['star', 'orange'],
  approved: ['check', 'green'], pending: ['clock', 'amber'], entry_pending: ['clock', 'amber'], report: ['flag', 'red'], tag: ['at', ''], season: ['flame', 'orange'], points: ['star', 'orange'] };
route('/notificaciones', async (el) => {
  const list = await api('notifications');
  const row = (n) => { const [i, c] = NI[n.type] || ['bell', '']; return `<a class="notif ${n.read ? '' : 'new'}" href="${esc(n.link || '#/')}"><span class="n-ic ${c}">${n.actor_avatar ? avatar({ name: n.actor_name, avatar: n.actor_avatar }, 44) : ico(i, 20)}</span><div class="grow"><span>${esc(n.text)}</span><small>${ago(n.created_at)}</small></div>${n.read ? '' : '<i class="dot-new"></i>'}</a>`; };
  const fresh = list.filter((n) => !n.read), old = list.filter((n) => n.read);
  el.innerHTML = `<div class="page-head"><h2>Notificaciones</h2>${fresh.length ? `<button class="btn sm ghost" data-act="readAll">Marcar todo como leído</button>` : ''}</div>
    ${list.length ? `${fresh.length ? `<h4 class="blk-h">Nuevas</h4><div class="card list-card">${fresh.map(row).join('')}</div>` : ''}${old.length ? `<h4 class="blk-h">Anteriores</h4><div class="card list-card">${old.map(row).join('')}</div>` : ''}` : empty('bell', 'Todo tranquilo por aquí', 'Aquí verás likes, comentarios, retos y resultados')}`;
  if (fresh.length) { await api('notifications/read', { method: 'POST' }); refreshCounters(); }
}, { name: 'notifications' });
actions.readAll = async () => { await api('notifications/read', { method: 'POST' }); $$('.notif.new').forEach((n) => n.classList.remove('new')); $$('.dot-new').forEach((n) => n.remove()); refreshCounters(); };
