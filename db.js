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
  `);
}

module.exports = { pool, init };
