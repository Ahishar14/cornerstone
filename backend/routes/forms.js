// routes/forms.js — Contact and Admissions form endpoints
const express   = require('express');
const { body, validationResult } = require('express-validator');
const xss       = require('xss');
const db        = require('../db');
const email     = require('../email');
const logger    = require('../middleware/logger');

const router = express.Router();

// ── Sanitise helper ───────────────────────────────────────────
const clean = (str) => xss(String(str || '').trim());

// ── Validation error formatter ────────────────────────────────
function handleValidationErrors(req, res) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({
      success: false,
      message: 'Please check your form inputs.',
      errors: errors.array().map(e => ({ field: e.path, msg: e.msg })),
    });
  }
  return null;
}

// ════════════════════════════════════════════════════════════════
// POST /api/contact
// ════════════════════════════════════════════════════════════════
router.post(
  '/contact',
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 120 }),
    body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
    body('subject').trim().notEmpty().withMessage('Subject is required').isLength({ max: 80 }),
    body('message').trim().notEmpty().withMessage('Message is required').isLength({ max: 3000 }),
    body('consent').custom(v => v === 'on' || v === true || v === 'true' || v === '1').withMessage('You must consent to submit this form'),
  ],
  async (req, res) => {
    const errResponse = handleValidationErrors(req, res);
    if (errResponse) return;

    const { name, email: emailAddr, phone, subject, message, consent } = req.body;

    try {
      const insert = db.prepare(`
        INSERT INTO contact_submissions (name, email, phone, subject, message, consent, ip_address)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);

      // insert.run(
      //   clean(name),
      //   clean(emailAddr),
      //   clean(phone),
      //   clean(subject),
      //   clean(message),
      //   consent ? 1 : 0,
      //   req.ip
      // );

      // // Send emails — don't fail the API if email fails
      // try {
      //   await email.sendContactConfirmation({
      //     name:    clean(name),
      //     email:   clean(emailAddr),
      //     subject: clean(subject),
      //     message: clean(message),
      //   });
      // } catch (emailErr) {
      //   logger.error('Contact email send failed: %s', emailErr.message);
      // }

      // logger.info('Contact submission from %s <%s>', clean(name), clean(emailAddr));
      // return res.status(200).json({ success: true, message: 'Message received. Thank you.' });
      // 1. Run the database insertion
      
      insert.run(
        clean(name),
        clean(emailAddr),
        clean(phone),
        clean(subject),
        clean(message),
        consent ? 1 : 0,
        req.ip
      );

      // 2. Send the success response to the browser IMMEDIATELY
      logger.info('Contact submission from %s <%s>', clean(name), clean(emailAddr));
      res.status(200).json({ success: true, message: 'Message received. Thank you.' });

      // 3. Trigger the email in the background (Notice: no 'await' here)
      email.sendContactConfirmation({
        name:    clean(name),
        email:   clean(emailAddr),
        subject: clean(subject),
        message: clean(message),
      }).catch(emailErr => {
        // This still logs the error if Gmail fails, but doesn't make the user wait
        logger.error('Contact email send failed: %s', emailErr.message);
      });

      // No 'return' or 'res' after this point inside this block
    } catch (err) {
      logger.error('Contact form DB error: %s', err.message);
      return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
  }
);

// ════════════════════════════════════════════════════════════════
// POST /api/admissions
// ════════════════════════════════════════════════════════════════
const CLASS_LEVELS = ['baby_class','middle_class','top_class','p1','p2','p3','p4','p5','p6','p7'];
const INTAKES      = ['jan_2025','may_2025','sep_2025','jan_2026',''];

router.post(
  '/admissions',
  [
    body('parent_first_name').trim().notEmpty().withMessage('Parent first name is required').isLength({ max: 80 }),
    body('parent_last_name').trim().notEmpty().withMessage('Parent last name is required').isLength({ max: 80 }),
    body('email').trim().isEmail().withMessage('A valid email address is required').normalizeEmail(),
    body('phone').trim().notEmpty().withMessage('Phone number is required').isLength({ max: 30 }),
    body('child_first_name').trim().notEmpty().withMessage('Child first name is required').isLength({ max: 80 }),
    body('child_last_name').trim().notEmpty().withMessage('Child last name is required').isLength({ max: 80 }),
    body('child_dob').trim().notEmpty().withMessage('Date of birth is required').isISO8601().withMessage('Invalid date format'),
    body('applying_class').isIn(CLASS_LEVELS).withMessage('Please select a valid class level'),
    body('intake').optional({ checkFalsy: true }).isIn(INTAKES),
    body('message').optional({ checkFalsy: true }).trim().isLength({ max: 2000 }),
    body('consent').custom(v => v === 'on' || v === true || v === 'true' || v === '1').withMessage('You must consent to submit this form'),
  ],
  async (req, res) => {
    const errResponse = handleValidationErrors(req, res);
    if (errResponse) return;

    const data = req.body;

    try {
      const insert = db.prepare(`
        INSERT INTO admissions_enquiries
          (parent_first_name, parent_last_name, email, phone,
          child_first_name, child_last_name, child_dob,
          applying_class, intake, message, consent, ip_address)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `);

      // insert.run(
      //   clean(data.parent_first_name),
      //   clean(data.parent_last_name),
      //   clean(data.email),
      //   clean(data.phone),
      //   clean(data.child_first_name),
      //   clean(data.child_last_name),
      //   data.child_dob,
      //   data.applying_class,
      //   data.intake || '',
      //   clean(data.message || ''),
      //   data.consent ? 1 : 0,
      //   req.ip
      // );

      // try {
      //   await email.sendAdmissionsConfirmation({
      //     ...data,
      //     parent_first_name: clean(data.parent_first_name),
      //     email: clean(data.email),
      //     child_first_name: clean(data.child_first_name),
      //     child_last_name: clean(data.child_last_name),
      //   });
      // } catch (emailErr) {
      //   logger.error('Admissions email send failed: %s', emailErr.message);
      // }

      // logger.info(
      //   'Admissions enquiry: %s %s for %s %s (%s)',
      //   clean(data.parent_first_name), clean(data.parent_last_name),
      //   clean(data.child_first_name),  clean(data.child_last_name),
      //   data.applying_class
      // );

      // return res.status(200).json({ success: true, message: 'Enquiry received. We will be in touch within 48 hours.' });
      
      // 1. Run the database insertion
      insert.run(
        clean(data.parent_first_name),
        clean(data.parent_last_name),
        clean(data.email),
        clean(data.phone),
        clean(data.child_first_name),
        clean(data.child_last_name),
        data.child_dob,
        data.applying_class,
        data.intake || '',
        clean(data.message || ''),
        data.consent ? 1 : 0,
        req.ip
      );

      // 2. Send the success response to the browser IMMEDIATELY
      logger.info(
        'Admissions enquiry: %s %s for %s %s (%s)',
        clean(data.parent_first_name), clean(data.parent_last_name),
        clean(data.child_first_name),  clean(data.child_last_name),
        data.applying_class
      );
      res.status(200).json({ success: true, message: 'Enquiry received. We will be in touch within 48 hours.' });

      // 3. Trigger the email in the background (No 'await')
      email.sendAdmissionsConfirmation({
        ...data,
        parent_first_name: clean(data.parent_first_name),
        email: clean(data.email),
        child_first_name: clean(data.child_first_name),
        child_last_name: clean(data.child_last_name),
      }).catch(emailErr => {
        logger.error('Admissions email send failed: %s', emailErr.message);
      });

    } catch (err) {
      logger.error('Admissions form DB error: %s', err.message);
      return res.status(500).json({ success: false, message: 'An error occurred. Please try again.' });
    }
  }
);

module.exports = router;
