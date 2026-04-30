# Cornerstone Nursery and Primary School — Website

A premium, full-stack school website for **Cornerstone Nursery and Primary School**, Budaka, Uganda.

---

## Project Structure

``` 
cornerstone/
├── frontend/
│   ├── index.html          Home page
│   ├── about.html          About Us
│   ├── academics.html      Academic Programmes
│   ├── admissions.html     Admissions & Enquiry Form
│   ├── gallery.html        Photo Gallery
│   ├── contact.html        Contact Us
│   ├── donate.html         Donate / Support
│   ├── css/
│   │   └── styles.css      Single global stylesheet
│   └── js/
│       └── main.js         Single global JS file
│
└── backend/
    ├── server.js           Express app entry point
    ├── db.js               SQLite setup (better-sqlite3)
    ├── email.js            Nodemailer email service
    ├── package.json
    ├── .env.example        → copy to .env and fill in values
    ├── routes/
    │   ├── forms.js        Contact + Admissions API
    │   └── donate.js       Donation API (Flutterwave)
    ├── middleware/
    │   └── logger.js       Winston structured logger
    └── data/               SQLite database files (auto-created)
```

---

## Getting Started

### 1. Install dependencies

```bash
cd cornerstone/backend
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
```

Open `.env` and fill in:
- `SMTP_USER` / `SMTP_PASS` — your Gmail App Password (or other SMTP)
- `FLW_PUBLIC_KEY` / `FLW_SECRET_KEY` / `FLW_ENCRYPTION_KEY` — from your [Flutterwave dashboard](https://dashboard.flutterwave.com)
- `FLW_WEBHOOK_HASH` — set in Flutterwave → Settings → Webhooks
- `JWT_SECRET` — run `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"` to generate

### 3. Run in development

```bash
npm run dev   # uses nodemon for auto-restart
```

The backend serves the frontend statically. Open `http://localhost:5000` in your browser.

For Live Server (VS Code), open `frontend/index.html` directly via port 5500 — the JS form handlers point to `http://localhost:5000/api/...`.

### 4. Run in production

```bash
NODE_ENV=production npm start
```

---

## Payment Integration — Flutterwave

### Test mode
Use your `FLWSECK_TEST-...` keys from the Flutterwave dashboard.  
**Important:** The key value you paste is what comes *after* the `FLWSECK_TEST-` prefix in your dashboard — include the full string as shown.

### Test Mobile Money numbers (Uganda sandbox)
| Network | Number         |
|---------|----------------|
| MTN     | 256077000000   |
| Airtel  | 256070000000   |

### Webhook setup (development)
```bash
# Install ngrok
brew install ngrok   # macOS

# Expose your local server
ngrok http 5000

# Copy the https URL e.g. https://abc123.ngrok.io
# Set in Flutterwave dashboard: Webhook URL = https://abc123.ngrok.io/api/donate/webhook
# Set FLW_WEBHOOK_HASH in your .env to match the "Secret hash" in Flutterwave settings
```

---

## Security Features

| Layer              | Implementation                                      |
|--------------------|-----------------------------------------------------|
| HTTP Headers       | Helmet (CSP, HSTS, X-Frame, XSS, noSniff, etc.)    |
| CORS               | Strict origin allowlist                             |
| Rate Limiting      | express-rate-limit (global + per-route)             |
| Input Validation   | express-validator (type, length, format)            |
| XSS Sanitisation   | xss library on all user input before DB write       |
| SQL Injection      | Parameterised queries via better-sqlite3            |
| Payload Size       | express.json limit: 32kb                            |
| Webhook Integrity  | Flutterwave secret hash header verification         |
| Payment Verify     | Server-side re-verification of all transactions     |
| Logging            | Winston (file + console, structured JSON)           |
| Graceful Shutdown  | SIGTERM / SIGINT handlers                           |

---

## API Endpoints

| Method | Path                     | Description                        |
|--------|--------------------------|------------------------------------|
| POST   | `/api/contact`           | Contact form submission            |
| POST   | `/api/admissions`        | Admissions enquiry submission      |
| POST   | `/api/donate`            | Initiate Flutterwave payment       |
| POST   | `/api/donate/webhook`    | Flutterwave webhook callback       |
| GET    | `/api/donate/verify`     | Check donation status by tx_ref    |
| GET    | `/api/health`            | Health check                       |

---

## Colour Palette

| Token       | Hex       | Usage                         |
|-------------|-----------|-------------------------------|
| Navy        | `#0D1F3C` | Primary brand colour          |
| Navy Deep   | `#081428` | Dark sections, navbar         |
| Chestnut    | `#8C4A2F` | Accent — rooftop, CTAs        |
| Gold        | `#C4973A` | Highlight — numbers, labels   |
| Off-white   | `#F8F5F0` | Section backgrounds           |
| Cream       | `#F2EDE4` | Quote section                 |

---

## Fonts
- **Cormorant Garamond** — Display / headings (elegant serif)
- **DM Sans** — Body / UI text (clean sans-serif)

Both loaded from Google Fonts.

---

## Roadmap / Next Steps
- [ ] Deploy to a VPS (DigitalOcean / Railway / Render)
- [ ] Add Nginx reverse proxy with SSL (Let's Encrypt)
- [ ] Activate Flutterwave live keys
- [ ] Photo gallery with real school photography
- [ ] Parent portal (JWT-protected)
- [ ] Admin dashboard for viewing submissions
- [ ] SMS notifications via Africa's Talking
- [ ] School fee structure / download PDF
- [ ] News & Events section
