// routes/donate.js — Donation endpoints with Flutterwave
const express  = require('express');
const axios    = require('axios');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const crypto   = require('crypto');
const xss      = require('xss');
const db       = require('../db');
const emailSvc = require('../email');
const logger   = require('../middleware/logger');

const router = express.Router();

const clean = (s) => xss(String(s || '').trim());

const ALLOWED_CURRENCIES  = ['UGX','USD','GBP','EUR','KES'];
const ALLOWED_DESIGNATIONS = ['general','scholarships','library','sports','infrastructure','meals'];
const ALLOWED_METHODS      = ['mobile_money_ug','card'];

// ════════════════════════════════════════════════════════════════
// POST /api/donate  — Initiate a Flutterwave payment
// ════════════════════════════════════════════════════════════════
router.post(
  '/',
  [
    body('amount')
      .notEmpty().withMessage('Amount is required')
      .isFloat({ min: 500 }).withMessage('Minimum donation is 500'),
    body('currency')
      .isIn(ALLOWED_CURRENCIES).withMessage('Invalid currency'),
    body('designation')
      .isIn(ALLOWED_DESIGNATIONS).withMessage('Invalid designation'),
    body('first_name')
      .trim().notEmpty().withMessage('First name is required').isLength({ max: 80 }),
    body('last_name')
      .trim().notEmpty().withMessage('Last name is required').isLength({ max: 80 }),
    body('email')
      .trim().isEmail().withMessage('A valid email is required').normalizeEmail(),
    body('phone').optional({ checkFalsy: true }).trim().isLength({ max: 30 }),
    body('payment_method')
      .isIn(ALLOWED_METHODS).withMessage('Invalid payment method'),
    body('anonymous').optional({ checkFalsy: true }),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({
        success: false,
        message: 'Please check your inputs.',
        errors: errors.array().map(e => ({ field: e.path, msg: e.msg })),
      });
    }

    const {
      amount, currency, designation, first_name, last_name,
      email, phone, payment_method, anonymous,
    } = req.body;

    const txRef = `CS-${uuidv4()}`;

    // Persist pending donation
    try {
      db.prepare(`
        INSERT INTO donations
          (tx_ref, amount, currency, designation, first_name, last_name,
           email, phone, payment_method, anonymous, status, ip_address)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)
      `).run(
        txRef,
        parseFloat(amount),
        currency,
        designation,
        clean(first_name),
        clean(last_name),
        clean(email),
        clean(phone || ''),
        payment_method,
        anonymous === 'true' || anonymous === true ? 1 : 0,
        'pending',
        req.ip
      );
    } catch (dbErr) {
      logger.error('Donation DB insert error: %s', dbErr.message);
      return res.status(500).json({ success: false, message: 'Could not initiate payment. Please try again.' });
    }

    // Build Flutterwave payload
    const flwPayload = {
      tx_ref:       txRef,
      amount:       parseFloat(amount),
      currency,
      payment_options: payment_method === 'mobile_money_ug' ? 'mobilemoneyrwanda,mobilemoneyuganda' : 'card',
      redirect_url: process.env.DONATION_SUCCESS_URL || 'http://localhost:5500/donate.html?status=success',
      customer: {
        email:      clean(email),
        name:       `${clean(first_name)} ${clean(last_name)}`,
        phonenumber: clean(phone || ''),
      },
      customizations: {
        title:       'Cornerstone Schools Donation',
        description: `Donation — ${designation.charAt(0).toUpperCase() + designation.slice(1)}`,
        logo:        `${process.env.FRONTEND_URL}/images/logo.png`,
      },
      meta: {
        designation,
        anonymous: anonymous ? 'true' : 'false',
        source: 'website',
      },
    };

    try {
      const flwRes = await axios.post(
        'https://api.flutterwave.com/v3/payments',
        flwPayload,
        {
          headers: {
            Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        }
      );

      if (flwRes.data.status === 'success' && flwRes.data.data?.link) {
        logger.info('FLW payment initiated: %s', txRef);
        return res.status(200).json({ success: true, paymentUrl: flwRes.data.data.link, txRef });
      } else {
        logger.warn('FLW unexpected response for %s: %o', txRef, flwRes.data);
        return res.status(502).json({ success: false, message: 'Payment provider error. Please try again.' });
      }

    } catch (flwErr) {
      logger.error('Flutterwave API error for %s: %s', txRef, flwErr.message);
      return res.status(502).json({ success: false, message: 'Could not connect to payment provider. Please try again shortly.' });
    }
  }
);

