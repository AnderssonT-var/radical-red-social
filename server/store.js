// Tienda: catálogo de prendas, pedidos/reservas y aviso por mensaje interno (+ enlace opcional a WhatsApp)
const express = require('express');
const { db, getSetting } = require('./db');
const { L, active, staff, isStaff, upload, fileInfo, lite, clean, num } = require('./common');
const r = express.Router();

const STATUS = ['nuevo', 'confirmado', 'preparando', 'listo', 'entregado', 'cancelado'];
const parseImgs = (s) => { try { const a = JSON.parse(s); return Array.isArray(a) ? a : []; } catch { return []; } };
const parseSizes = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);
const cur = () => getSetting('store.currency') || '$';
function stockLevel(p) { if (p.stock == null) return ''; if (p.stock <= 0) return 'out'; return p.stock <= (p.low_stock ?? 5) ? 'low' : 'ok'; }
function prod(p) {
  return { id: p.id, name: p.name, description: p.description, price: p.price, category: p.category, sizes: parseSizes(p.sizes), mode: p.mode,
    images: parseImgs(p.images), stock: p.stock ?? null, low_stock: p.low_stock ?? 5, level: stockLevel(p), active: !!p.active, created_at: p.created_at };
}
function recipientId() {
  const id = Number(getSetting('store.recipient'));
  if (id && db.prepare("SELECT 1 FROM users WHERE id=? AND status='active'").get(id)) return id;
  return db.prepare("SELECT id FROM users WHERE role='owner' AND status='active' ORDER BY id LIMIT 1").get()?.id || db.prepare("SELECT id FROM users WHERE role='admin' AND status='active' ORDER BY id LIMIT 1").get()?.id || null;
}
function orderOut(o, withBuyer) {
  const out = { id: o.id, product_id: o.product_id, product: o.product_name, model: o.model_label, image: o.model_image, size: o.size, qty: o.qty, price: o.price,
    note: o.note, phone: o.phone, kind: o.kind, status: o.status, status_note: o.status_note, pay_status: o.pay_status, pay_proof: o.pay_proof, pay_note: o.pay_note, created_at: o.created_at };
  if (withBuyer) out.buyer = lite(db.prepare('SELECT * FROM users WHERE id=?').get(o.user_id));
  return out;
}
const money = (n) => (n == null ? '' : `${cur()}${Number(n).toFixed(2)}`);

// ---------- Catálogo ----------
r.get('/store/info', (req, res) => res.json({ currency: cur(), whatsapp: !!getSetting('store.whatsapp'), recipient: recipientId(), payment_info: getSetting('store.payment_info') || '' }));
r.get('/store/products', (req, res) => {
  const all = isStaff(req.user) && req.query.all === '1';
  res.json(db.prepare(`SELECT * FROM products WHERE deleted=0 ${all ? '' : 'AND active=1'} ORDER BY id DESC`).all().map(prod));
});
r.get('/store/products/:id', (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted=0').get(+req.params.id);
  if (!p || (!p.active && !isStaff(req.user))) return res.status(404).json({ error: 'Prenda no encontrada' });
  res.json(prod(p));
});

