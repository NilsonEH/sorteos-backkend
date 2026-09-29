// Envío de correos con Brevo por HTTPS (Render gratis bloquea SMTP)
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM = process.env.EMAIL_FROM || 'nadaesfake.sorteoscusco@gmail.com';
const FROM_NAME = 'Nada es Fake';
const SITE = 'https://nadaesfake.netlify.app';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soles = c => 'S/ ' + (c / 100).toFixed(2);

// Próximo sorteo en hora de Lima (UTC-5, sin horario de verano).
// DRAW_DAYS: días de la semana separados por coma (0 = domingo, 1 = lunes ... 4 = jueves). Por defecto: lunes y jueves.
// DRAW_TIME: hora en formato 24 h. Por defecto: 14:00.
function nextDrawDate(now = Date.now()) {
  const days = (process.env.DRAW_DAYS || '1,4').split(',').map(n => parseInt(n, 10)).filter(n => n >= 0 && n <= 6);
  const [hh, mm] = (process.env.DRAW_TIME || '14:00').split(':').map(n => parseInt(n, 10) || 0);
  const limaNow = new Date(now - 5 * 60 * 60 * 1000);
  for (let add = 0; add <= 7; add++) {
    const d = new Date(Date.UTC(limaNow.getUTCFullYear(), limaNow.getUTCMonth(), limaNow.getUTCDate() + add, hh, mm));
    if (days.includes(d.getUTCDay()) && d.getTime() > limaNow.getTime()) return d;
  }
  return null;
}

function nextDrawText() {
  const f = nextDrawDate();
  if (!f) return 'próximo sorteo';
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  const h = f.getUTCHours(), m = f.getUTCMinutes();
  const hora = `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a.m.' : 'p.m.'}`;
  return `${dias[f.getUTCDay()]} ${f.getUTCDate()} de ${meses[f.getUTCMonth()]}, ${hora}`;
}

const layout = body => `
<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1c1238">
  ${body}
  <p style="font-size:13px;color:#6b5a8e;margin-top:24px">
    Nunca te pediremos pagos, contraseñas ni datos bancarios para entregarte un premio.
    Si alguien lo hace a nuestro nombre, es una estafa.
  </p>
  <p style="font-size:13px;color:#6b5a8e">Nada es Fake · <a href="${SITE}">${SITE.replace('https://', '')}</a></p>
</div>`;

