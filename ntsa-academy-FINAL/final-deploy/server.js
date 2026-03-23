/**
 * ═══════════════════════════════════════════════════════════════
 *  NTSA DRIVING ACADEMY — BUSINESS BACKEND  v2.0
 *  Node.js + Express
 *
 *  Routes:
 *    POST /api/auth/register      — create account
 *    POST /api/auth/login         — login, get JWT
 *    GET  /api/auth/me            — get own profile (auth required)
 *    POST /api/pay                — initiate M-Pesa STK Push
 *    POST /api/mpesa/callback           — Safaricom payment webhook
 *    GET  /api/verify             — poll payment status by phone
 *    POST /api/progress           — save quiz/sim session (auth required)
 *    GET  /api/dashboard          — get full stats (auth required)
 *    POST /api/lead               — driving school lead capture
 *    GET  /api/admin/users        — admin: list all users (admin token)
 *
 *  START:  node server.js
 *  DEV:    npm run dev  (nodemon)
 * ═══════════════════════════════════════════════════════════════
 */

'use strict';

const express  = require('express');
const axios    = require('axios');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const fs       = require('fs');
const path     = require('path');
const crypto   = require('crypto');
const cors     = require('cors');
require('dotenv').config();

const app = express();
app.use(express.json());
app.use(cors({ origin: process.env.CORS_ORIGIN || '*' }));

/* ── Resolve static files directory ──────────────────────────────
   Works whether files are in  ./public/  (recommended structure)
   or flat next to server.js  (e.g. dragged into Render manually).
   Check which layout is present at startup and use that.        */
const fs = require('fs');
const PUBLIC_DIR = fs.existsSync(path.join(__dirname, 'public', 'index.html'))
  ? path.join(__dirname, 'public')   // structured: public/ subfolder
  : __dirname;                        // flat: everything alongside server.js

app.use(express.static(PUBLIC_DIR));

/* Serve landing page at root / */
app.get('/', (req, res) => {
  const landing = path.join(PUBLIC_DIR, 'landing.html');
  if (fs.existsSync(landing)) {
    res.sendFile(landing);
  } else {
    res.sendFile(path.join(PUBLIC_DIR, 'index.html'));
  }
});

/* ─────────────────────────────────────────────
   CONFIG
───────────────────────────────────────────── */
const {
  PORT              = 3000,
  JWT_SECRET        = 'change_this_secret_in_production_please',
  ADMIN_TOKEN       = 'admin_secret_change_me',
  MPESA_CONSUMER_KEY,
  MPESA_CONSUMER_SECRET,
  MPESA_PASSKEY,
  MPESA_SHORTCODE,
  MPESA_CALLBACK_URL,
  MPESA_SANDBOX     = 'true',
} = process.env;

const MPESA_BASE = MPESA_SANDBOX === 'true'
  ? 'https://sandbox.safaricom.co.ke'
  : 'https://api.safaricom.co.ke';

/* ── Plans ── */
const PLANS = {
  free:     { price: 0,    days: 9999, label: 'Free',          quizLimit: 10,  simMinutes: 3  },
  monthly:  { price: 150,  days: 30,   label: 'Monthly',       quizLimit: 999, simMinutes: 999 },
  course:   { price: 999,  days: 365,  label: 'Course Pack',   quizLimit: 999, simMinutes: 999 },
  school:   { price: 5000, days: 31,   label: 'School Licence',quizLimit: 999, simMinutes: 999 },
};

/* ── Freemium limits (enforced server-side too) ── */
const FREE_QUIZ_DAILY = 10;
const FREE_SIM_MINS   = 3;

/* ─────────────────────────────────────────────
   FILE-BASED DB  (swap for MongoDB in prod)
───────────────────────────────────────────── */
const DB_USERS    = path.join(__dirname, 'db_users.json');
const DB_PAYMENTS = path.join(__dirname, 'db_payments.json');
const DB_LEADS    = path.join(__dirname, 'db_leads.json');

