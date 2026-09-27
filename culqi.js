const BASE = 'https://api.culqi.com/v2';

const PLANS = {
  mensual: { amount: 1900, tickets: 1, months: 1 },
  anual: { amount: 17900, tickets: 3, months: 12 }
};

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

async function findOrCreateCustomer({ firstName, lastName, email, phone }) {
  try {
    const customer = await request('POST', '/customers', {
      first_name: firstName,
      last_name: lastName,
      email,
      address: 'Lima, Peru',
      address_city: 'Lima',
      country_code: 'PE',
      phone_number: phone
    });
    return customer.id;
  } catch (err) {
    // Si el cliente ya existía en Culqi, lo buscamos por correo
    const list = await request('GET', `/customers?email=${encodeURIComponent(email)}`).catch(() => null);
    const found = list && list.data && list.data[0];
    if (found) return found.id;
    throw err;
  }
}

async function saveCard(customerId, tokenId) {
  const card = await request('POST', '/cards', { customer_id: customerId, token_id: tokenId });
  if (!card.id) {
    const err = new Error(card.user_message || 'No se pudo guardar la tarjeta');
    err.culqi = card;
    throw err;
  }
  return card.id;
}

async function charge({ amount, email, cardId, description, recurrent = false }) {
  const data = await request(
    'POST',
    '/charges',
    { amount, currency_code: 'PEN', email, source_id: cardId, description },
    recurrent ? { 'X-Charge-Channel': 'recurrent' } : {}
  );
  if (data.object !== 'charge') {
    const err = new Error(data.user_message || 'El cobro requiere verificación adicional');
    err.culqi = data;
    throw err;
  }
  return data;
}

module.exports = { PLANS, findOrCreateCustomer, saveCard, charge };
