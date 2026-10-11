// Tienda: catálogo, detalle (modelo + talla), pedido/reserva, mis pedidos y gestión para administración
import { $, $$, esc, api, postForm, state, ico, avatar, ago, empty, toast, sheet, confirmBox, actions, forms, route, render, isStaff, chip, formObj } from './core.js';
import { shrink } from './compose.js';

let info = { currency: '$', whatsapp: false, recipient: null };
const money = (n) => (n == null ? '' : `${info.currency}${Number(n).toFixed(2)}`);
const modeName = (m) => (m === 'reserva' ? 'Reserva' : 'Pedido');
const ST = { nuevo: ['Nuevo', 'amber'], confirmado: ['Confirmado', 'orange'], preparando: ['En preparación', 'orange'], listo: ['Listo para recoger', 'green'], entregado: ['Entregado', 'green'], cancelado: ['Cancelado', 'red'] };
const PAY = { pendiente: ['Pago pendiente', 'amber'], revision: ['Pago en revisión', 'amber'], confirmado: ['Pago confirmado', 'green'], rechazado: ['Comprobante rechazado', 'red'] };
const stChip = (s) => chip(ST[s]?.[0] || s, (ST[s]?.[1] || '') + ' sm');
const payChip = (s) => chip(PAY[s]?.[0] || s, (PAY[s]?.[1] || '') + ' sm');
const STEPS = ['Pedido', 'Pago', 'Preparando', 'Listo', 'Entregado'];
function tracker(o) {
  if (o.status === 'cancelado') return '';
  const done = [true, o.pay_status === 'confirmado', ['preparando', 'listo', 'entregado'].includes(o.status), ['listo', 'entregado'].includes(o.status), o.status === 'entregado'];
  const cur = done.lastIndexOf(true);
  return `<div class="track">${STEPS.map((n, i) => `<span class="${done[i] ? 'done' : ''} ${i === cur ? 'now' : ''}"><i></i><small>${n}</small></span>`).join('')}</div>`;
}
const stockChip = (p, long) => !p.level ? '' : p.level === 'out' ? chip('Agotado', 'red sm') : p.level === 'low' ? chip(long ? `¡Quedan ${p.stock}!` : `Quedan ${p.stock}`, 'red sm') : chip(long ? `Disponible · ${p.stock}` : `${p.stock} disp.`, 'green sm');
const waLink = (p) => { const d = String(p || '').replace(/\D/g, ''); return d.length >= 8 ? `https://wa.me/${d}` : ''; };

// ---------------------------------------------------------------- catálogo
route('/tienda', async (el) => {
  const [list, inf] = await Promise.all([api('store/products'), api('store/info')]); info = inf;
  const card = (p) => `<a class="shop-card" href="#/tienda/${p.id}"><div class="shop-img"><img src="${esc(p.images[0]?.url || '')}" alt="${esc(p.name)}" loading="lazy">
    <span class="shop-mode ${p.mode}">${modeName(p.mode)}</span>${p.images.length > 1 ? `<i class="shop-n">${p.images.length} modelos</i>` : ''}</div>
    <b>${esc(p.name)}</b><span class="row between shop-pr"><span class="shop-price">${money(p.price)}</span>${stockChip(p)}</span></a>`;
  el.innerHTML = `<div class="page-head"><h2>Tienda</h2><div class="row gap"><a class="btn sm ghost" href="#/tienda/pedidos">${ico('bag', 14)} Mis pedidos</a>${isStaff() ? '<a class="btn sm" href="#/admin/tienda">Gestionar</a>' : ''}</div></div>
    <p class="muted shop-intro">Prendas oficiales de RADICAL CLUB. Elige el modelo y tu talla; el pedido le llega a la tienda por mensaje en la app.</p>
    ${list.length ? `<div class="shop-grid">${list.map(card).join('')}</div>` : empty('bag', 'Aún no hay prendas', 'Pronto publicaremos nuevos modelos')}`;
}, { name: 'store' });

