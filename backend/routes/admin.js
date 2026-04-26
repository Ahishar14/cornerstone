// routes/admin.js — Protected admin API
// All routes require a valid JWT from /api/admin/login
'use strict';

const express    = require('express');
const bcrypt     = require('bcryptjs');
const jwt        = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const axios      = require('axios');
const db         = require('../db');
const logger     = require('../middleware/logger');

const router = express.Router();

/* ================================================================
   JWT MIDDLEWARE
   ================================================================ */
function requireAuth(req, res, next) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required.' });
  }
  try {
    req.admin = jwt.verify(header.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Session expired. Please log in again.' });
  }
}

/* ================================================================
   ADMIN USERS TABLE  (created here if absent)
   ================================================================ */
db.exec(`
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
`);

/* ── Seed default admin if table is empty ─────────────────────
   Default: admin@cornerstoneschools.ug / ChangeMe123!
   Change the password immediately after first login.
   ─────────────────────────────────────────────────────────── */
(async () => {
  const existing = db.prepare('SELECT id FROM admin_users LIMIT 1').get();
  if (!existing) {
    const hash = await bcrypt.hash('ChangeMe123!', 12);
    db.prepare('INSERT INTO admin_users (email, password, role) VALUES (?,?,?)').run(
      'admin@cornerstoneschools.ug', hash, 'superadmin'
    );
    logger.info('Default admin user seeded. CHANGE THE PASSWORD IMMEDIATELY.');
  }
})();

/* ================================================================
   LOGIN
   ================================================================ */
router.post(
  '/login',
  [
    body('email').trim().isEmail().normalizeEmail(),
    body('password').notEmpty(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, message: 'Invalid input.' });

    const { email, password } = req.body;
    const user = db.prepare('SELECT * FROM admin_users WHERE email = ?').get(email);

    if (!user) {
      // Constant-time rejection — don't reveal whether user exists
      await bcrypt.hash('dummy', 10);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const valid = await bcrypt.compare(password, user.password);
    if (!valid) {
      logger.warn('Failed admin login attempt for %s from %s', email, req.ip);
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );

    logger.info('Admin login: %s from %s', email, req.ip);
    return res.json({ success: true, token, user: { email: user.email, role: user.role } });
  }
);

/* ── All routes below require JWT ─────────────────────────── */
router.use(requireAuth);

/* ================================================================
   DASHBOARD STATS
   ================================================================ */
router.get('/stats', (req, res) => {
  const newAdmissions    = db.prepare(`SELECT COUNT(*) AS c FROM admissions_enquiries WHERE status = 'new'`).get().c;
  const totalContacts    = db.prepare(`SELECT COUNT(*) AS c FROM contact_submissions`).get().c;
  const completedDon     = db.prepare(`SELECT COUNT(*) AS c FROM donations WHERE status = 'completed'`).get().c;
  const donTotalUGX      = db.prepare(`SELECT COALESCE(SUM(amount),0) AS t FROM donations WHERE status='completed' AND currency='UGX'`).get().t;
  const recentAdmissions = db.prepare(`SELECT * FROM admissions_enquiries ORDER BY created_at DESC LIMIT 5`).all();
  const recentDonations  = db.prepare(`SELECT * FROM donations ORDER BY created_at DESC LIMIT 5`).all();

  res.json({
    new_admissions:      newAdmissions,
    total_contacts:      totalContacts,
    completed_donations: completedDon,
    donation_total_ugx:  donTotalUGX,
    recent_admissions:   recentAdmissions,
    recent_donations:    recentDonations,
  });
});

/* ================================================================
   ADMISSIONS
   ================================================================ */
router.get('/admissions', (req, res) => {
  const { page = 1, limit = 20, search = '', status = '' } = req.query;
  const offset  = (parseInt(page) - 1) * parseInt(limit);
  const like    = `%${search}%`;
  const statusQ = status ? `AND status = ?` : '';
  const params  = status
    ? [like, like, like, status, parseInt(limit), offset]
    : [like, like, like, parseInt(limit), offset];

  const rows = db.prepare(`
    SELECT * FROM admissions_enquiries
    WHERE (child_first_name LIKE ? OR child_last_name LIKE ? OR email LIKE ?) ${statusQ}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params);

  const totalParams = status ? [like, like, like, status] : [like, like, like];
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM admissions_enquiries
    WHERE (child_first_name LIKE ? OR child_last_name LIKE ? OR email LIKE ?) ${statusQ}
  `).get(...totalParams).c;

  res.json({ rows, total });
});

router.get('/admissions/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM admissions_enquiries WHERE id = ?').get(req.params.id);
  if (!row) return res.status(404).json({ success: false, message: 'Not found.' });
  res.json(row);
});

router.patch('/admissions/:id/status',
  [body('status').isIn(['new','reviewed','accepted','waitlisted','declined'])],
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, message: 'Invalid status.' });

    const result = db.prepare('UPDATE admissions_enquiries SET status = ? WHERE id = ?')
      .run(req.body.status, req.params.id);

    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Record not found.' });
    logger.info('Admission %s status → %s by %s', req.params.id, req.body.status, req.admin.email);
    res.json({ success: true });
  }
);