function readDB(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch { return {}; }
}
function writeDB(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* Shorthand */
const Users    = () => readDB(DB_USERS);
const Payments = () => readDB(DB_PAYMENTS);
const Leads    = () => readDB(DB_LEADS);
const saveUsers    = d => writeDB(DB_USERS,    d);
const savePayments = d => writeDB(DB_PAYMENTS, d);
const saveLeads    = d => writeDB(DB_LEADS,    d);

/* ─────────────────────────────────────────────
   HELPERS
───────────────────────────────────────────── */
function formatPhone(raw = '') {
  let p = raw.replace(/\s+/g, '').replace(/[^\d+]/g, '');
  if (p.startsWith('+'))  p = p.slice(1);
  if (p.startsWith('0'))  p = '254' + p.slice(1);
  if (!p.startsWith('254')) p = '254' + p;
  return p;
}

function mpesaTimestamp() {
  return new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14);
}

function stkPassword(ts) {
  return Buffer.from(`${MPESA_SHORTCODE}${MPESA_PASSKEY}${ts}`).toString('base64');
}

function makeToken(len = 40) {
  return crypto.randomBytes(len).toString('hex');
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);   // "2025-01-15"
}

function isActivePlan(user) {
  if (!user.plan || user.plan === 'free') return false;
  return user.planExpiry > Date.now();
}

/* Sign JWT */
function signJWT(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
}

/* Auth middleware */
function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Not authenticated.' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Token expired or invalid.' });
  }
}

/* Admin middleware */
function adminAuth(req, res, next) {
  if (req.headers['x-admin-token'] !== ADMIN_TOKEN) {
    return res.status(403).json({ error: 'Forbidden.' });
  }
  next();
}

async function mpesaAccessToken() {
  const creds = Buffer.from(`${MPESA_CONSUMER_KEY}:${MPESA_CONSUMER_SECRET}`).toString('base64');
  const { data } = await axios.get(
    `${MPESA_BASE}/oauth/v1/generate?grant_type=client_credentials`,
    { headers: { Authorization: `Basic ${creds}` } }
  );
  return data.access_token;
}

/* Health check — used by UptimeRobot to keep free-tier server awake */
app.get('/health', (req, res) => {
  res.json({ status: 'ok', ts: Date.now(), env: MPESA_SANDBOX === 'true' ? 'sandbox' : 'live' });
});

/* ─────────────────────────────────────────────
   AUTH ROUTES
───────────────────────────────────────────── */

/**
 * POST /api/auth/register
 * Body: { name, phone, email?, password }
 */
app.post('/api/auth/register', async (req, res) => {
  try {
    const { name, email = '', password } = req.body;
    const phone = formatPhone(req.body.phone || '');

    if (!name || !phone || !password)
      return res.status(400).json({ error: 'Name, phone and password are required.' });
    if (password.length < 6)
      return res.status(400).json({ error: 'Password must be at least 6 characters.' });
    if (phone.length < 12)
      return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' });

    const users = Users();
    if (users[phone])
      return res.status(409).json({ error: 'An account already exists for this phone number.' });

    const hash = await bcrypt.hash(password, 10);

    users[phone] = {
      id:          makeToken(12),
      name,
      phone,
      email,
      passwordHash: hash,
      plan:        'free',
      planExpiry:  null,
      createdAt:   new Date().toISOString(),
      lastSeen:    new Date().toISOString(),
      /* Progress */
      quizSessions: [],         // [{ date, score, total, topic, pct }]
      mistakes:     {},         // { [qi]: { wrongCount, lastDate, q, cat } }
      simSessions:  [],         // [{ date, minutes }]
      streak:       0,
      lastStreakDay: null,
      totalQuizAnswered: 0,
      totalCorrect:      0,
      /* Daily usage (freemium gate) */
      dailyQuiz:   { date: null, count: 0 },
      dailySim:    { date: null, minutes: 0 },
    };
    saveUsers(users);

    const token = signJWT({ phone, id: users[phone].id });
    const user  = sanitiseUser(users[phone]);

    console.log(`[REGISTER] ${name} | ${phone}`);
    res.json({ success: true, token, user });

  } catch (err) {
    console.error('[REGISTER ERROR]', err.message);
    res.status(500).json({ error: 'Registration failed. Please try again.' });
  }
});

