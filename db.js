const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function init() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS subscribers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      plan TEXT NOT NULL,
      tickets INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS raffles (
      id SERIAL PRIMARY KEY,
      prize TEXT NOT NULL,
      winner_subscriber_id INTEGER REFERENCES subscribers(id),
      drawn_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS phone TEXT;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS culqi_customer_id TEXT;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS culqi_card_id TEXT;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS next_billing_at TIMESTAMPTZ;
    ALTER TABLE subscribers ADD COLUMN IF NOT EXISTS failed_attempts INTEGER NOT NULL DEFAULT 0;

    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_name TEXT;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_email TEXT;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_phone TEXT;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS total_tickets INTEGER;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS participants INTEGER;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winning_ticket INTEGER;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_purchase_id INTEGER;

    -- Cada compra de boletos. raffle_id vacío = participa en el próximo sorteo.
    CREATE TABLE IF NOT EXISTS purchases (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT,
      quantity INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      charge_id TEXT,
      raffle_id INTEGER REFERENCES raffles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS purchases_charge_id_key ON purchases (charge_id);

    -- Sorteos gratis: cada persona se inscribe una sola vez y participa en todos
    CREATE TABLE IF NOT EXISTS entries (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      phone TEXT NOT NULL,
      instagram TEXT,
      consent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
    CREATE UNIQUE INDEX IF NOT EXISTS entries_email_key ON entries (LOWER(email));
    CREATE UNIQUE INDEX IF NOT EXISTS entries_phone_key ON entries (phone);

    -- Premios anunciados. status: pending (por sortear), drawn (sorteado), removed (quitado)
    CREATE TABLE IF NOT EXISTS prizes (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      image_url TEXT,
      position INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      raffle_id INTEGER REFERENCES raffles(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS kind TEXT;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS event_date DATE;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_entry_id INTEGER;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_instagram TEXT;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS birth_date DATE;
    ALTER TABLE entries ADD COLUMN IF NOT EXISTS tiktok TEXT;
    ALTER TABLE raffles ADD COLUMN IF NOT EXISTS winner_tiktok TEXT;
  `);
}

module.exports = { pool, init };
