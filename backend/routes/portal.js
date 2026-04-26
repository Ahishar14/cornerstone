// routes/portal.js — Parent Portal API
// JWT-protected endpoints for parents: announcements, notices, fees, calendar
'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const db       = require('../db');
const logger   = require('../middleware/logger');

const router = express.Router();

/* ================================================================
   SCHEMA — Portal tables (created on first load)
   ================================================================ */
db.exec(`
  CREATE TABLE IF NOT EXISTS parent_accounts (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    name         TEXT    NOT NULL,
    email        TEXT    NOT NULL UNIQUE COLLATE NOCASE,
    password     TEXT    NOT NULL,
    active       INTEGER NOT NULL DEFAULT 1,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS portal_children (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id    INTEGER NOT NULL REFERENCES parent_accounts(id),
    name         TEXT    NOT NULL,
    class_level  TEXT    NOT NULL,
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS announcements (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    title      TEXT    NOT NULL,
    body       TEXT    NOT NULL,
    priority   TEXT    NOT NULL DEFAULT 'normal',
    date       TEXT    NOT NULL DEFAULT (date('now')),
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS notices (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    date       TEXT    NOT NULL DEFAULT (date('now')),
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS fee_records (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id    INTEGER NOT NULL REFERENCES parent_accounts(id),
    child_name   TEXT    NOT NULL,
    term         TEXT    NOT NULL,
    year         TEXT    NOT NULL,
    amount       REAL    NOT NULL,
    status       TEXT    NOT NULL DEFAULT 'pending',
    created_at   TEXT    NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS calendar_events (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    event      TEXT    NOT NULL,
    date       TEXT    NOT NULL,
    note       TEXT,
    active     INTEGER NOT NULL DEFAULT 1,
    created_at TEXT    NOT NULL DEFAULT (datetime('now'))
  );
`);

/* Seed demo announcements / calendar if empty */
(function seedDemoData() {
  const hasAnnc = db.prepare('SELECT id FROM announcements LIMIT 1').get();
  if (!hasAnnc) {
    db.prepare(`INSERT INTO announcements (title, body, priority, date) VALUES (?,?,?,?)`).run(
      'Term 2 Begins — 3rd February 2025',
      'Dear Parents, Term 2 commences on Monday 3rd February 2025. Please ensure all fees are settled by 31st January to avoid disruption. The school gates open at 7:30 am.',
      'high', '2025-01-20'
    );
    db.prepare(`INSERT INTO announcements (title, body, priority, date) VALUES (?,?,?,?)`).run(
      'Cultural Day — 28th February',
      'Our annual Cultural Day will be held on Friday 28th February. Children are encouraged to come dressed in traditional Ugandan attire. More details to follow.',
      'normal', '2025-01-18'
    );
    db.prepare(`INSERT INTO notices (text, date) VALUES (?,?)`).run('Sports Day registration closes 10th February. Please return the consent form.', '2025-01-22');
    db.prepare(`INSERT INTO notices (text, date) VALUES (?,?)`).run('New library books have arrived — pupils may borrow up to 3 books per week.', '2025-01-15');
    db.prepare(`INSERT INTO calendar_events (event, date, note) VALUES (?,?,?)`).run('Term 2 Opens', '2025-02-03', 'Gates open 7:30 am');
    db.prepare(`INSERT INTO calendar_events (event, date, note) VALUES (?,?,?)`).run('Sports Day', '2025-02-20', 'All pupils participate');
    db.prepare(`INSERT INTO calendar_events (event, date, note) VALUES (?,?,?)`).run('Cultural Day', '2025-02-28', 'Traditional dress encouraged');
    db.prepare(`INSERT INTO calendar_events (event, date, note) VALUES (?,?,?)`).run('Parent–Teacher Conferences', '2025-03-14', 'Booking required via office');
    db.prepare(`INSERT INTO calendar_events (event, date, note) VALUES (?,?,?)`).run('Term 2 Ends', '2025-04-04', 'Half-day, dismiss at 12:00 pm');
  }
})();

/* ================================================================
   JWT MIDDLEWARE
   ================================================================ */
function requirePortalAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Please sign in.' });
  }
  try {
    req.parent = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Session expired. Please sign in again.' });
  }
}

/* ================================================================
  LOGIN
   ================================================================ */
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        // SYNTAX FIX: better-sqlite3 uses .prepare().get() and is synchronous
        const stmt = db.prepare('SELECT * FROM parent_accounts WHERE email = ?');
        const user = stmt.get(email);

        // PASSWORD FIX: Check for plain-text 'password123' OR a hashed match
        const isMatch = user && (password === user.password || await bcrypt.compare(password, user.password));

        if (!user || !isMatch) {
            return res.status(401).json({ success: false, message: 'Invalid email or password' });
        }

        // Keep your existing JWT_SECRET and token logic here
        const token = jwt.sign(
            { id: user.id, email: user.email },
            process.env.JWT_SECRET || 'fallback',
            { expiresIn: '24h' }
        );

        res.json({ success: true, token, parent: { id: user.id, name: user.name } });

    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ success: false, message: 'Server error' });
    }
});

/* ── Protected routes below ─────────────────────────────────── */
router.use(requirePortalAuth);

/* ================================================================
   CHILDREN
   ================================================================ */
router.get('/children', (req, res) => {
  const children = db.prepare('SELECT name, class_level FROM portal_children WHERE parent_id = ?').all(req.parent.id);
  res.json({ children });
});

/* ================================================================
   ANNOUNCEMENTS (all parents see same)
   ================================================================ */
router.get('/announcements', (req, res) => {
  const items = db.prepare(`SELECT * FROM announcements WHERE active = 1 ORDER BY date DESC LIMIT 10`).all();
  res.json({ items });
});

/* ================================================================
   NOTICES
   ================================================================ */
router.get('/notices', (req, res) => {
  const items = db.prepare(`SELECT * FROM notices WHERE active = 1 ORDER BY date DESC LIMIT 8`).all();
  res.json({ items });
});

/* ================================================================
   FEE RECORDS (parent-specific)
   ================================================================ */
router.get('/fees', (req, res) => {
  const items = db.prepare(`
    SELECT child_name, term, year, amount, status FROM fee_records
    WHERE parent_id = ? ORDER BY year DESC, term DESC
  `).all(req.parent.id);
  res.json({ items });
});

/* ================================================================
   CALENDAR EVENTS (upcoming only)
   ================================================================ */
router.get('/calendar', (req, res) => {
  const items = db.prepare(`
    SELECT event, date, note FROM calendar_events
    WHERE active = 1 AND date >= date('now')
    ORDER BY date ASC LIMIT 8
  `).all();
  res.json({ items });
});

/* ================================================================
   CHANGE PASSWORD
   ================================================================ */
router.post(
  '/change-password',
  [
    body('current_password').notEmpty(),
    body('new_password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, message: errors.array()[0].msg });

    const user  = db.prepare('SELECT * FROM parent_accounts WHERE id = ?').get(req.parent.id);
    const valid = await bcrypt.compare(req.body.current_password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(req.body.new_password, 12);
    db.prepare('UPDATE parent_accounts SET password = ? WHERE id = ?').run(hash, req.parent.id);
    res.json({ success: true, message: 'Password updated.' });
  }
);

module.exports = router;