// ---------------------------------------------------------------- detalle
let D = null; const LAST = {};
route('/tienda/(\\d+)', async (el, id) => {
  const [p, inf] = await Promise.all([api('store/products/' + id), api('store/info')]); info = inf;
  D = { p, model: 0, size: p.sizes.length === 1 ? p.sizes[0] : '', qty: 1 }; drawDetail(el);
}, { name: 'product' });
function drawDetail(el = $('#view')) {
  const { p } = D; const img = p.images[D.model];
  el.innerHTML = `<div class="shop-detail"><div class="shop-hero"><button class="icon-btn shop-back" data-act="back" aria-label="Volver">${ico('back', 22)}</button><img src="${esc(img?.url || '')}" alt="${esc(p.name)}"></div>
    <div class="shop-info">
      <div class="row between"><h2>${esc(p.name)}</h2><b class="shop-price lg">${money(p.price)}</b></div>
      <div class="row gap wrap">${chip(modeName(p.mode), p.mode === 'reserva' ? 'orange sm' : 'sm')}${p.category ? chip(esc(p.category), 'sm') : ''}${stockChip(p, true)}${p.active ? '' : chip('Oculta', 'red sm')}</div>
      ${p.description ? `<p class="shop-desc">${esc(p.description)}</p>` : ''}
      ${p.images.length ? `<h4 class="blk-h flat">Modelo <small class="muted">· ${esc(img?.label || 'Elige uno')}</small></h4>
        <div class="model-row">${p.images.map((m, i) => `<button class="model ${i === D.model ? 'on' : ''}" data-act="shopModel" data-i="${i}" aria-label="${esc(m.label || 'Modelo ' + (i + 1))}"><img src="${esc(m.url)}" alt=""><span>${esc(m.label || 'Modelo ' + (i + 1))}</span></button>`).join('')}</div>` : ''}
      ${p.sizes.length ? `<h4 class="blk-h flat">Talla</h4><div class="size-row">${p.sizes.map((s) => `<button class="size ${s === D.size ? 'on' : ''}" data-act="shopSize" data-s="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      <form class="form shop-form" data-form="shopOrder">
        <div class="qty-row"><span>Cantidad</span><div class="qty"><button type="button" data-act="shopQty" data-d="-1" aria-label="Menos">−</button><b>${D.qty}</b><button type="button" data-act="shopQty" data-d="1" aria-label="Más">+</button></div><b class="shop-total">${money((p.price || 0) * D.qty)}</b></div>
        <label>Tu WhatsApp o teléfono (opcional)<input name="phone" inputmode="tel" maxlength="20" value="${esc(state.user.phone || '')}" placeholder="Ej. 0991234567"></label>
        <label>Nota (opcional)<input name="note" maxlength="300" placeholder="Ej. Lo retiro el viernes"></label>
        <button class="btn block lg" type="submit" ${p.level === 'out' ? 'disabled' : ''}>${ico('bag', 18)} ${p.level === 'out' ? 'Agotado' : p.mode === 'reserva' ? 'Reservar' : 'Hacer pedido'}</button>
        <p class="muted center sm">Se enviará un mensaje a la tienda con tu modelo, talla y datos.</p>
      </form></div></div>`;
}
actions.shopModel = (el) => { D.model = +el.dataset.i; keepForm(); };
actions.shopSize = (el) => { D.size = el.dataset.s; keepForm(); };
actions.shopQty = (el) => { D.qty = Math.min(D.p.stock != null ? Math.max(1, D.p.stock) : 20, Math.max(1, D.qty + +el.dataset.d)); keepForm(); };
function keepForm() { const f = $('.shop-form'); const v = f ? { phone: f.phone.value, note: f.note.value } : {}; const y = window.scrollY; drawDetail(); if (v.phone !== undefined) { $('.shop-form').phone.value = v.phone; $('.shop-form').note.value = v.note; } window.scrollTo(0, y); }
forms.shopOrder = async (f) => {
  const { p } = D;
  if (p.sizes.length && !D.size) { toast('Elige una talla'); $('.size-row')?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
  const r = await api('store/orders', { method: 'POST', body: { product_id: p.id, model: D.model, size: D.size, qty: D.qty, note: f.note.value, phone: f.phone.value } });
  state.user.phone = f.phone.value; const o = r.order;
  const s = sheet(`<div class="order-ok"><span class="ok-ic">${ico('check', 30)}</span><h3>¡${modeName(o.kind)} enviado!</h3><p class="muted">Avisamos a la tienda con tu modelo y talla.</p>
    <div class="order-card"><img src="${esc(o.image)}" alt=""><div><b>${esc(o.product)}</b><small>${esc(o.model || '')}${o.model ? ' · ' : ''}Talla ${esc(o.size || 'única')} · x${o.qty}</small><small class="orange">${money((o.price || 0) * o.qty)}</small></div></div>
    <button class="btn block lg" data-act="shopPay" data-id="${o.id}" data-close>${ico('image', 18)} Subir comprobante de pago</button>
    ${r.recipient ? `<a class="btn block ghost" href="#/mensajes/${r.recipient.id}" data-close>${ico('send', 18)} Ver mensaje en la app</a>` : ''}
    ${r.whatsapp ? `<a class="btn block ghost" href="${esc(r.whatsapp)}" target="_blank" rel="noopener" data-close>${ico('comment', 18)} Enviar también por WhatsApp</a>` : ''}
    <a class="btn block ghost" href="#/tienda/pedidos" data-close>Mis pedidos</a></div>`, { title: '' });
  s.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) s.close(); });
  LAST[o.id] = o; D.qty = 1; drawDetail();
};