// ---------- Pedidos ----------
r.post('/store/orders', (req, res) => {
  const b = req.body || {}; const u = req.user;
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted=0 AND active=1').get(+b.product_id);
  if (!p) return res.status(404).json({ error: 'Prenda no disponible' });
  const imgs = parseImgs(p.images); const sizes = parseSizes(p.sizes);
  const mi = imgs.length ? Math.min(imgs.length - 1, Math.max(0, Math.round(num(b.model, 0)))) : -1;
  const size = clean(b.size, 12);
  if (sizes.length && !sizes.includes(size)) return res.status(400).json({ error: 'Elige una talla' });
  const qty = Math.min(20, Math.max(1, Math.round(num(b.qty, 1))));
  if (p.stock != null && p.stock < qty) return res.status(400).json({ error: p.stock <= 0 ? 'Esta prenda está agotada' : `Solo quedan ${p.stock} unidades` });
  const phone = clean(b.phone ?? u.phone, 20).replace(/[^\d+ ]/g, '');
  if (phone && phone !== u.phone) db.prepare('UPDATE users SET phone=? WHERE id=?').run(phone, u.id);
  const model = mi >= 0 ? imgs[mi] : { url: '', label: '' };
  const id = db.prepare('INSERT INTO orders(user_id,product_id,product_name,model_label,model_image,size,qty,price,note,phone,kind) VALUES(?,?,?,?,?,?,?,?,?,?,?)')
    .run(u.id, p.id, p.name, model.label || '', model.url || '', size, qty, p.price, clean(b.note, 300), phone, p.mode === 'reserva' ? 'reserva' : 'pedido').lastInsertRowid;
  const verb = p.mode === 'reserva' ? 'Reserva' : 'Pedido';
  if (p.stock != null) {
    db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(qty, p.id);
    const np = db.prepare('SELECT * FROM products WHERE id=?').get(p.id); const lv = stockLevel(np);
    if (lv !== 'ok' && stockLevel(p) === 'ok' || lv === 'out') db.prepare("SELECT id FROM users WHERE role IN ('admin','owner') AND status='active'").all()
      .forEach((a) => L.notify(a.id, 'order', lv === 'out' ? `⚠️ Agotado: ${p.name}` : `⚠️ Stock bajo: ${p.name} (quedan ${np.stock})`, '#/admin/tienda', u.id));
  }
  const rec = recipientId();
  const text = `${verb}: ${p.name}${model.label ? ' · ' + model.label : ''} · Talla ${size || 'única'} · x${qty}`;
  if (rec && rec !== u.id) db.prepare("INSERT INTO messages(from_id,to_id,text,kind,ref_id) VALUES(?,?,?,'order',?)").run(u.id, rec, text, id);
  db.prepare("SELECT id FROM users WHERE role IN ('admin','owner') AND status='active'").all()
    .forEach((a) => L.notify(a.id, 'order', `🛍️ ${u.name} hizo un ${verb.toLowerCase()}: ${p.name} (talla ${size || 'única'})`, '#/admin/tienda', u.id));
  const wa = getSetting('store.whatsapp');
  const waText = `Hola 👋 Quiero ${p.mode === 'reserva' ? 'reservar' : 'pedir'} en RADICAL CLUB:\n• Prenda: ${p.name}${model.label ? '\n• Modelo: ' + model.label : ''}\n• Talla: ${size || 'única'}\n• Cantidad: ${qty}${p.price != null ? '\n• Precio: ' + money(p.price * qty) : ''}\n• Nombre: ${u.name} (@${u.username})${phone ? '\n• Contacto: ' + phone : ''}${b.note ? '\n• Nota: ' + clean(b.note, 300) : ''}`;
  res.json({ ok: true, order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(id)), recipient: rec ? lite(db.prepare('SELECT * FROM users WHERE id=?').get(rec)) : null,
    whatsapp: wa ? `https://wa.me/${wa}?text=${encodeURIComponent(waText)}` : '' });
});
r.get('/store/orders', (req, res) => {
  if (isStaff(req.user) && req.query.all === '1') {
    const st = STATUS.includes(req.query.status) ? req.query.status : null;
    return res.json(db.prepare('SELECT * FROM orders WHERE (? IS NULL OR status=?) ORDER BY CASE status WHEN \'nuevo\' THEN 0 WHEN \'confirmado\' THEN 1 WHEN \'preparando\' THEN 2 WHEN \'listo\' THEN 3 ELSE 4 END, id DESC LIMIT 200').all(st, st).map((o) => orderOut(o, true)));
  }
  res.json(db.prepare('SELECT * FROM orders WHERE user_id=? ORDER BY id DESC LIMIT 100').all(req.user.id).map((o) => orderOut(o)));
});
r.put('/store/orders/:id', (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+req.params.id); if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  const st = req.body?.status; if (!STATUS.includes(st)) return res.status(400).json({ error: 'Estado no válido' });
  const mine = o.user_id === req.user.id;
  if (!isStaff(req.user) && !(mine && st === 'cancelado' && o.status === 'nuevo')) return res.status(403).json({ error: 'Sin permiso' });
  if (st !== o.status && (st === 'cancelado' || o.status === 'cancelado')) {
    const pr = db.prepare('SELECT * FROM products WHERE id=?').get(o.product_id);
    if (pr && pr.stock != null) {
      if (st === 'cancelado') db.prepare('UPDATE products SET stock=stock+? WHERE id=?').run(o.qty, pr.id);
      else if (pr.stock < o.qty) return res.status(400).json({ error: `No hay stock suficiente (quedan ${pr.stock})` });
      else db.prepare('UPDATE products SET stock=stock-? WHERE id=?').run(o.qty, pr.id);
    }
  }
  const note = isStaff(req.user) && req.body?.note != null ? clean(req.body.note, 200) : o.status_note;
  db.prepare("UPDATE orders SET status=?, status_note=?, updated_at=datetime('now') WHERE id=?").run(st, note, o.id);
  if (!mine && st !== o.status) {
    const what = `${o.product_name}${o.size ? ' (talla ' + o.size + ')' : ''}`;
    const msg = { confirmado: `Tu ${o.kind} de ${what} fue confirmado ✅`, preparando: `Tu ${o.kind} de ${what} está en preparación 🧵`, listo: `🎉 ¡Ya puedes recoger tu prenda! ${what}`,
      entregado: `Tu ${o.kind} de ${what} fue entregado. ¡A estrenar! 💪`, cancelado: `Tu ${o.kind} de ${what} fue cancelado`, nuevo: `Tu ${o.kind} de ${what} volvió a estado nuevo` }[st];
    L.notify(o.user_id, 'order_status', `🛍️ ${msg}${note && st !== 'cancelado' ? ' · ' + note : ''}`, '#/tienda/pedidos', req.user.id);
    if (st === 'listo') db.prepare("INSERT INTO messages(from_id,to_id,text,kind,ref_id) VALUES(?,?,?,'order',?)").run(req.user.id, o.user_id, `¡Ya puedes recoger tu prenda! ${what}${note ? ' · ' + note : ''}`, o.id);
  }
  res.json({ ok: true });
});

