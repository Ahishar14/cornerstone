// email.js — Nodemailer transporter and email helpers
const nodemailer = require('nodemailer');
const logger     = require('./middleware/logger');

const transporter = nodemailer.createTransport({
  host:   process.env.SMTP_HOST,
  port:   parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: { rejectUnauthorized: process.env.NODE_ENV === 'production' },
});

// ── Verify connection on startup ──────────────────────────────
transporter.verify((err) => {
  if (err) {
    logger.warn('Email transporter not ready: %s', err.message);
  } else {
    logger.info('Email transporter ready');
  }
});

// ── Generic send helper ───────────────────────────────────────
async function sendMail({ to, subject, html, text }) {
  try {
    const info = await transporter.sendMail({
      from:    process.env.EMAIL_FROM || 'Cornerstone Schools <no-reply@cornerstoneschools.ug>',
      to,
      subject,
      html,
      text,
    });
    logger.info('Email sent: %s → %s', info.messageId, to);
    return info;
  } catch (err) {
    logger.error('Email send failed: %s', err.message);
    throw err;
  }
}

// ── Contact confirmation email ────────────────────────────────
async function sendContactConfirmation({ name, email, subject, message }) {
  // To sender
  await sendMail({
    to: email,
    subject: 'We received your message — Cornerstone Schools',
    html: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#0D1F3C;">
        <div style="background:#0D1F3C;padding:2rem 2.5rem;">
          <p style="color:white;font-size:1.2rem;margin:0;font-family:Georgia,serif;">Cornerstone Schools</p>
          <p style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin:0.2rem 0 0;letter-spacing:0.12em;text-transform:uppercase;">Budaka, Uganda</p>
        </div>
        <div style="padding:2.5rem;background:#f8f5f0;">
          <p style="font-size:1.4rem;font-weight:400;margin-bottom:1rem;">Dear ${name},</p>
          <p style="line-height:1.8;margin-bottom:1rem;">Thank you for reaching out to us. We have received your message regarding <strong>${subject}</strong> and our team will respond within 1–2 business days.</p>
          <p style="line-height:1.8;margin-bottom:2rem;">Your message:<br><em style="color:#4A5568;">"${message.substring(0, 280)}${message.length > 280 ? '…' : ''}"</em></p>
          <p style="line-height:1.8;">Warm regards,<br><strong>The Cornerstone Schools Team</strong></p>
        </div>
        <div style="background:#0D1F3C;padding:1.5rem 2.5rem;">
          <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:0;">Plot 12, Nakasero Road, Kampala &nbsp;·&nbsp; +256 700 000 000 &nbsp;·&nbsp; info@cornerstoneschools.ug</p>
        </div>
      </div>`,
    text: `Dear ${name},\n\nThank you for your message. We will respond within 1-2 business days.\n\nCornerstone Schools`,
  });

  // To admin
  await sendMail({
    to: process.env.ADMIN_EMAIL,
    subject: `[Website Contact] ${subject} — from ${name}`,
    html: `<p><strong>Name:</strong> ${name}</p><p><strong>Email:</strong> ${email}</p><p><strong>Subject:</strong> ${subject}</p><p><strong>Message:</strong><br>${message}</p>`,
    text: `Name: ${name}\nEmail: ${email}\nSubject: ${subject}\nMessage:\n${message}`,
  });
}

// ── Admissions confirmation email ─────────────────────────────
async function sendAdmissionsConfirmation(data) {
  const { parent_first_name, email, child_first_name, applying_class } = data;

  await sendMail({
    to: email,
    subject: 'Admissions Enquiry Received — Cornerstone Schools',
    html: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#0D1F3C;">
        <div style="background:#0D1F3C;padding:2rem 2.5rem;">
          <p style="color:white;font-size:1.2rem;margin:0;">Cornerstone Schools</p>
          <p style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin:0.2rem 0 0;letter-spacing:0.12em;text-transform:uppercase;">Budaka, Uganda</p>
        </div>
        <div style="padding:2.5rem;background:#f8f5f0;">
          <p style="font-size:1.3rem;margin-bottom:1rem;">Dear ${parent_first_name},</p>
          <p style="line-height:1.8;margin-bottom:1rem;">We are delighted to have received your admissions enquiry for <strong>${child_first_name}</strong> (applying for <strong>${applying_class.replace(/_/g,' ')}</strong>).</p>
          <p style="line-height:1.8;margin-bottom:1rem;">Our admissions team will contact you within <strong>48 hours</strong> to discuss next steps, including arranging a school visit and assessment.</p>
          <p style="line-height:1.8;">We look forward to welcoming you to the Cornerstone family.</p>
          <br/>
          <p>Warm regards,<br><strong>The Admissions Team, Cornerstone Schools</strong></p>
        </div>
        <div style="background:#0D1F3C;padding:1.5rem 2.5rem;">
          <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:0;">admissions@cornerstoneschools.ug &nbsp;·&nbsp; +256 700 000 000</p>
        </div>
      </div>`,
    text: `Dear ${parent_first_name},\n\nWe have received your admissions enquiry for ${child_first_name}. Our team will contact you within 48 hours.\n\nCornerstone Schools`,
  });

  // To admissions team
  await sendMail({
    to: process.env.ADMISSIONS_EMAIL || process.env.ADMIN_EMAIL,
    subject: `[New Admissions Enquiry] ${child_first_name} — ${applying_class}`,
    html: `
      <p><strong>Parent:</strong> ${data.parent_first_name} ${data.parent_last_name}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Phone:</strong> ${data.phone}</p>
      <p><strong>Child:</strong> ${data.child_first_name} ${data.child_last_name}</p>
      <p><strong>DOB:</strong> ${data.child_dob}</p>
      <p><strong>Applying for:</strong> ${applying_class}</p>
      <p><strong>Preferred intake:</strong> ${data.intake || 'Not specified'}</p>
      <p><strong>Notes:</strong> ${data.message || 'None'}</p>`,
    text: `New admissions enquiry\nParent: ${data.parent_first_name} ${data.parent_last_name}\nEmail: ${data.email}\nPhone: ${data.phone}\nChild: ${data.child_first_name} ${data.child_last_name}\nApplying for: ${applying_class}`,
  });
}