// Nunca lanza errores: si falla, solo lo registra en los logs
async function send({ to, name, subject, html, text }) {
  const key = process.env.BREVO_API_KEY;
  if (!key) { console.error('Correo no enviado: falta BREVO_API_KEY'); return false; }
  try {
    const res = await fetch(BREVO_URL, {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({
        sender: { name: FROM_NAME, email: FROM },
        to: [{ email: to, name: name || undefined }],
        subject, htmlContent: html, textContent: text
      }),
      signal: AbortSignal.timeout(10000)
    });
    if (!res.ok) {
      console.error(`Correo a ${to} falló (${res.status}):`, await res.text().catch(() => ''));
      return false;
    }
    console.log(`Correo enviado a ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error(`Correo a ${to} falló:`, err.message);
    return false;
  }
}

async function sendPurchaseEmail({ email, name, quantity, amount, totalThisRound, chargeId }) {
  const draw = nextDrawText();
  const extra = totalThisRound > quantity ? ` En total tienes ${totalThisRound} boletos en este sorteo.` : '';
  return send({
    to: email, name,
    subject: `Tus ${quantity} boletos están confirmados`,
    html: layout(`
      <h2 style="color:#742284">¡Gracias por tu compra, ${esc(name)}!</h2>
      <p>Compraste <b>${quantity} boletos</b> por <b>${soles(amount)}</b> para el sorteo del <b>${draw}</b>${esc(extra)}</p>
      <p>¡Mucha suerte!</p>
      <p style="font-size:13px;color:#6b5a8e">Código de pago: ${esc(chargeId)}</p>`),
    text: `¡Gracias por tu compra, ${name}! Compraste ${quantity} boletos por ${soles(amount)} para el sorteo del ${draw}${extra} Código de pago: ${chargeId}`
  });
}

async function sendWinnerEmail({ email, name, prize, tickets, totalTickets }) {
  return send({
    to: email, name,
    subject: `¡Ganaste el sorteo: ${prize}!`,
    html: layout(`
      <h2 style="color:#742284">¡Felicidades, ${esc(name)}!</h2>
      <p>Ganaste el sorteo de <b>${esc(prize)}</b>. Participaste con ${tickets} de ${totalTickets} boletos.</p>
      <p>Te contactaremos por WhatsApp al número que registraste para coordinar la entrega.</p>`),
    text: `¡Felicidades, ${name}! Ganaste el sorteo de ${prize}. Participaste con ${tickets} de ${totalTickets} boletos. Te contactaremos por WhatsApp al número que registraste para coordinar la entrega.`
  });
}

// Fecha de hoy en Lima, por ejemplo "jueves 1 de octubre"
function todayText() {
  const f = new Date(Date.now() - 5 * 60 * 60 * 1000);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[f.getUTCDay()]} ${f.getUTCDate()} de ${meses[f.getUTCMonth()]}`;
}

const contactsTip = `<p style="font-size:13px;color:#6b5a8e">Para que nuestros avisos no lleguen a Spam, agrega <b>${FROM}</b> a tus contactos.</p>`;

// Sorteos gratis: confirmación de inscripción
async function sendEntryEmail({ email, name }) {
  const draw = nextDrawText();
  return send({
    to: email, name,
    subject: 'Nada es Fake: tu inscripción está confirmada',
    html: layout(`
      <h2 style="color:#742284">Hola, ${esc(name)}</h2>
      <p>Tu inscripción está confirmada. Te inscribiste <b>una sola vez</b> y ya participas en <b>todos</b> nuestros sorteos gratis.</p>
      <p>Próximo sorteo en vivo: <b>${draw}</b>.</p>
      <p>Si sales elegido, te avisamos por este correo y por WhatsApp. ¡Mucha suerte!</p>
      ${contactsTip}`),
    text: `Hola, ${name}. Tu inscripción está confirmada y ya participas en todos nuestros sorteos gratis. Próximo sorteo en vivo: ${draw}. Si sales elegido, te avisamos por este correo y por WhatsApp. Para que nuestros avisos no lleguen a Spam, agrega ${FROM} a tus contactos.`
  });
}

// Sorteos gratis: aviso al ganador (asunto sobrio para que no caiga en Spam)
async function sendFreeWinnerEmail({ email, name, prize }) {
  const hoy = todayText();
  return send({
    to: email, name,
    subject: `Nada es Fake: resultado del sorteo del ${hoy}`,
    html: layout(`
      <h2 style="color:#742284">Hola, ${esc(name)}</h2>
      <p>En el sorteo en vivo de hoy, ${hoy}, saliste elegido para el premio: <b>${esc(prize)}</b>. ¡Felicidades!</p>
      <p>Te escribiremos por WhatsApp al número que registraste para coordinar la entrega en Cusco.
      Tienes <b>15 días</b> para reclamar tu premio. La entrega es personal y debes mostrar tu DNI.</p>
      ${contactsTip}`),
    text: `Hola, ${name}. En el sorteo en vivo de hoy, ${hoy}, saliste elegido para el premio: ${prize}. Te escribiremos por WhatsApp para coordinar la entrega en Cusco. Tienes 15 días para reclamar tu premio; la entrega es personal y debes mostrar tu DNI.`
  });
}

module.exports = { sendPurchaseEmail, sendWinnerEmail, sendEntryEmail, sendFreeWinnerEmail, nextDrawText };