// ---------- Pago: comprobante del miembro y validación de administración
r.post('/store/orders/:id/payment', upload.single('proof'), (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=? AND user_id=?').get(+req.params.id, req.user.id); if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  if (o.status === 'cancelado') return res.status(400).json({ error: 'El pedido está cancelado' });
  if (o.pay_status === 'confirmado') return res.status(400).json({ error: 'El pago ya fue confirmado' });
  const f = fileInfo(req.file); if (f.type !== 'image') return res.status(400).json({ error: 'Sube una foto o captura del comprobante' });
  db.prepare("UPDATE orders SET pay_proof=?, pay_status='revision', pay_note='', updated_at=datetime('now') WHERE id=?").run(f.url, o.id);
  db.prepare("SELECT id FROM users WHERE role IN ('admin','owner') AND status='active'").all()
    .forEach((a) => L.notify(a.id, 'order', `💳 ${req.user.name} subió el comprobante de pago: ${o.product_name}`, '#/admin/tienda', req.user.id));
  res.json({ ok: true, order: orderOut(db.prepare('SELECT * FROM orders WHERE id=?').get(o.id)) });
});
r.put('/store/orders/:id/payment', staff, (req, res) => {
  const o = db.prepare('SELECT * FROM orders WHERE id=?').get(+req.params.id); if (!o) return res.status(404).json({ error: 'Pedido no encontrado' });
  const ok = req.body?.action === 'confirm'; const note = clean(req.body?.note, 200);
  if (!ok && req.body?.action !== 'reject') return res.status(400).json({ error: 'Acción no válida' });
  db.prepare("UPDATE orders SET pay_status=?, pay_note=?, status=CASE WHEN ?=1 AND status='nuevo' THEN 'confirmado' ELSE status END, updated_at=datetime('now') WHERE id=?").run(ok ? 'confirmado' : 'rechazado', ok ? '' : note, ok ? 1 : 0, o.id);
  L.notify(o.user_id, 'order_status', ok ? `✅ Pago confirmado: ${o.product_name}` : `❌ Comprobante rechazado: ${o.product_name}${note ? ' · ' + note : ''}. Sube uno nuevo.`, '#/tienda/pedidos', req.user.id);
  res.json({ ok: true });
});

