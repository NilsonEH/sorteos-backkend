// Envío de correos con Brevo por HTTPS (Render gratis bloquea SMTP)
const BREVO_URL = 'https://api.brevo.com/v3/smtp/email';
const FROM = process.env.EMAIL_FROM || 'nadaesfake.sorteoscusco@gmail.com';
const FROM_NAME = 'Nada es Fake';
const SITE = 'https://nadaesfake.netlify.app';

const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const soles = c => 'S/ ' + (c / 100).toFixed(2);

// Sorteo cada 30 días a las 2:00 p.m. (hora de Lima), contando desde FIRST_DRAW_DATE (AAAA-MM-DD)
function nextDrawText() {
  const inicio = process.env.FIRST_DRAW_DATE;
  if (!inicio) return 'próximo mes';
  const [y, m, d] = inicio.split('-').map(Number);
  const ciclo = 30 * 24 * 60 * 60 * 1000;
  let fecha = Date.UTC(y, m - 1, d, 19, 0, 0); // 2:00 p.m. Lima = 19:00 UTC
  const ahora = Date.now();
  if (ahora >= fecha) fecha += (Math.floor((ahora - fecha) / ciclo) + 1) * ciclo;
  const f = new Date(fecha - 5 * 60 * 60 * 1000);
  const dias = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const meses = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio',
    'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
  return `${dias[f.getUTCDay()]} ${f.getUTCDate()} de ${meses[f.getUTCMonth()]}, 2:00 p.m.`;
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

module.exports = { sendPurchaseEmail, sendWinnerEmail };