// ---------------------------------------------------------------- mis pedidos
let MY = [];
route('/tienda/pedidos', async (el) => {
  const [list, inf] = await Promise.all([api('store/orders'), api('store/info')]); info = inf; MY = list;
  const card = (o) => `<div class="card ord2"><div class="ord"><img src="${esc(o.image)}" alt=""><div class="grow"><b>${esc(o.product)}</b><small class="muted block">${esc(o.model || '')}${o.model ? ' · ' : ''}Talla ${esc(o.size || 'única')} · x${o.qty} · ${money((o.price || 0) * o.qty)}</small><small class="muted block">${modeName(o.kind)} · ${ago(o.created_at)}</small></div><div class="ord-r">${stChip(o.status)}</div></div>
    ${o.status === 'listo' ? `<div class="ready">🎉 <b>¡Ya puedes recoger tu prenda!</b>${o.status_note ? `<small>${esc(o.status_note)}</small>` : ''}</div>` : o.status_note && o.status !== 'cancelado' ? `<div class="snote">${ico('bell', 14)} ${esc(o.status_note)}</div>` : ''}
    ${tracker(o)}
    ${o.status === 'cancelado' ? '' : `<div class="pay-row">${payChip(o.pay_status)}${o.pay_status === 'confirmado' ? '' : o.pay_status === 'revision' ? `<button class="btn sm ghost" data-act="shopProof" data-id="${o.id}">Ver comprobante</button>` : `<button class="btn sm" data-act="shopPay" data-id="${o.id}">${ico('image', 14)} Subir comprobante</button>`}</div>${o.pay_status === 'rechazado' && o.pay_note ? `<div class="snote bad">${esc(o.pay_note)}</div>` : ''}`}
    ${o.status === 'nuevo' ? `<div class="row"><button class="btn sm ghost danger-t" data-act="shopCancel" data-id="${o.id}">Cancelar pedido</button></div>` : ''}</div>`;
  el.innerHTML = `<div class="page-head"><button class="icon-btn" data-act="back" aria-label="Volver">${ico('back', 24)}</button><h2>Mis pedidos</h2><a class="btn sm ghost" href="#/tienda">Tienda</a></div>
    ${list.length ? list.map(card).join('') : empty('bag', 'Aún no tienes pedidos', 'Elige una prenda en la tienda')}`;
}, { name: 'orders' });
actions.shopProof = (el) => { const o = MY.find((x) => x.id === +el.dataset.id); sheet(`<img class="proof-img" src="${esc(o.pay_proof)}" alt="Comprobante"><p class="muted center sm">Tu comprobante está en revisión. Te avisaremos cuando se confirme.</p>`, { title: 'Comprobante de pago' }); };
actions.shopPay = async (el) => {
  const id = +el.dataset.id; let o = MY.find((x) => x.id === id) || LAST[id];
  if (!o) { MY = await api('store/orders'); o = MY.find((x) => x.id === id); }
  if (!info.payment_info && info.payment_info !== '') info = await api('store/info');
  sheet(`<form class="form" data-form="shopProofUp" data-id="${id}">
    <div class="order-card"><img src="${esc(o.image)}" alt=""><div><b>${esc(o.product)}</b><small>Talla ${esc(o.size || 'única')} · x${o.qty}</small><small class="orange">Total a pagar: ${money((o.price || 0) * o.qty)}</small></div></div>
    ${info.payment_info ? `<div class="pay-info"><small class="muted">Datos para el pago</small><p>${esc(info.payment_info)}</p></div>` : ''}
    ${o.pay_status === 'rechazado' && o.pay_note ? `<div class="snote bad">${esc(o.pay_note)}</div>` : ''}
    <label class="drop proof-drop"><span class="drop-prev" id="proof-prev"></span><span class="drop-hint">${ico('camera', 28)}<b>Foto o captura del comprobante</b><small>Toca para elegir de tu galería o tomar una foto</small></span><input type="file" name="proof" accept="image/*" hidden required></label>
    <button class="btn block lg" type="submit">Enviar comprobante</button></form>`, { title: 'Pago del pedido' });
  $('.proof-drop input').addEventListener('change', (e) => { const f = e.target.files[0]; $('#proof-prev').innerHTML = f ? `<img src="${URL.createObjectURL(f)}" alt="">` : ''; e.target.closest('.drop').classList.toggle('has', !!f); });
};
forms.shopProofUp = async (f) => {
  const file = f.proof.files[0]; if (!file) { toast('Elige la foto del comprobante'); return; }
  const g = await shrink(file, 1400); const fd = new FormData(); fd.append('proof', g, g.name);
  await postForm(`store/orders/${f.dataset.id}/payment`, fd); $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll');
  toast('Comprobante enviado. Lo revisaremos pronto', 'ok'); if (location.hash.includes('pedidos')) render(); else location.hash = '#/tienda/pedidos';
};
actions.shopCancel = async (el) => { if (!(await confirmBox('¿Cancelar este pedido?', 'Cancelar pedido', true))) return; await api('store/orders/' + el.dataset.id, { method: 'PUT', body: { status: 'cancelado' } }); toast('Pedido cancelado'); render(); };