/**
 * POST /api/auth/login
 * Body: { phone, password }
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const phone = formatPhone(req.body.phone || '');
    const { password } = req.body;

    if (!phone || !password)
      return res.status(400).json({ error: 'Phone and password are required.' });

    const users = Users();
    const user  = users[phone];

    if (!user)
      return res.status(401).json({ error: 'No account found for this phone number.' });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok)
      return res.status(401).json({ error: 'Incorrect password.' });

    /* Update last seen + streak */
    users[phone].lastSeen = new Date().toISOString();
    users[phone] = updateStreak(users[phone]);
    saveUsers(users);

    const token = signJWT({ phone, id: user.id });
    console.log(`[LOGIN] ${user.name} | ${phone}`);
    res.json({ success: true, token, user: sanitiseUser(users[phone]) });

  } catch (err) {
    console.error('[LOGIN ERROR]', err.message);
    res.status(500).json({ error: 'Login failed. Please try again.' });
  }
});

/**
 * GET /api/auth/me
 * Returns current user profile
 */
app.get('/api/auth/me', auth, (req, res) => {
  const users = Users();
  const user  = users[req.user.phone];
  if (!user) return res.status(404).json({ error: 'User not found.' });
  res.json({ user: sanitiseUser(user) });
});

/* ─────────────────────────────────────────────
   PAYMENT ROUTES
───────────────────────────────────────────── */

/**
 * POST /api/pay
 * Body: { phone, plan }  — plan: 'monthly' | 'course' | 'school'
 * Auth optional (if logged in, links payment to account)
 */