// ---------- Gestión de prendas (administración) ----------
const IMG_FIELDS = upload.fields([{ name: 'images', maxCount: 8 }]);
function readImages(req, base) {
  let keep = []; try { keep = JSON.parse(req.body?.keep || '[]'); } catch {}
  keep = (Array.isArray(keep) ? keep : []).filter((k) => base.some((x) => x.url === k.url)).map((k) => ({ url: k.url, label: clean(k.label, 30) }));
  let labels = []; try { labels = JSON.parse(req.body?.labels || '[]'); } catch {}
  const fresh = (req.files?.images || []).map((f, i) => ({ url: fileInfo(f).url, label: clean(labels[i], 30) }));
  return [...keep, ...fresh].slice(0, 8);
}
function fields(b) {
  const sizes = parseSizes(String(b.sizes || '').replace(/[;\n]/g, ',')).slice(0, 12).map((s) => s.slice(0, 12)).join(',');
  const price = b.price === '' || b.price == null ? null : Math.max(0, num(b.price, 0));
  const stock = b.stock === '' || b.stock == null ? null : Math.max(0, Math.round(num(b.stock, 0)));
  const low = b.low_stock === '' || b.low_stock == null ? 5 : Math.max(0, Math.round(num(b.low_stock, 5)));
  return { stock, low_stock: low, name: clean(b.name, 80), description: clean(b.description, 800), price, category: clean(b.category, 30), sizes, mode: b.mode === 'reserva' ? 'reserva' : 'pedido', active: b.active === '0' ? 0 : 1 };
}
r.post('/store/products', staff, IMG_FIELDS, (req, res) => {
  const f = fields(req.body || {}); if (!f.name) return res.status(400).json({ error: 'Escribe el nombre de la prenda' });
  const imgs = readImages(req, []); if (!imgs.length) return res.status(400).json({ error: 'Sube al menos una foto' });
  const id = db.prepare('INSERT INTO products(name,description,price,category,sizes,mode,images,active,stock,low_stock) VALUES(?,?,?,?,?,?,?,?,?,?)').run(f.name, f.description, f.price, f.category, f.sizes, f.mode, JSON.stringify(imgs), f.active, f.stock, f.low_stock).lastInsertRowid;
  if (f.active) L.notifyAll('announcement', `🛍️ Nueva prenda en la tienda: ${f.name}`, `#/tienda/${id}`, req.user.id);
  res.json({ ok: true, id });
});
r.put('/store/products/:id', staff, IMG_FIELDS, (req, res) => {
  const p = db.prepare('SELECT * FROM products WHERE id=? AND deleted=0').get(+req.params.id); if (!p) return res.status(404).json({ error: 'No encontrada' });
  const f = fields({ ...p, ...req.body, sizes: req.body?.sizes ?? p.sizes, active: req.body?.active ?? String(p.active) });
  const imgs = req.body?.keep !== undefined || req.files?.images?.length ? readImages(req, parseImgs(p.images)) : parseImgs(p.images);
  if (!imgs.length) return res.status(400).json({ error: 'Deja al menos una foto' });
  db.prepare('UPDATE products SET name=?,description=?,price=?,category=?,sizes=?,mode=?,images=?,active=?,stock=?,low_stock=? WHERE id=?').run(f.name || p.name, f.description, f.price, f.category, f.sizes, f.mode, JSON.stringify(imgs), f.active, f.stock, f.low_stock, p.id);
  res.json({ ok: true });
});
r.delete('/store/products/:id', staff, (req, res) => { db.prepare('UPDATE products SET deleted=1 WHERE id=?').run(+req.params.id); res.json({ ok: true }); });

module.exports = r;
