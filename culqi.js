const BASE = 'https://api.culqi.com/v2';

// ===== PRECIOS =====
// Precio por boleto en céntimos (200 = S/ 2.00). Para cambiarlo, edita solo esta línea.
const TIERS = [
  { min: 5, price: 200 } // S/ 2.00 por boleto, sin descuentos
];
const MIN_TICKETS = 5;
const MAX_AMOUNT = 200000; // S/ 2000: límite de Yape por pago en Culqi

function priceFor(quantity) {
  const tier = TIERS.find(t => quantity >= t.min);
  return tier ? tier.price * quantity : null;
}

async function request(method, path, body, extraHeaders = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Authorization': `Bearer ${process.env.CULQI_SECRET_KEY}`,
      'Content-Type': 'application/json',
      ...extraHeaders
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.user_message || data.merchant_message || `Culqi respondió ${res.status}`);
    err.culqi = data;
    throw err;
  }
  return data;
}

async function charge({ amount, email, cardId, description }) {
  const data = await request('POST', '/charges', {
    amount, currency_code: 'PEN', email, source_id: cardId, description
  });
  if (data.object !== 'charge') {
    const err = new Error(data.user_message || 'El pago requiere verificación adicional');
    err.culqi = data;
    throw err;
  }
  return data;
}

module.exports = { TIERS, MIN_TICKETS, MAX_AMOUNT, priceFor, charge };
