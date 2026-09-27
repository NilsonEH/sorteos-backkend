const Database = require('better-sqlite3');
const db = new Database('sorteos.db');

db.exec(`
  CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    plan TEXT NOT NULL,           -- 'mensual' | 'anual'
    tickets INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active', -- 'active' | 'cancelled'
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS raffles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prize TEXT NOT NULL,
    winner_subscriber_id INTEGER,
    drawn_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (winner_subscriber_id) REFERENCES subscribers(id)
  );
`);

module.exports = db;