// ── Donation receipt email ────────────────────────────────────
async function sendDonationReceipt({ first_name, email, amount, currency, designation, tx_ref }) {
  const formatted = new Intl.NumberFormat('en-UG').format(amount);
  const designationLabel = {
    general: 'Where Most Needed',
    scholarships: 'Scholarship Programme',
    library: 'Library & Books',
    sports: 'Sports & Co-curricular',
    infrastructure: 'Infrastructure & Facilities',
    meals: 'Pupil Nutrition / Meals',
  }[designation] || designation;

  await sendMail({
    to: email,
    subject: `Donation Receipt — ${currency} ${formatted} — Cornerstone Schools`,
    html: `
      <div style="font-family:Georgia,serif;max-width:600px;margin:0 auto;color:#0D1F3C;">
        <div style="background:#0D1F3C;padding:2rem 2.5rem;">
          <p style="color:white;font-size:1.2rem;margin:0;">Cornerstone Schools</p>
          <p style="color:rgba(255,255,255,0.5);font-size:0.75rem;margin:0.2rem 0 0;">DONATION RECEIPT</p>
        </div>
        <div style="padding:2.5rem;background:#f8f5f0;">
          <p style="font-size:1.3rem;margin-bottom:1rem;">Dear ${first_name},</p>
          <p style="line-height:1.8;margin-bottom:1.5rem;">Thank you sincerely for your generous donation to Cornerstone Schools. Your contribution makes a real difference to the lives of children in Kampala.</p>
          <table style="width:100%;border-collapse:collapse;margin-bottom:2rem;">
            <tr style="border-bottom:1px solid #ddd;"><td style="padding:0.75rem 0;color:#4A5568;font-size:0.85rem;">Reference</td><td style="padding:0.75rem 0;font-weight:600;text-align:right;">${tx_ref}</td></tr>
            <tr style="border-bottom:1px solid #ddd;"><td style="padding:0.75rem 0;color:#4A5568;font-size:0.85rem;">Amount</td><td style="padding:0.75rem 0;font-weight:600;text-align:right;">${currency} ${formatted}</td></tr>
            <tr><td style="padding:0.75rem 0;color:#4A5568;font-size:0.85rem;">Designated towards</td><td style="padding:0.75rem 0;font-weight:600;text-align:right;">${designationLabel}</td></tr>
          </table>
          <p style="font-size:0.85rem;color:#4A5568;line-height:1.75;">Please retain this email as your record of donation. For any queries, contact finance@cornerstoneschools.ug.</p>
          <br/><p>With deep gratitude,<br><strong>Cornerstone Schools</strong></p>
        </div>
        <div style="background:#0D1F3C;padding:1.5rem 2.5rem;">
          <p style="color:rgba(255,255,255,0.4);font-size:0.75rem;margin:0;">Plot 12, Nakasero Road, Kampala · finance@cornerstoneschools.ug</p>
        </div>
      </div>`,
    text: `Dear ${first_name},\n\nThank you for your donation of ${currency} ${formatted} to Cornerstone Schools.\nReference: ${tx_ref}\nDesignated towards: ${designationLabel}\n\nWith gratitude,\nCornerstone Schools`,
  });
}

module.exports = { sendContactConfirmation, sendAdmissionsConfirmation, sendDonationReceipt };