/* ================================================================
   CONTACTS
   ================================================================ */
router.get('/contacts', (req, res) => {
  const { page = 1, limit = 20, search = '' } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);
  const like   = `%${search}%`;

  const rows  = db.prepare(`
    SELECT * FROM contact_submissions
    WHERE (name LIKE ? OR email LIKE ? OR subject LIKE ?)
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(like, like, like, parseInt(limit), offset);

  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM contact_submissions
    WHERE (name LIKE ? OR email LIKE ? OR subject LIKE ?)
  `).get(like, like, like).c;

  res.json({ rows, total });
});

/* ================================================================
   DONATIONS
   ================================================================ */
router.get('/donations', (req, res) => {
  const { page = 1, limit = 20, search = '', status = '' } = req.query;
  const offset  = (parseInt(page) - 1) * parseInt(limit);
  const like    = `%${search}%`;
  const statusQ = status ? `AND status = ?` : '';
  const params  = status
    ? [like, like, like, status, parseInt(limit), offset]
    : [like, like, like, parseInt(limit), offset];

  const rows = db.prepare(`
    SELECT * FROM donations
    WHERE (first_name LIKE ? OR last_name LIKE ? OR tx_ref LIKE ?) ${statusQ}
    ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(...params);

  const totalParams = status ? [like, like, like, status] : [like, like, like];
  const total = db.prepare(`
    SELECT COUNT(*) AS c FROM donations
    WHERE (first_name LIKE ? OR last_name LIKE ? OR tx_ref LIKE ?) ${statusQ}
  `).get(...totalParams).c;

  res.json({ rows, total });
});

/* ================================================================
   SMS — Africa's Talking
   ================================================================ */
router.post(
  '/sms/send',
  [
    body('message').trim().notEmpty().isLength({ max: 480 }),
    body('recipient_group').isIn(['all_parents', 'custom']),
    body('sender_id').trim().isLength({ max: 20 }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(422).json({ success: false, message: 'Invalid input.' });

    const { message, recipient_group, custom_numbers, sender_id } = req.body;
    let phoneNumbers = [];

    if (recipient_group === 'all_parents') {
      const parents = db.prepare(`SELECT DISTINCT phone FROM admissions_enquiries WHERE phone != ''`).all();
      phoneNumbers  = parents.map(p => p.phone.replace(/\s/g, '').replace(/^0/, '+256'));
    } else {
      phoneNumbers = (custom_numbers || '')
        .split('\n')
        .map(n => n.trim())
        .filter(n => /^\+\d{7,15}$/.test(n));
    }

    if (!phoneNumbers.length) {
      return res.status(422).json({ success: false, message: 'No valid phone numbers found.' });
    }

    // Validate AT credentials
    if (!process.env.AT_API_KEY || !process.env.AT_USERNAME) {
      return res.status(503).json({ success: false, message: 'SMS service not configured. Set AT_API_KEY and AT_USERNAME in .env.' });
    }

    try {
      const atRes = await axios.post(
        'https://api.africastalking.com/version1/messaging',
        new URLSearchParams({
          username: process.env.AT_USERNAME,
          to:       phoneNumbers.join(','),
          message:  message.trim(),
          from:     sender_id || 'Cornerstone',
        }),
        {
          headers: {
            apiKey:  process.env.AT_API_KEY,
            Accept:  'application/json',
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 20000,
        }
      );

      const recipients = atRes.data?.SMSMessageData?.Recipients || [];
      const sent   = recipients.filter(r => r.statusCode === 101).length;
      const failed = recipients.length - sent;

      // Log it
      db.prepare(`
        INSERT INTO sms_log (sender_id, recipient_count, failed_count, message, sent_by)
        VALUES (?,?,?,?,?)
      `).run(sender_id, sent, failed, message, req.admin.email);

      logger.info('SMS sent by %s: %d delivered, %d failed', req.admin.email, sent, failed);
      return res.json({ success: true, sent, failed, total: recipients.length });

    } catch (err) {
      logger.error('Africa\'s Talking SMS error: %s', err.message);
      return res.status(502).json({ success: false, message: 'SMS gateway error. Please check AT credentials and try again.' });
    }
  }
);

router.get('/sms/log', (req, res) => {
  const rows = db.prepare('SELECT * FROM sms_log ORDER BY sent_at DESC LIMIT 10').all();
  res.json({ rows });
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

    const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(req.admin.id);
    const valid = await bcrypt.compare(req.body.current_password, user.password);
    if (!valid) return res.status(401).json({ success: false, message: 'Current password is incorrect.' });

    const hash = await bcrypt.hash(req.body.new_password, 12);
    db.prepare('UPDATE admin_users SET password = ? WHERE id = ?').run(hash, req.admin.id);
    logger.info('Password changed for admin %s', req.admin.email);
    res.json({ success: true, message: 'Password updated successfully.' });
  }
);

module.exports = router;
