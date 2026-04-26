// scripts/seed.js — Populate the DB with dev/test data
// Usage: npm run seed
// Safe to re-run — skips records that already exist.
'use strict';

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const Database = require('better-sqlite3');
const bcrypt   = require('bcryptjs');
const path     = require('path');
const fs       = require('fs');

const dbPath  = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'cornerstone.db');
const dataDir = path.dirname(dbPath);
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Ensure schema exists before seeding ──────────────────────────
// (In case migrate hasn't been run separately — this won't overwrite)
db.exec(`
  CREATE TABLE IF NOT EXISTS contact_submissions (
    id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, email TEXT NOT NULL,
    phone TEXT, subject TEXT NOT NULL, message TEXT NOT NULL,
    consent INTEGER NOT NULL DEFAULT 0, ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS admissions_enquiries (
    id INTEGER PRIMARY KEY AUTOINCREMENT, parent_first_name TEXT NOT NULL,
    parent_last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT NOT NULL,
    child_first_name TEXT NOT NULL, child_last_name TEXT NOT NULL,
    child_dob TEXT NOT NULL, applying_class TEXT NOT NULL, intake TEXT,
    message TEXT, consent INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new', ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS donations (
    id INTEGER PRIMARY KEY AUTOINCREMENT, tx_ref TEXT NOT NULL UNIQUE,
    flw_ref TEXT, amount REAL NOT NULL, currency TEXT NOT NULL DEFAULT 'UGX',
    designation TEXT NOT NULL DEFAULT 'general', first_name TEXT NOT NULL,
    last_name TEXT NOT NULL, email TEXT NOT NULL, phone TEXT,
    payment_method TEXT, anonymous INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'pending', ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'admin',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS sms_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT, sender_id TEXT,
    recipient_count INTEGER NOT NULL DEFAULT 0, failed_count INTEGER NOT NULL DEFAULT 0,
    message TEXT NOT NULL, sent_by TEXT,
    sent_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  CREATE INDEX IF NOT EXISTS idx_donations_tx_ref  ON donations(tx_ref);
  CREATE INDEX IF NOT EXISTS idx_donations_status   ON donations(status);
  CREATE INDEX IF NOT EXISTS idx_admissions_email   ON admissions_enquiries(email);
  CREATE INDEX IF NOT EXISTS idx_contact_email      ON contact_submissions(email);
`);

