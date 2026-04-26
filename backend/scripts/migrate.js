// scripts/migrate.js — Run DB schema migrations
// Usage: npm run migrate
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const dbPath  = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'cornerstone.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('⚙️  Running migrations on:', dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS contact_submissions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    phone       TEXT,
    subject     TEXT    NOT NULL,
    message     TEXT    NOT NULL,
    consent     INTEGER NOT NULL DEFAULT 0,
    ip_address  TEXT,
    created_at  TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admissions_enquiries (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_first_name TEXT NOT NULL,
    parent_last_name  TEXT NOT NULL,
    email             TEXT NOT NULL,
    phone             TEXT NOT NULL,
    child_first_name  TEXT NOT NULL,
    child_last_name   TEXT NOT NULL,
    child_dob         TEXT NOT NULL,
    applying_class    TEXT NOT NULL,
    intake            TEXT,
    message           TEXT,
    consent           INTEGER NOT NULL DEFAULT 0,
    status            TEXT NOT NULL DEFAULT 'new',
    ip_address        TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS donations (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    tx_ref          TEXT    NOT NULL UNIQUE,
    flw_ref         TEXT,
    amount          REAL    NOT NULL,
    currency        TEXT    NOT NULL DEFAULT 'UGX',
    designation     TEXT    NOT NULL DEFAULT 'general',
    first_name      TEXT    NOT NULL,
    last_name       TEXT    NOT NULL,
    email           TEXT    NOT NULL,
    phone           TEXT,
    payment_method  TEXT,
    anonymous       INTEGER NOT NULL DEFAULT 0,
    status          TEXT    NOT NULL DEFAULT 'pending',
    ip_address      TEXT,
    created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS admin_users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    email      TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password   TEXT    NOT NULL,
    role       TEXT    NOT NULL DEFAULT 'admin',
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sms_log (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id       TEXT,
    recipient_count INTEGER NOT NULL DEFAULT 0,
    failed_count    INTEGER NOT NULL DEFAULT 0,
    message         TEXT    NOT NULL,
    sent_by         TEXT,
    sent_at         TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_donations_tx_ref   ON donations(tx_ref);
  CREATE INDEX IF NOT EXISTS idx_donations_status    ON donations(status);
  CREATE INDEX IF NOT EXISTS idx_admissions_email    ON admissions_enquiries(email);
  CREATE INDEX IF NOT EXISTS idx_contact_email       ON contact_submissions(email);
`);

console.log('✅  Migrations complete.');
db.close();
