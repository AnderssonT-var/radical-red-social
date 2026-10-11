// Envío de correo opcional (recuperación de contraseña). Se activa definiendo SMTP_HOST, SMTP_USER y SMTP_PASS.
// En Hostinger: crea una cuenta de correo (hPanel → Correos) y usa smtp.hostinger.com, puerto 465.
let transporter = null;
function configured() { return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS); }
function get() {
  if (!configured()) return null;
  if (!transporter) {
    const nodemailer = require('nodemailer'); const port = Number(process.env.SMTP_PORT || 465);
    transporter = nodemailer.createTransport({ host: process.env.SMTP_HOST, port, secure: port === 465, auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } });
  }
  return transporter;
}
async function send(to, subject, text, html) {
  const t = get(); if (!t) return false;
  try { await t.sendMail({ from: process.env.MAIL_FROM || `RADICAL <${process.env.SMTP_USER}>`, to, subject, text, html }); return true; }
  catch (e) { console.error('[mail]', e.message); return false; }
}
module.exports = { send, configured };
