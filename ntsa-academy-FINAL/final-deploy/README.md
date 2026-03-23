# 🎓 NTSA Driving Academy — Complete Platform

**Kenya's #1 NTSA Theory Test Prep · Built by Framwaka Ultratech Limited**

---

## 📁 File Structure

```
ntsa-academy/
│
├── server.js              ← Node.js backend (all API routes)
├── package.json           ← Dependencies (express, bcryptjs, jwt, axios, cors, dotenv)
├── .env.example           ← Copy to .env and fill in your credentials
├── .gitignore             ← Blocks .env and db files from git
│
├── public/                ← Everything served to the browser
│   ├── landing.html       ← Sales/marketing page (entry point)
│   ├── index.html         ← Full app (simulator, quiz, signs, Q&A)
│   ├── system.js          ← Auth + M-Pesa paywall + dashboard
│   ├── accounts.js        ← User accounts + mistake tracker
│   ├── progress.js        ← Progress tracking + recommendations
│   ├── sw.js              ← Service worker (offline PWA)
│   ├── manifest.json      ← PWA manifest (install to home screen)
│   ├── icon-192.svg       ← App icon
│   └── icon-512.svg       ← App icon (large)
│
└── (auto-created at runtime — never commit these)
    ├── db_users.json      ← User accounts
    ├── db_payments.json   ← Payment records
    └── db_leads.json      ← Driving school leads
```

---

## ⚡ 5-Minute Local Setup

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env — fill in your Daraja API credentials

# 3. Expose for M-Pesa callbacks (local dev only)
# Install ngrok from https://ngrok.com, then:
ngrok http 3000
# Copy the https URL and set in .env:
# MPESA_CALLBACK_URL=https://XXXX.ngrok.io/api/mpesa/callback

# 4. Start
npm run dev         # development (auto-reload)
npm start           # production

# 5. Open
# Landing page:  http://localhost:3000
# App:           http://localhost:3000/index.html
# Admin users:   http://localhost:3000/api/admin/users
#                (add header: x-admin-token: your_token)
# Health check:  http://localhost:3000/health
```

---

## 🌐 Deploy to Render.com (Free)

1. Push this folder to a GitHub repo
2. Go to **render.com** → New Web Service → connect repo
3. Set:
   - Build command: `npm install`
   - Start command: `node server.js`
   - Root directory: *(leave blank — server.js is at root)*
4. Add all environment variables from `.env.example`
5. Deploy → get your URL (e.g. `https://ntsa-academy.onrender.com`)
6. Set `MPESA_CALLBACK_URL=https://ntsa-academy.onrender.com/api/mpesa/callback`
7. Redeploy to pick up the callback URL

**Keep it awake (free):** Set up UptimeRobot to ping `/health` every 5 minutes.

---

## 💰 Revenue Streams

| Plan | Price | Who buys it |
|------|-------|-------------|
| Free | KES 0 | Lead capture (10 questions/day, 3 min simulator) |
| Monthly | KES 150 | Individual students |
| Course Pack | KES 999 | Serious learners (1 year) |
| School Licence | KES 5,000/month | Driving schools (up to 50 students) |

---

## 🔌 API Reference

### Auth
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/auth/register` | `{name, phone, password}` |
| POST | `/api/auth/login` | `{phone, password}` |
| GET  | `/api/auth/me` | Bearer token |

### Payments
| Method | Endpoint | Body / Params |
|--------|----------|---------------|
| POST | `/api/pay` | `{phone, plan}` |
| POST | `/api/mpesa/callback` | Safaricom webhook |
| GET  | `/api/verify` | `?phone=` |

### App
| Method | Endpoint | Body |
|--------|----------|------|
| POST | `/api/progress` | `{type, score, total, topic}` |
| GET  | `/api/dashboard` | Bearer token |
| POST | `/api/lead` | `{name, phone, school}` |

### System
| Method | Endpoint | Notes |
|--------|----------|-------|
| GET | `/health` | UptimeRobot ping — no auth |
| GET | `/api/admin/users` | `x-admin-token` header |
| GET | `/api/admin/revenue` | `x-admin-token` header |

---

## 🎮 Platform Features

### App (index.html)
- 🚗 **Driving Simulator** — canvas-based Model Town, 10 vehicles, traffic lights
- 🛣️ **Road Signs** — all Kenya sign categories, illustrated flipbook
- 📖 **General Q&A** — 62 official questions, TTS narration, realistic book UI
- 📝 **Quiz** — 102 questions, topic filter, random mode, scored Pass/Fail
- 👤 **My Account** — login/register, mistake tracker, retry weak topics

### Progress System (progress.js)
- 📊 **Home Dashboard** — readiness ring, 7-day sparkline, streak, today's activity
- 🏆 **Enhanced Results** — personal best comparison, category breakdown, feedback
- 🎯 **Recommendations** — weak topic detection, untried topics, consistency nudges

### Business System (system.js)
- 🔐 **Auth** — JWT register/login, bcrypt passwords
- 💳 **M-Pesa** — STK Push, callback webhook, polling
- 📈 **Dashboard** — readiness score, achievements, freemium usage meters
- 🚫 **Freemium Gate** — 10 questions/day, 3 min simulator (free tier)

---

## 🔐 Security Checklist (before going live)

- [ ] `JWT_SECRET` is 64+ random characters
- [ ] `ADMIN_TOKEN` is a secure random string
- [ ] `.env` is in `.gitignore` (never pushed to GitHub)
- [ ] `CORS_ORIGIN` is set to your domain (not `*`)
- [ ] `MPESA_SANDBOX=false` when accepting real payments
- [ ] Server is behind HTTPS (Render provides this automatically)

---

## 📞 Support

**Framwaka Ultratech Limited**  
🌐 https://framwakaultratech.lovable.app  
📧 info@framwakaultratech.com  
💬 WhatsApp: +254 700 000 000

*© 2026 Framwaka Ultratech Limited. All rights reserved.*
