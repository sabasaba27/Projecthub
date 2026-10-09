const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(path.join(DATA_DIR, 'uploads'), { recursive: true });

const db = new DatabaseSync(path.join(DATA_DIR, 'classmarket.db'));
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE COLLATE NOCASE,
    email         TEXT NOT NULL UNIQUE COLLATE NOCASE,
    birthdate     TEXT,
    avatar        TEXT,
    password_hash TEXT NOT NULL,
    is_admin      INTEGER NOT NULL DEFAULT 0,
    points        REAL NOT NULL DEFAULT 1000,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token      TEXT PRIMARY KEY,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL
  );

  CREATE TABLE IF NOT EXISTS markets (
    id                  INTEGER PRIMARY KEY,
    title               TEXT NOT NULL,
    description         TEXT NOT NULL DEFAULT '',
    category            TEXT NOT NULL DEFAULT 'General',
    image               TEXT,
    end_date            TEXT,
    liquidity           REAL NOT NULL DEFAULT 100,
    status              TEXT NOT NULL DEFAULT 'open',
    resolved_outcome_id INTEGER,
    created_at          TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS outcomes (
    id        INTEGER PRIMARY KEY,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    label     TEXT NOT NULL,
    image     TEXT,
    position  INTEGER NOT NULL,
    shares    REAL NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS positions (
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    outcome_id INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    shares     REAL NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, outcome_id)
  );

  CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    market_id   INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    outcome_id  INTEGER NOT NULL REFERENCES outcomes(id) ON DELETE CASCADE,
    side        TEXT NOT NULL CHECK (side IN ('buy', 'sell')),
    shares      REAL NOT NULL,
    points      REAL NOT NULL,
    price_after REAL NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS price_history (
    id        INTEGER PRIMARY KEY,
    market_id INTEGER NOT NULL REFERENCES markets(id) ON DELETE CASCADE,
    ts        INTEGER NOT NULL,
    prices    TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS trades_market ON trades(market_id);
  CREATE INDEX IF NOT EXISTS trades_user ON trades(user_id);
  CREATE INDEX IF NOT EXISTS history_market ON price_history(market_id, ts);
`);

function tx(fn) {
  db.exec('BEGIN IMMEDIATE');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

module.exports = { db, tx, DATA_DIR };