// ════════════════════════════════════════════════════════════════
// POST /api/donate/webhook  — Flutterwave webhook callback
// ════════════════════════════════════════════════════════════════
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  // Verify webhook signature
  const hash = req.headers['verif-hash'];
  if (!hash || hash !== process.env.FLW_WEBHOOK_HASH) {
    logger.warn('Webhook rejected — invalid hash from %s', req.ip);
    return res.sendStatus(401);
  }

  let payload;
  try {
    payload = JSON.parse(req.body);
  } catch {
    return res.sendStatus(400);
  }

  const { event, data } = payload;

  if (event === 'charge.completed') {
    const { tx_ref, status, amount, currency, flw_ref } = data;

    // Verify with Flutterwave directly (avoid trusting webhook body alone)
    try {
      const verifyRes = await axios.get(
        `https://api.flutterwave.com/v3/transactions/${data.id}/verify`,
        {
          headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
          timeout: 10000,
        }
      );

      const verified = verifyRes.data.data;
      const donation = db.prepare('SELECT * FROM donations WHERE tx_ref = ?').get(tx_ref);

      if (!donation) {
        logger.warn('Webhook: unknown tx_ref %s', tx_ref);
        return res.sendStatus(200);
      }

      // Check amount and currency match
      const amountMatch   = Math.abs(verified.amount - donation.amount) < 1;
      const currencyMatch = verified.currency === donation.currency;

      if (verified.status === 'successful' && amountMatch && currencyMatch) {
        db.prepare(`
          UPDATE donations SET status = 'completed', flw_ref = ?, updated_at = datetime('now')
          WHERE tx_ref = ?
        `).run(flw_ref || verified.flw_ref, tx_ref);

        logger.info('Donation confirmed: %s (%.2f %s)', tx_ref, verified.amount, verified.currency);

        // Send receipt
        try {
          if (!donation.anonymous) {
            await emailSvc.sendDonationReceipt({
              first_name:  donation.first_name,
              email:       donation.email,
              amount:      donation.amount,
              currency:    donation.currency,
              designation: donation.designation,
              tx_ref,
            });
          }
        } catch (emailErr) {
          logger.error('Donation receipt email failed: %s', emailErr.message);
        }

      } else if (verified.status === 'failed') {
        db.prepare(`UPDATE donations SET status = 'failed', updated_at = datetime('now') WHERE tx_ref = ?`).run(tx_ref);
        logger.info('Donation failed: %s', tx_ref);

      } else {
        logger.warn('Webhook: amount/currency mismatch for %s. Expected %s %s, got %s %s',
          tx_ref, donation.amount, donation.currency, verified.amount, verified.currency);
        db.prepare(`UPDATE donations SET status = 'mismatch', updated_at = datetime('now') WHERE tx_ref = ?`).run(tx_ref);
      }

    } catch (verifyErr) {
      logger.error('FLW verify failed for %s: %s', tx_ref, verifyErr.message);
    }
  }

  return res.sendStatus(200);
});

// ════════════════════════════════════════════════════════════════
// GET /api/donate/verify?tx_ref=CS-xxx  — Frontend status poll
// ════════════════════════════════════════════════════════════════
router.get('/verify', async (req, res) => {
  const { tx_ref } = req.query;

  if (!tx_ref || typeof tx_ref !== 'string' || !/^CS-[a-f0-9-]+$/.test(tx_ref)) {
    return res.status(400).json({ success: false, message: 'Invalid transaction reference.' });
  }

  const donation = db.prepare('SELECT status, amount, currency, designation FROM donations WHERE tx_ref = ?').get(tx_ref);

  if (!donation) {
    return res.status(404).json({ success: false, message: 'Transaction not found.' });
  }

  return res.status(200).json({ success: true, status: donation.status, amount: donation.amount, currency: donation.currency });
});

module.exports = router;
