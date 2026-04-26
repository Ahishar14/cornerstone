// server.js — Cornerstone Schools API Server
// Full security stack: Helmet, CORS, rate limiting, input sanitisation, HTTPS-ready
'use strict';

require('dotenv').config();

const express      = require('express');
const helmet       = require('helmet');
const cors         = require('cors');
const compression  = require('compression');
const morgan       = require('morgan');
const path         = require('path');
const rateLimit    = require('express-rate-limit');
const logger       = require('./middleware/logger');
const app          = express();

// Initialize DB on startup (creates tables if they don't exist)
require('./db');

// const app  = express();
const PORT = process.env.PORT || 5000;

//(because it is already on line 12) const path = require('path'); // Add this at the very top with other requires

// ... existing middleware like app.use(cors()) ...

// ADD THIS: Point Express to your frontend folder
// This tells the server where your HTML/CSS/JS files live
app.use(express.static(path.join(__dirname, '../frontend')));

// ... your existing routes like app.use('/api/portal', portalRoutes) ...

// ADD THIS AT THE END (But before app.listen):
// This ensures that if the user refreshes the page, they don't get a 404
app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ── Trust proxy (required when behind Nginx/reverse proxy) ────
app.set('trust proxy', 1);

// ════════════════════════════════════════════════════════════════
// SECURITY HEADERS — Helmet
// ════════════════════════════════════════════════════════════════
app.use(helmet({
  contentSecurityPolicy: { 
    directives: {
      defaultSrc:    ["'self'"],
      scriptSrc:     ["'self'", "'unsafe-inline'", "https://checkout.flutterwave.com"],
      styleSrc:      ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc:       ["'self'", "https://fonts.gstatic.com"],
      imgSrc:        ["'self'", "data:", "https://images.unsplash.com"],
      connectSrc:    ["'self'", "https://api.flutterwave.com"],
      frameSrc:      ["'self'", "https://checkout.flutterwave.com", "https://www.google.com"],
      objectSrc:     ["'none'"],
      baseUri:       ["'self'"],
      formAction:    ["'self'"],
      upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null,
    },
  },
  crossOriginEmbedderPolicy: false,
  hsts: {
    maxAge:            31536000,
    includeSubDomains: true,
    preload:           true,
  },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  xssFilter:            true,
  noSniff:              true,
  frameguard:           { action: 'sameorigin' },
  hidePoweredBy:        true,
}));

// ════════════════════════════════════════════════════════════════
// CORS
// ════════════════════════════════════════════════════════════════
app.use(cors({
    origin: ['http://localhost:5500', 'http://127.0.0.1:5500'],
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true
}));

const allowedOrigins = [
  process.env.FRONTEND_URL || 'http://localhost:5500',
  'http://127.0.0.1:5500',
  'http://localhost:5500',
];
if (process.env.NODE_ENV === 'production' && process.env.PRODUCTION_URL) {
  allowedOrigins.push(process.env.PRODUCTION_URL);
}

// app.use(cors({
//   origin(origin, callback) {
//     // Allow server-to-server (no origin) or listed origins
//     if (!origin || allowedOrigins.includes(origin)) {
//       callback(null, true);
//     } else {
//       logger.warn('CORS rejected origin: %s', origin);
//       callback(new Error('Not allowed by CORS'));
//     }
//   },
//   methods:      ['GET', 'POST', 'OPTIONS'],
//   allowedHeaders: ['Content-Type', 'Authorization'],
//   credentials:  true,
//   maxAge:       600,
// }));

// ════════════════════════════════════════════════════════════════
// BODY PARSING & COMPRESSION
// ════════════════════════════════════════════════════════════════
// Note: /api/donate/webhook needs raw body — applied before json parser

// app.use(cors());
app.use(express.json());

app.use('/api/donate/webhook', express.raw({ type: 'application/json', limit: '64kb' }));

// app.use(express.json({ limit: '32kb' }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(compression());