app.post('/api/pay', async (req, res) => {
  try {
    const { plan = 'monthly' } = req.body;
    const phone = formatPhone(req.body.phone || '');

    if (!phone || phone.length < 12)
      return res.status(400).json({ error: 'Enter a valid Kenyan phone number.' });

    const planCfg = PLANS[plan];
    if (!planCfg || plan === 'free')
      return res.status(400).json({ error: 'Invalid plan.' });

    const accessToken = await mpesaAccessToken();
    const ts  = mpesaTimestamp();
    const pwd = stkPassword(ts);

    const { data } = await axios.post(
      `${MPESA_BASE}/mpesa/stkpush/v1/processrequest`,
      {
        BusinessShortCode: MPESA_SHORTCODE,
        Password:          pwd,
        Timestamp:         ts,
        TransactionType:   'CustomerPayBillOnline',
        Amount:            planCfg.price,
        PartyA:            phone,
        PartyB:            MPESA_SHORTCODE,
        PhoneNumber:       phone,
        CallBackURL:       MPESA_CALLBACK_URL,
        AccountReference:  'NTSAAcademy',
        TransactionDesc:   `NTSA Academy ${planCfg.label}`,
      },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    /* Save pending */
    const payments = Payments();
    payments[phone] = {
      ...payments[phone],
      pending: { checkoutId: data.CheckoutRequestID, plan, startedAt: Date.now() },
    };
    savePayments(payments);

    console.log(`[PAY] STK Push → ${phone} | ${planCfg.label} | KES ${planCfg.price}`);
    res.json({ success: true, checkoutId: data.CheckoutRequestID,
               message: 'M-Pesa prompt sent. Enter your PIN on your phone.' });

  } catch (err) {
    const msg = err.response?.data?.errorMessage || err.message;
    console.error('[PAY ERROR]', msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * POST /api/mpesa/callback — Safaricom webhook
 */
app.post('/api/mpesa/callback', (req, res) => {
  try {
    const cb = req.body?.Body?.stkCallback;
    if (!cb) return res.json({ ResultCode: 0, ResultDesc: 'Accepted' });

    const { ResultCode, CallbackMetadata } = cb;

    if (ResultCode === 0) {
      const meta = {};
      (CallbackMetadata?.Item || []).forEach(({ Name, Value }) => { meta[Name] = Value; });

      const phone     = formatPhone(String(meta.PhoneNumber));
      const amount    = meta.Amount;
      const mpesaRef  = meta.MpesaReceiptNumber;
      const payments  = Payments();
      const plan      = payments[phone]?.pending?.plan || 'monthly';
      const planCfg   = PLANS[plan];
      const token     = makeToken();
      const expiry    = Date.now() + planCfg.days * 86400000;

      payments[phone] = { token, expiry, plan, paid: true, amount, mpesaRef,
                          paidAt: new Date().toISOString() };
      savePayments(payments);

      /* Upgrade user account if they're registered */
      const users = Users();
      if (users[phone]) {
        users[phone].plan       = plan;
        users[phone].planExpiry = expiry;
        users[phone].mpesaRef   = mpesaRef;
        saveUsers(users);
      }

      console.log(`[CALLBACK] ✓ Payment | ${phone} | KES ${amount} | Ref: ${mpesaRef}`);
    } else {
      console.log(`[CALLBACK] ✗ Not completed | ResultCode ${ResultCode}`);
    }

    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('[CALLBACK ERROR]', err.message);
    res.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  }
});

/**
 * GET /api/verify?phone=0712345678
 * Poll after STK Push to check payment
 */
app.get('/api/verify', (req, res) => {
  const phone  = formatPhone(req.query.phone || '');
  const record = Payments()[phone];

  if (!record?.paid) return res.json({ paid: false });
  if (record.expiry < Date.now()) return res.json({ paid: false, expired: true });

  const daysLeft = Math.ceil((record.expiry - Date.now()) / 86400000);
  res.json({ paid: true, token: record.token, expiry: record.expiry,
             plan: record.plan, daysLeft });
});

/* ─────────────────────────────────────────────
   PROGRESS & DASHBOARD
───────────────────────────────────────────── */

/**
 * POST /api/progress
 * Body: { type: 'quiz'|'sim', ...data }
 * Auth required
 */
app.post('/api/progress', auth, (req, res) => {
  try {
    const { type } = req.body;
    const phone  = req.user.phone;
    const users  = Users();
    const user   = users[phone];
    if (!user) return res.status(404).json({ error: 'User not found.' });

    const today  = todayKey();
    const premium = isActivePlan(user);

    if (type === 'quiz') {
      const { score, total, topic = 'general', pct } = req.body;

      /* Freemium gate */
      if (!premium) {
        if (user.dailyQuiz.date !== today) {
          user.dailyQuiz = { date: today, count: 0 };
        }
        if (user.dailyQuiz.count >= FREE_QUIZ_DAILY) {
          return res.status(403).json({
            error: 'free_limit',
            message: `Free tier: ${FREE_QUIZ_DAILY} questions per day. Upgrade to continue.`,
          });
        }
        user.dailyQuiz.count += (total || 0);
      }

      user.quizSessions.push({ date: today, score, total, topic, pct });
      user.totalQuizAnswered += (total || 0);
      user.totalCorrect      += (score || 0);
      if (user.quizSessions.length > 200) user.quizSessions.shift(); // cap at 200

      /* Save mistake data if provided */
      const { mistakes: incomingMistakes = {} } = req.body;
      if (!user.mistakes) user.mistakes = {};
      Object.entries(incomingMistakes).forEach(([qi, m]) => {
        if (!user.mistakes[qi]) {
          user.mistakes[qi] = { qi: Number(qi), cat: m.cat, q: m.q, wrongCount: 0, firstDate: today };
        }
        user.mistakes[qi].wrongCount  = m.wrongCount || user.mistakes[qi].wrongCount;
        user.mistakes[qi].lastDate    = today;
        if (m.mastered) user.mistakes[qi].mastered = true;
      });

    } else if (type === 'sim') {
      const { minutes } = req.body;

      if (!premium) {
        if (user.dailySim.date !== today) {
          user.dailySim = { date: today, minutes: 0 };
        }
        if (user.dailySim.minutes >= FREE_SIM_MINS) {
          return res.status(403).json({
            error: 'free_limit',
            message: `Free tier: ${FREE_SIM_MINS} minutes simulator per day. Upgrade to continue.`,
          });
        }
        user.dailySim.minutes += (minutes || 0);
      }

      user.simSessions.push({ date: today, minutes });
      if (user.simSessions.length > 100) user.simSessions.shift();
    }

    user.lastSeen = new Date().toISOString();
    users[phone] = updateStreak(user);
    saveUsers(users);

    res.json({ success: true, user: sanitiseUser(users[phone]) });

  } catch (err) {
    console.error('[PROGRESS ERROR]', err.message);
    res.status(500).json({ error: 'Could not save progress.' });
  }
});

/**
 * GET /api/dashboard
 * Returns full stats for the logged-in user
 */
app.get('/api/dashboard', auth, (req, res) => {
  const users = Users();
  const user  = users[req.user.phone];
  if (!user) return res.status(404).json({ error: 'User not found.' });

  const premium    = isActivePlan(user);
  const today      = todayKey();
  const readiness  = calcReadiness(user);

  /* Last 7-day quiz trend */
  const last7 = getLast7Days();
  const trend  = last7.map(d => {
    const sessions = user.quizSessions.filter(s => s.date === d);
    const total    = sessions.reduce((a, s) => a + (s.total || 0), 0);
    const correct  = sessions.reduce((a, s) => a + (s.score || 0), 0);
    return { date: d, total, pct: total ? Math.round(correct / total * 100) : null };
  });

  /* Today's usage */
  const quizToday = user.dailyQuiz.date === today ? user.dailyQuiz.count : 0;
  const simToday  = user.dailySim.date  === today ? user.dailySim.minutes : 0;

  /* Mistake list */
  const mistakeList = Object.values(user.mistakes || {})
    .filter(m => !m.mastered)
    .sort((a, b) => b.wrongCount - a.wrongCount)
    .slice(0, 50);

  res.json({
    user:        sanitiseUser(user),
    premium,
    readiness,
    trend,
    limits: {
      quizUsed:     quizToday,
      quizMax:      premium ? null : FREE_QUIZ_DAILY,
      simUsed:      simToday,
      simMax:       premium ? null : FREE_SIM_MINS,
    },
    achievements: calcAchievements(user),
    planExpiry:   user.planExpiry,
    daysLeft:     user.planExpiry ? Math.max(0, Math.ceil((user.planExpiry - Date.now()) / 86400000)) : null,
    mistakeCount: mistakeList.length,
    topMistakes:  mistakeList.slice(0, 5),
  });
});

/* ─────────────────────────────────────────────
   DRIVING SCHOOL LEADS
───────────────────────────────────────────── */

/**
 * POST /api/lead
 * Body: { name, phone, school?, location? }
 */
app.post('/api/lead', (req, res) => {
  try {
    const { name, school = '', location = '' } = req.body;
    const phone = formatPhone(req.body.phone || '');

    if (!name || !phone) return res.status(400).json({ error: 'Name and phone required.' });

    const leads = Leads();
    leads[phone] = { name, phone, school, location, createdAt: new Date().toISOString() };
    saveLeads(leads);

    console.log(`[LEAD] ${name} | ${phone} | ${school}`);
    res.json({ success: true, message: 'Lead saved. Instructor will contact you soon.' });
  } catch (err) {
    res.status(500).json({ error: 'Could not save lead.' });
  }
});

/* ─────────────────────────────────────────────
   ADMIN
───────────────────────────────────────────── */

app.get('/api/admin/users', adminAuth, (req, res) => {
  const users = Users();
  const list  = Object.values(users).map(u => ({
    name:    u.name,
    phone:   u.phone,
    plan:    u.plan,
    expiry:  u.planExpiry,
    streak:  u.streak,
    quizAnswered: u.totalQuizAnswered,
    joined:  u.createdAt,
    lastSeen: u.lastSeen,
  }));
  res.json({ count: list.length, users: list });
});

app.get('/api/admin/revenue', adminAuth, (req, res) => {
  const payments = Payments();
  const paid = Object.values(payments).filter(p => p.paid);
  const total = paid.reduce((s, p) => s + (p.amount || 0), 0);
  res.json({
    transactions: paid.length,
    totalKES: total,
    payments: paid.map(p => ({ amount: p.amount, plan: p.plan,
                               ref: p.mpesaRef, date: p.paidAt })),
  });
});

/* ─────────────────────────────────────────────
   BUSINESS LOGIC HELPERS
───────────────────────────────────────────── */

/** Strip sensitive fields before sending to client */
function sanitiseUser(u) {
  const { passwordHash, ...safe } = u;
  return safe;
}

/** Update login streak */
function updateStreak(user) {
  const today     = todayKey();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  if (user.lastStreakDay === today) return user;          // already counted today

  if (user.lastStreakDay === yesterday) {
    user.streak = (user.streak || 0) + 1;                 // consecutive day ✓
  } else if (user.lastStreakDay !== today) {
    user.streak = 1;                                      // streak reset
  }

  user.lastStreakDay = today;
  return user;
}

/**
 * Compute "NTSA Readiness Score" 0–100
 * Weighted: quiz accuracy 60%, variety of topics 20%, sessions 20%
 */
function calcReadiness(user) {
  if (!user.totalQuizAnswered) return 0;

  const accuracy     = user.totalCorrect / user.totalQuizAnswered;           // 0–1
  const topicsSet    = new Set(user.quizSessions.map(s => s.topic));
  const topicScore   = Math.min(topicsSet.size / 7, 1);                       // 7 topics max
  const sessionScore = Math.min(user.quizSessions.length / 20, 1);           // 20 sessions = max

  const raw = (accuracy * 0.6 + topicScore * 0.2 + sessionScore * 0.2) * 100;
  return Math.round(Math.min(raw, 100));
}

/** Award badges */
function calcAchievements(user) {
  const badges = [];
  if (user.streak >= 3)               badges.push({ id: 'streak3',   label: '3-Day Streak 🔥' });
  if (user.streak >= 7)               badges.push({ id: 'streak7',   label: '7-Day Streak 🏆' });
  if (user.totalQuizAnswered >= 50)   badges.push({ id: 'q50',       label: '50 Questions ✅' });
  if (user.totalQuizAnswered >= 200)  badges.push({ id: 'q200',      label: '200 Questions 🎓' });
  const acc = user.totalQuizAnswered ? user.totalCorrect / user.totalQuizAnswered : 0;
  if (acc >= 0.8 && user.totalQuizAnswered >= 20) badges.push({ id: 'ace', label: 'Ace Scorer ⭐' });
  return badges;
}

/** Last 7 calendar days as YYYY-MM-DD strings */
function getLast7Days() {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400000);
    return d.toISOString().slice(0, 10);
  });
}

/* ─────────────────────────────────────────────
   START
───────────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n🎓  NTSA Academy Server  →  http://localhost:${PORT}`);
  console.log(`📱  M-Pesa mode          →  ${MPESA_SANDBOX === 'true' ? 'SANDBOX' : '🔴 LIVE'}`);
  console.log(`\n  Auth:     POST /api/auth/register  |  POST /api/auth/login`);
  console.log(`  Payment:  POST /api/pay             |  POST /api/mpesa/callback`);
  console.log(`  App:      POST /api/progress        |  GET  /api/dashboard`);
  console.log(`  Leads:    POST /api/lead`);
  console.log(`  Admin:    GET  /api/admin/users      (x-admin-token header)\n`);
});