// ─────────────────────────────────────────────────────────────────
// ADMIN USERS
// ─────────────────────────────────────────────────────────────────
async function seedAdmins() {
  const admins = [
    { email: 'admin@cornerstoneschools.ug', password: 'ChangeMe123!', role: 'superadmin' },
    { email: 'secretary@cornerstoneschools.ug', password: 'Secretary2024!', role: 'admin' },
  ];

  const insert = db.prepare(
    'INSERT OR IGNORE INTO admin_users (email, password, role) VALUES (?, ?, ?)'
  );

  for (const admin of admins) {
    const hash = await bcrypt.hash(admin.password, 12);
    const result = insert.run(admin.email, hash, admin.role);
    if (result.changes > 0) {
      console.log(`  ✔ Admin created: ${admin.email}  (password: ${admin.password})`);
    } else {
      console.log(`  – Admin already exists, skipped: ${admin.email}`);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// CONTACT SUBMISSIONS
// ─────────────────────────────────────────────────────────────────
function seedContacts() {
  const contacts = [
    {
      name: 'Sarah Nakato',
      email: 'snakato@gmail.com',
      phone: '+256701234567',
      subject: 'School Fees Inquiry',
      message: 'Hello, I would like to know the current school fees structure for Primary 3. Please send me the breakdown at your earliest convenience.',
      consent: 1,
      ip_address: '197.239.1.10',
      created_at: datetime(-3),
    },
    {
      name: 'Robert Ssemwogerere',
      email: 'r.ssemwogerere@yahoo.com',
      phone: '+256782345678',
      subject: 'Transport Services',
      message: 'Do you offer school transport from Kira? My child will be joining in the next term and I need reliable transport.',
      consent: 1,
      ip_address: '197.239.1.22',
      created_at: datetime(-7),
    },
    {
      name: 'Grace Auma',
      email: 'grace.auma@outlook.com',
      phone: null,
      subject: 'Upcoming Open Day',
      message: 'When is your next open day? We are interested in visiting the school premises before making a decision on enrollment.',
      consent: 1,
      ip_address: '41.210.0.5',
      created_at: datetime(-14),
    },
    {
      name: 'Patrick Okello',
      email: 'p.okello@cornerstoneparent.com',
      phone: '+256754567890',
      subject: 'After-School Programmes',
      message: 'I wanted to ask whether you have any coding or robotics clubs for children in upper primary. My son is very interested in technology.',
      consent: 1,
      ip_address: '41.210.0.44',
      created_at: datetime(-21),
    },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO contact_submissions
      (name, email, phone, subject, message, consent, ip_address, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  let count = 0;
  for (const c of contacts) {
    const r = insert.run(c.name, c.email, c.phone, c.subject, c.message, c.consent, c.ip_address, c.created_at);
    if (r.changes > 0) count++;
  }
  console.log(`  ✔ Contact submissions: ${count} inserted`);
}

// ─────────────────────────────────────────────────────────────────
// ADMISSIONS ENQUIRIES
// ─────────────────────────────────────────────────────────────────
function seedAdmissions() {
  const enquiries = [
    {
      parent_first_name: 'James', parent_last_name: 'Mutebi',
      email: 'james.mutebi@gmail.com', phone: '+256701111222',
      child_first_name: 'Ethan', child_last_name: 'Mutebi',
      child_dob: '2018-03-14', applying_class: 'Baby Class',
      intake: 'January 2025',
      message: 'We moved back from Nairobi recently and are looking for a good nursery for Ethan.',
      consent: 1, status: 'new',
      ip_address: '197.239.2.1', created_at: datetime(-1),
    },
    {
      parent_first_name: 'Fatuma', parent_last_name: 'Nalwoga',
      email: 'fnalwoga@hotmail.com', phone: '+256782333444',
      child_first_name: 'Aisha', child_last_name: 'Nalwoga',
      child_dob: '2017-07-22', applying_class: 'Middle Class',
      intake: 'January 2025', message: null,
      consent: 1, status: 'reviewed',
      ip_address: '197.239.2.5', created_at: datetime(-5),
    },
    {
      parent_first_name: 'David', parent_last_name: 'Kiggundu',
      email: 'david.k@gmail.com', phone: '+256754444555',
      child_first_name: 'Liam', child_last_name: 'Kiggundu',
      child_dob: '2016-11-05', applying_class: 'Primary 1',
      intake: 'January 2025',
      message: 'Liam has attended another school for nursery. We want a strong academic foundation for primary.',
      consent: 1, status: 'accepted',
      ip_address: '41.210.0.20', created_at: datetime(-10),
    },
    {
      parent_first_name: 'Miriam', parent_last_name: 'Akello',
      email: 'm.akello@cornerstoneparent.com', phone: '+256706555666',
      child_first_name: 'Zara', child_last_name: 'Akello',
      child_dob: '2015-05-30', applying_class: 'Primary 3',
      intake: 'May 2025',
      message: 'We are transferring from a school in Mbarara. Can you accommodate mid-year intake for P3?',
      consent: 1, status: 'new',
      ip_address: '41.210.0.30', created_at: datetime(-2),
    },
    {
      parent_first_name: 'Henry', parent_last_name: 'Bwire',
      email: 'hbwire@yahoo.com', phone: '+256782666777',
      child_first_name: 'Noah', child_last_name: 'Bwire',
      child_dob: '2014-09-12', applying_class: 'Primary 4',
      intake: 'January 2025', message: null,
      consent: 1, status: 'waitlisted',
      ip_address: '41.210.1.5', created_at: datetime(-15),
    },
    {
      parent_first_name: 'Christine', parent_last_name: 'Namirembe',
      email: 'c.namirembe@gmail.com', phone: '+256701777888',
      child_first_name: 'Olivia', child_last_name: 'Namirembe',
      child_dob: '2018-01-18', applying_class: 'Baby Class',
      intake: 'September 2025',
      message: 'Early inquiry — planning ahead for September intake.',
      consent: 1, status: 'new',
      ip_address: '197.239.5.1', created_at: datetime(-30),
    },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO admissions_enquiries
      (parent_first_name, parent_last_name, email, phone,
       child_first_name, child_last_name, child_dob, applying_class,
       intake, message, consent, status, ip_address, created_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let count = 0;
  for (const e of enquiries) {
    const r = insert.run(
      e.parent_first_name, e.parent_last_name, e.email, e.phone,
      e.child_first_name, e.child_last_name, e.child_dob, e.applying_class,
      e.intake, e.message, e.consent, e.status, e.ip_address, e.created_at
    );
    if (r.changes > 0) count++;
  }
  console.log(`  ✔ Admissions enquiries: ${count} inserted`);
}

// ─────────────────────────────────────────────────────────────────
// DONATIONS
// ─────────────────────────────────────────────────────────────────
function seedDonations() {
  const donations = [
    {
      tx_ref: 'CSK-TX-20240901-001', flw_ref: 'FLW-MOCK-001',
      amount: 500000, currency: 'UGX', designation: 'bursary',
      first_name: 'Anonymous', last_name: 'Donor', email: 'anon@seed.com',
      phone: null, payment_method: 'mobilemoney',
      anonymous: 1, status: 'completed', ip_address: '41.210.0.9',
      created_at: datetime(-45), updated_at: datetime(-45),
    },
    {
      tx_ref: 'CSK-TX-20240915-002', flw_ref: 'FLW-MOCK-002',
      amount: 200000, currency: 'UGX', designation: 'library',
      first_name: 'Patricia', last_name: 'Nabukenya', email: 'p.nabukenya@gmail.com',
      phone: '+256701234501', payment_method: 'mobilemoney',
      anonymous: 0, status: 'completed', ip_address: '197.239.3.2',
      created_at: datetime(-30), updated_at: datetime(-30),
    },
    {
      tx_ref: 'CSK-TX-20241001-003', flw_ref: null,
      amount: 150000, currency: 'UGX', designation: 'general',
      first_name: 'Ronald', last_name: 'Kaggwa', email: 'r.kaggwa@outlook.com',
      phone: '+256782234502', payment_method: null,
      anonymous: 0, status: 'pending', ip_address: '41.210.1.10',
      created_at: datetime(-20), updated_at: datetime(-20),
    },
    {
      tx_ref: 'CSK-TX-20241010-004', flw_ref: 'FLW-MOCK-004',
      amount: 1000000, currency: 'UGX', designation: 'infrastructure',
      first_name: 'Sylvia', last_name: 'Namukasa', email: 'sylvia.n@cornerstoneparent.com',
      phone: '+256754345603', payment_method: 'card',
      anonymous: 0, status: 'completed', ip_address: '197.239.4.1',
      created_at: datetime(-10), updated_at: datetime(-10),
    },
    {
      tx_ref: 'CSK-TX-20241015-005', flw_ref: 'FLW-MOCK-005',
      amount: 75000, currency: 'UGX', designation: 'general',
      first_name: 'Michael', last_name: 'Lubega', email: 'mlubega@gmail.com',
      phone: '+256706456704', payment_method: 'mobilemoney',
      anonymous: 0, status: 'failed', ip_address: '197.239.4.5',
      created_at: datetime(-5), updated_at: datetime(-5),
    },
    {
      tx_ref: 'CSK-TX-20241020-006', flw_ref: 'FLW-MOCK-006',
      amount: 300000, currency: 'UGX', designation: 'bursary',
      first_name: 'Agnes', last_name: 'Zawedde', email: 'agnes.z@yahoo.com',
      phone: '+256701567805', payment_method: 'mobilemoney',
      anonymous: 0, status: 'completed', ip_address: '41.210.2.1',
      created_at: datetime(-3), updated_at: datetime(-3),
    },
  ];

  const insert = db.prepare(`
    INSERT OR IGNORE INTO donations
      (tx_ref, flw_ref, amount, currency, designation, first_name, last_name,
       email, phone, payment_method, anonymous, status, ip_address, created_at, updated_at)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
  `);

  let count = 0;
  for (const d of donations) {
    const r = insert.run(
      d.tx_ref, d.flw_ref, d.amount, d.currency, d.designation,
      d.first_name, d.last_name, d.email, d.phone, d.payment_method,
      d.anonymous, d.status, d.ip_address, d.created_at, d.updated_at
    );
    if (r.changes > 0) count++;
  }
  console.log(`  ✔ Donations: ${count} inserted`);
}

// ─────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────
function datetime(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().replace('T', ' ').substring(0, 19);
}

// ─────────────────────────────────────────────────────────────────
// MAIN
// ─────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n🌱  Seeding database:', dbPath, '\n');

  await seedAdmins();
  seedContacts();
  seedAdmissions();
  seedDonations();

  console.log('\n✅  Seed complete.\n');
  console.log('   Admin login → admin@cornerstoneschools.ug / ChangeMe123!');
  console.log('   Change the password immediately after first login.\n');
  db.close();
})();