// ════════════════════════════════════════════════════════════════
// LOGGING
// ════════════════════════════════════════════════════════════════
const morganFormat = process.env.NODE_ENV === 'production' ? 'combined' : 'dev';
app.use(morgan(morganFormat, {
  stream: { write: (msg) => logger.http(msg.trim()) },
  skip: (req) => req.path === '/api/health',
}));

// ════════════════════════════════════════════════════════════════
// RATE LIMITING
// ════════════════════════════════════════════════════════════════
// Global limiter
app.use('/api/', rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10),
  max:      parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders:   false,
  message: { success: false, message: 'Too many requests. Please wait and try again.' },
  skip: (req) => req.path === '/api/health',
}));

// Stricter limiter for contact form
app.use('/api/contact', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.CONTACT_RATE_LIMIT_MAX || '10', 10),
  message:  { success: false, message: 'Too many messages sent. Please wait 15 minutes.' },
}));

// Stricter limiter for admissions
app.use('/api/admissions', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      10,
  message:  { success: false, message: 'Too many submissions. Please wait 15 minutes.' },
}));

// Stricter limiter for donations
app.use('/api/donate', rateLimit({
  windowMs: 15 * 60 * 1000,
  max:      parseInt(process.env.DONATE_RATE_LIMIT_MAX || '20', 10),
  message:  { success: false, message: 'Too many donation attempts. Please wait.' },
}));

// ════════════════════════════════════════════════════════════════
// STATIC FILES (frontend)
// ════════════════════════════════════════════════════════════════
const frontendPath = path.join(__dirname, '..', 'frontend');
app.use(express.static(frontendPath, {
  maxAge:  process.env.NODE_ENV === 'production' ? '7d' : 0,
  etag:    true,
  dotfiles: 'deny',
  setHeaders(res, filePath) {
    // Prevent HTML caching in production
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    }
  },
}));

// ════════════════════════════════════════════════════════════════
// API ROUTES
// ════════════════════════════════════════════════════════════════
const formsRouter  = require('./routes/forms');
const donateRouter = require('./routes/donate');
const adminRouter  = require('./routes/admin');
const portalRouter = require('./routes/portal');

app.use('/api',          formsRouter);
app.use('/api/donate',   donateRouter);
app.use('/api/admin',    adminRouter);
app.use('/api/portal',   portalRouter);

// ── Health check ──────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status:  'ok',
    service: 'Cornerstone Schools API',
    env:     process.env.NODE_ENV || 'development',
    time:    new Date().toISOString(),
  });
});

// ════════════════════════════════════════════════════════════════
// SPA FALLBACK — serve index.html for non-API routes
// ════════════════════════════════════════════════════════════════
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  res.sendFile(path.join(frontendPath, 'index.html'));
});

// ════════════════════════════════════════════════════════════════
// ERROR HANDLERS
// ════════════════════════════════════════════════════════════════
// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: 'Resource not found.' });
});

// 500
app.use((err, req, res, _next) => {
  // CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ success: false, message: 'Forbidden.' });
  }
  logger.error('Unhandled error: %s\n%s', err.message, err.stack);
  const isDev = process.env.NODE_ENV !== 'production';
  res.status(500).json({
    success: false,
    message: 'An internal server error occurred.',
    ...(isDev && { detail: err.message }),
  });
});

// ════════════════════════════════════════════════════════════════
// START SERVER
// ════════════════════════════════════════════════════════════════
// const server = app.listen(PORT, () => {
//   logger.info('🏫  Cornerstone Schools API running on port %d (%s)', PORT, process.env.NODE_ENV || 'development');
// });
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server is running on port ${PORT}`);
});

// Graceful shutdown
function shutdown(signal) {
  logger.info('Received %s — shutting down gracefully', signal);
  server.close(() => {
    logger.info('HTTP server closed');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Promise Rejection: %s', reason);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught Exception: %s\n%s', err.message, err.stack);
  process.exit(1);
});

module.exports = app;