// ================================================================= Administración
let sec = 'orders', ofil = 'nuevo';
const seg = (opts, cur, act) => `<div class="seg">${opts.map(([k, n]) => `<button class="${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${n}</button>`).join('')}</div>`;
export async function adminStore(box) {
  info = await api('store/info');
  box.innerHTML = `${seg([['orders', 'Pedidos'], ['products', 'Prendas'], ['settings', 'Ajustes']], sec, 'stSec')}<div id="st-body"></div>`;
  const b = $('#st-body');
  if (sec === 'orders') await ordersView(b); else if (sec === 'products') await productsView(b); else await settingsView(b);
}
actions.stSec = (el) => { sec = el.dataset.v; adminStore($('#ad-body')); };

let AO = [];
async function ordersView(b) {
  const list = await api('store/orders?all=1' + (ofil ? '&status=' + ofil : '')); AO = list;
  b.innerHTML = `<div class="scroller">${seg([['nuevo', 'Nuevos'], ['confirmado', 'Confirmados'], ['preparando', 'En preparación'], ['listo', 'Listos'], ['entregado', 'Entregados'], ['cancelado', 'Cancelados'], ['', 'Todos']], ofil, 'stOF')}</div>
    ${list.length ? list.map((o) => `<div class="card rev"><div class="rev-h"><img class="ord-img" src="${esc(o.image)}" alt=""><div class="grow"><b>${esc(o.product)}</b> ${stChip(o.status)} ${o.status === 'cancelado' ? '' : payChip(o.pay_status)}
      <small class="muted block">${esc(o.model || '')}${o.model ? ' · ' : ''}<b>Talla ${esc(o.size || 'única')}</b> · x${o.qty} · ${money((o.price || 0) * o.qty)} · ${modeName(o.kind)}</small>
      <a class="row gap buyer" href="#/u/${o.buyer.id}">${avatar(o.buyer, 22)}<small>${esc(o.buyer.name)} · @${esc(o.buyer.username)}</small></a>
      ${o.phone ? `<small class="muted block">Contacto: ${waLink(o.phone) ? `<a class="orange" href="${waLink(o.phone)}" target="_blank" rel="noopener">${esc(o.phone)}</a>` : esc(o.phone)}</small>` : ''}${o.note ? `<small class="muted block">“${esc(o.note)}”</small>` : ''}${o.status_note ? `<small class="block">Aviso al miembro: <i>${esc(o.status_note)}</i></small>` : ''}<small class="muted block">${ago(o.created_at)}</small></div>
      ${o.pay_proof ? `<button class="proof-th" data-act="stProof" data-id="${o.id}" aria-label="Ver comprobante"><img src="${esc(o.pay_proof)}" alt=""></button>` : ''}</div>
      <div class="row gap wrap"><a class="btn sm ghost" href="#/mensajes/${o.buyer.id}">${ico('send', 14)} Escribir</a>
      ${o.pay_status === 'revision' ? `<button class="btn sm" data-act="stProof" data-id="${o.id}">Revisar pago</button>` : ''}
      ${o.status === 'cancelado' ? `<button class="btn sm ghost" data-act="stState" data-id="${o.id}">Reabrir</button>` : o.status === 'entregado' ? '' : `<button class="btn sm ${o.pay_status === 'revision' ? 'ghost' : ''}" data-act="stState" data-id="${o.id}">Cambiar estado</button>`}</div></div>`).join('') : empty('bag', 'No hay pedidos en esta vista')}`;
}
const closeSheets = () => { $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll'); };
actions.stProof = (el) => {
  const o = AO.find((x) => x.id === +el.dataset.id);
  sheet(`<img class="proof-img" src="${esc(o.pay_proof)}" alt="Comprobante"><div class="order-card"><div><b>${esc(o.buyer.name)}</b><small>${esc(o.product)} · x${o.qty}</small><small class="orange">A cobrar: ${money((o.price || 0) * o.qty)}</small></div></div>
    ${o.pay_status === 'confirmado' ? `<p class="center">${payChip('confirmado')}</p>` : `<form class="form" data-form="stPayRej" data-id="${o.id}"><input name="note" maxlength="200" placeholder="Motivo si lo rechazas (ej. el monto no coincide)">
      <div class="grid2"><button class="btn lg" type="button" data-act="stPayOk" data-id="${o.id}">Confirmar pago</button><button class="btn lg ghost danger-t" type="submit">Rechazar</button></div></form>`}`, { title: 'Comprobante de pago' });
};
actions.stPayOk = async (el) => { await api(`store/orders/${el.dataset.id}/payment`, { method: 'PUT', body: { action: 'confirm' } }); closeSheets(); toast('Pago confirmado y miembro avisado', 'ok'); render(); };
forms.stPayRej = async (f) => { await api(`store/orders/${f.dataset.id}/payment`, { method: 'PUT', body: { action: 'reject', note: f.note.value } }); closeSheets(); toast('Comprobante rechazado; se avisó al miembro'); render(); };
const STATE_HELP = { nuevo: 'Pedido recién recibido', confirmado: 'Pedido aceptado', preparando: 'Se está fabricando o alistando', listo: '“¡Ya puedes recoger tu prenda!”', entregado: 'El miembro ya la recibió', cancelado: 'Se devuelve el stock' };
actions.stState = (el) => {
  const o = AO.find((x) => x.id === +el.dataset.id);
  sheet(`<form class="form" data-form="stStateSave" data-id="${o.id}"><p class="muted sm">${esc(o.product)} · ${esc(o.buyer.name)}. El miembro recibe una notificación con el nuevo estado.</p>
    <div class="state-list">${Object.keys(ST).map((k) => `<label class="state-opt"><input type="radio" name="status" value="${k}" ${k === o.status ? 'checked' : ''}><span><b>${ST[k][0]}</b><small>${STATE_HELP[k]}</small></span></label>`).join('')}</div>
    <label>Mensaje para el miembro (opcional)<input name="note" maxlength="200" value="${esc(o.status_note || '')}" placeholder="Ej. Retíralo en recepción de 8 a 20 h"></label>
    <button class="btn block lg" type="submit">Guardar y avisar</button></form>`, { title: 'Estado del pedido', full: true });
};
forms.stStateSave = async (f) => { await api('store/orders/' + f.dataset.id, { method: 'PUT', body: { status: f.status.value, note: f.note.value } }); closeSheets(); toast('Estado actualizado', 'ok'); render(); };
actions.stOF = (el) => { ofil = el.dataset.v; adminStore($('#ad-body')); };
actions.stOrder = async (el) => { if (el.dataset.st === 'cancelado' && !(await confirmBox('¿Cancelar este pedido? Se avisará al miembro.', 'Cancelar pedido', true))) return; await api('store/orders/' + el.dataset.id, { method: 'PUT', body: { status: el.dataset.st } }); toast('Pedido actualizado', 'ok'); render(); };

let PL = [];
async function productsView(b) {
  PL = await api('store/products?all=1');
  b.innerHTML = `<button class="btn block" data-act="stProdNew">${ico('plus', 18)} Nueva prenda</button>${PL.length ? PL.map((p) => `<div class="card rev"><div class="rev-h"><img class="ord-img" src="${esc(p.images[0]?.url || '')}" alt=""><div class="grow"><b>${esc(p.name)}</b> ${p.active ? '' : chip('Oculta', 'red sm')}
    <small class="muted block">${money(p.price)} · ${modeName(p.mode)} · ${p.images.length} ${p.images.length === 1 ? 'modelo' : 'modelos'}</small><small class="muted block">Tallas: ${esc(p.sizes.join(', ') || '—')}</small></div>${stockBox(p)}</div>
    <div class="row gap wrap"><button class="btn sm ghost" data-act="stProdEdit" data-id="${p.id}">Editar</button><button class="btn sm ghost" data-act="stProdToggle" data-id="${p.id}">${p.active ? 'Ocultar' : 'Mostrar'}</button><button class="btn sm ghost danger-t" data-act="stProdDel" data-id="${p.id}">Eliminar</button></div></div>`).join('') : empty('bag', 'Aún no hay prendas', 'Crea la primera con sus fotos y tallas')}`;
}
const stockBox = (p) => `<div class="stock-box ${p.level}"><small>Stock</small><b>${p.stock == null ? '∞' : p.stock}</b>${p.stock == null ? '' : `<span class="stock-adj"><button data-act="stAdj" data-id="${p.id}" data-d="-1" aria-label="Restar">−</button><button data-act="stAdj" data-id="${p.id}" data-d="1" aria-label="Sumar">+</button></span><small>alerta ≤ ${p.low_stock}</small>`}</div>`;
actions.stAdj = async (el) => { const p = PL.find((x) => x.id === +el.dataset.id); await api('store/products/' + p.id, { method: 'PUT', body: { stock: String(Math.max(0, p.stock + +el.dataset.d)) } }); render(); };
let PF = null;
actions.stProdNew = () => prodForm(null);
actions.stProdEdit = (el) => prodForm(PL.find((p) => p.id === +el.dataset.id));
actions.stProdToggle = async (el) => { const p = PL.find((x) => x.id === +el.dataset.id); await api('store/products/' + p.id, { method: 'PUT', body: { active: p.active ? '0' : '1' } }); toast(p.active ? 'Prenda oculta' : 'Prenda visible', 'ok'); render(); };
actions.stProdDel = async (el) => { if (!(await confirmBox('¿Eliminar esta prenda? Los pedidos anteriores se conservan.', 'Eliminar', true))) return; await api('store/products/' + el.dataset.id, { method: 'DELETE' }); toast('Prenda eliminada'); render(); };
function photoList() {
  $('#pf-list').innerHTML = [...PF.keep.map((k, i) => ({ src: k.url, label: k.label, t: 'k', i })), ...PF.fresh.map((f, i) => ({ src: f.preview, label: f.label, t: 'f', i }))]
    .map((x) => `<div class="pf-row"><img src="${esc(x.src)}" alt=""><input data-pf="${x.t}" data-i="${x.i}" value="${esc(x.label)}" maxlength="30" placeholder="Nombre del modelo (ej. Negro)"><button type="button" class="icon-btn" data-act="pfDel" data-t="${x.t}" data-i="${x.i}" aria-label="Quitar foto">${ico('x', 18)}</button></div>`).join('') || '<p class="muted sm">Sube una foto por cada modelo o color.</p>';
}
function prodForm(p) {
  PF = { keep: p ? p.images.map((x) => ({ ...x })) : [], fresh: [], id: p?.id };
  const s = sheet(`<form class="form" data-form="stProd">
    <label>Nombre de la prenda<input name="name" value="${esc(p?.name || '')}" maxlength="80" required></label>
    <label>Descripción<textarea name="description" rows="3" maxlength="800">${esc(p?.description || '')}</textarea></label>
    <div class="grid2"><label>Precio (${esc(info.currency)})<input name="price" type="number" step="0.01" min="0" value="${p?.price ?? ''}" inputmode="decimal"></label>
      <label>Categoría<input name="category" value="${esc(p?.category || '')}" maxlength="30" placeholder="Camisetas, Hoodies…"></label></div>
    <div class="grid2"><label>Stock (unidades)<input name="stock" type="number" min="0" inputmode="numeric" value="${p?.stock ?? ''}" placeholder="Vacío = sin control"></label>
      <label>Stock bajo cuando queden ≤<input name="low_stock" type="number" min="0" inputmode="numeric" value="${p?.low_stock ?? 5}"></label></div>
    <p class="muted sm stock-help">El contador se muestra en verde mientras haya más unidades que ese límite y en rojo cuando queden pocas o se agote. Se descuenta solo con cada pedido y vuelve si se cancela.</p>
    <label>Tallas disponibles (separadas por coma)<input name="sizes" value="${esc((p?.sizes || ['S', 'M', 'L', 'XL']).join(', '))}" maxlength="80" placeholder="S, M, L, XL"></label>
    <label>Tipo<select name="mode"><option value="pedido" ${p?.mode !== 'reserva' ? 'selected' : ''}>Pedido (venta directa)</option><option value="reserva" ${p?.mode === 'reserva' ? 'selected' : ''}>Reserva (se fabrica por tandas)</option></select></label>
    <h4 class="blk-h flat">Fotos / modelos</h4><div id="pf-list" class="pf-list"></div>
    <label class="file">${ico('image', 20)}<span>Agregar fotos</span><input type="file" id="pf-in" accept="image/*" multiple></label>
    <label class="check"><input type="checkbox" name="active" ${p && !p.active ? '' : 'checked'}><span>Visible en la tienda</span></label>
    <button class="btn block lg" type="submit">${p ? 'Guardar cambios' : 'Publicar prenda'}</button></form>`, { title: p ? 'Editar prenda' : 'Nueva prenda', full: true });
  photoList();
  $('#pf-in', s.el).addEventListener('change', (e) => { [...e.target.files].slice(0, 8).forEach((f) => PF.fresh.push({ file: f, label: '', preview: URL.createObjectURL(f) })); e.target.value = ''; photoList(); });
  s.el.addEventListener('input', (e) => { const t = e.target.dataset?.pf; if (!t) return; (t === 'k' ? PF.keep : PF.fresh)[+e.target.dataset.i].label = e.target.value; });
}
actions.pfDel = (el) => { (el.dataset.t === 'k' ? PF.keep : PF.fresh).splice(+el.dataset.i, 1); photoList(); };
forms.stProd = async (f) => {
  if (!PF.keep.length && !PF.fresh.length) { toast('Sube al menos una foto'); return; }
  const fd = new FormData(); ['name', 'description', 'price', 'category', 'sizes', 'mode', 'stock', 'low_stock'].forEach((k) => fd.set(k, f[k].value)); fd.set('active', f.active.checked ? '1' : '0');
  fd.set('keep', JSON.stringify(PF.keep)); fd.set('labels', JSON.stringify(PF.fresh.map((x) => x.label)));
  for (const x of PF.fresh) { const g = await shrink(x.file, 1400); fd.append('images', g, g.name); }
  await postForm(PF.id ? 'store/products/' + PF.id : 'store/products', fd, PF.id ? 'PUT' : 'POST');
  $$('.sheet-wrap').forEach((w) => w.remove()); document.body.classList.remove('noscroll'); toast(PF.id ? 'Prenda actualizada' : 'Prenda publicada', 'ok'); render();
};

async function settingsView(b) {
  const [s, us] = await Promise.all([api('admin/settings'), api('admin/users?status=active')]);
  const staff = us.filter((u) => ['owner', 'admin', 'coach'].includes(u.role));
  b.innerHTML = `<form class="card pad form" data-form="stSettings"><p class="muted sm">Los pedidos llegan como mensaje dentro de la app a la persona que elijas. Si además pones un número de WhatsApp, el miembro verá un botón para enviar el pedido por ahí también.</p>
    <label>Recibe los pedidos en la app<select name="store.recipient"><option value="">Dueño (automático)</option>${staff.map((u) => `<option value="${u.id}" ${String(s['store.recipient']) === String(u.id) ? 'selected' : ''}>${esc(u.name)} (@${esc(u.username)})</option>`).join('')}</select></label>
    <label>Datos de pago (los ve el miembro al pagar)<textarea name="store.payment_info" rows="3" maxlength="600" placeholder="Banco, tipo y número de cuenta, titular, cédula…">${esc(s['store.payment_info'] || '')}</textarea></label>
    <label>WhatsApp de la tienda<input name="store.whatsapp" inputmode="numeric" value="${esc(s['store.whatsapp'] || '')}" placeholder="593991234567" maxlength="16"><small class="muted">Con código de país y solo números. Déjalo vacío para no mostrar el botón de WhatsApp.</small></label>
    <label>Símbolo de moneda<input name="store.currency" value="${esc(s['store.currency'] || '$')}" maxlength="4"></label>
    <button class="btn block lg" type="submit">Guardar</button></form>`;
}
forms.stSettings = async (f) => { await api('admin/settings', { method: 'PUT', body: formObj(f) }); toast('Ajustes de la tienda guardados', 'ok'); };
