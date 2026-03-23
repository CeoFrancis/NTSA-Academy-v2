/**
 * ═══════════════════════════════════════════════════════════════
 *  NTSA DRIVING ACADEMY — FRONTEND BUSINESS SYSTEM  v2.0
 *  system.js  —  drop ONE <script src="system.js"></script>
 *                BEFORE app.js in index.html
 *
 *  Handles:
 *    • Register / Login modal
 *    • JWT token storage & auto-refresh
 *    • Freemium gating (quiz 10/day, sim 3 min/day)
 *    • Plan upgrade modal (M-Pesa STK Push)
 *    • User dashboard sidebar (streak, readiness, plan)
 *    • Gamification (streak counter, readiness bar, achievements)
 *    • Intercepts goTo() to enforce limits per page
 *    • Sends progress to /api/progress after each quiz session
 * ═══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Config ─────────────────────────────────── */
  const API       = '';             // same origin; change if backend on another domain
  const TOKEN_KEY = 'ntsa_jwt';
  const USER_KEY  = 'ntsa_user';
  const CACHE_KEY = 'ntsa_dash';

  /* Free tier limits (must match server) */
  const FREE_QUIZ_DAILY = 10;
  const FREE_SIM_MINS   = 3;

  /* ── State ──────────────────────────────────── */
  let _user      = null;   // current user object
  let _dashboard = null;   // latest dashboard response
  let _token     = null;

  /* ── Fonts (already in index.html — no extra load) ── */

  /* ══════════════════════════════════════════════
     CSS — injected once into <head>
  ══════════════════════════════════════════════ */
  const CSS = `
  /* ── Overlay backdrop ── */
  .sys-overlay {
    position: fixed; inset: 0; z-index: 19000;
    background: rgba(8,11,16,.92);
    backdrop-filter: blur(10px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: sysIn .25s ease both;
  }
  @keyframes sysIn  { from{opacity:0} to{opacity:1} }
  @keyframes sysUp  { from{opacity:0;transform:translateY(24px) scale(.97)} to{opacity:1;transform:none} }
  @keyframes sysOut { from{opacity:1} to{opacity:0} }

  /* ── Modal card ── */
  .sys-card {
    background: #0d1117;
    border: 1px solid #1a2535;
    border-radius: 12px;
    width: 100%; max-width: 420px;
    overflow: hidden;
    box-shadow: 0 0 0 1px rgba(245,197,24,.07), 0 40px 80px rgba(0,0,0,.7);
    animation: sysUp .3s cubic-bezier(.16,1,.3,1) both;
  }
  .sys-card-head {
    padding: 24px 28px 18px;
    border-bottom: 1px solid #1a2535;
    text-align: center;
  }
  .sys-hex {
    display: inline-flex; align-items:center; justify-content:center;
    width:44px; height:44px;
    background: var(--gold,#f5c518);
    clip-path: polygon(50% 0%,100% 25%,100% 75%,50% 100%,0% 75%,0% 25%);
    font-family: 'Orbitron',sans-serif; font-weight:900; font-size:.55rem;
    color:#000; margin-bottom: 12px;
  }
  .sys-card-title {
    font-family: 'Orbitron',sans-serif; font-size:.75rem;
    font-weight:700; color:var(--gold,#f5c518); letter-spacing:2px;
    margin-bottom: 4px;
  }
  .sys-card-sub {
    font-family: 'Share Tech Mono',monospace; font-size:.48rem;
    color: var(--dim,#3a4a60); letter-spacing:1px;
  }
  .sys-card-body { padding: 24px 28px; }

  /* ── Tabs ── */
  .sys-tabs {
    display: flex; gap:0; margin-bottom: 24px;
    border: 1px solid #1a2535; border-radius: 6px; overflow: hidden;
  }
  .sys-tab {
    flex:1; padding: 10px; border:none; background: transparent;
    font-family:'Orbitron',sans-serif; font-size:.46rem; letter-spacing:2px;
    color: var(--dim,#3a4a60); cursor: pointer; transition: all .18s;
  }
  .sys-tab.active {
    background: rgba(245,197,24,.1);
    color: var(--gold,#f5c518);
    border-bottom: 2px solid var(--gold,#f5c518);
  }

  /* ── Form fields ── */
  .sys-field { margin-bottom: 14px; }
  .sys-label {
    display: block; font-family:'Orbitron',sans-serif;
    font-size:.38rem; letter-spacing:2px; color:var(--dim,#3a4a60);
    margin-bottom: 6px; text-transform:uppercase;
  }
  .sys-input {
    width:100%; padding:12px 14px;
    background:#080b10; border:1px solid #1a2535;
    border-radius:5px; color:var(--text,#c8d8e8);
    font-family:'Share Tech Mono',monospace; font-size:.6rem;
    letter-spacing:1px; outline:none;
    transition: border-color .18s;
  }
  .sys-input:focus { border-color:var(--gold,#f5c518); }
  .sys-input::placeholder { color:#2a3a50; }

  /* ── Buttons ── */
  .sys-btn {
    width:100%; padding:13px;
    border:none; border-radius:5px; cursor:pointer;
    font-family:'Orbitron',sans-serif; font-size:.52rem;
    font-weight:700; letter-spacing:2px; transition: all .18s;
  }
  .sys-btn-gold {
    background:var(--gold,#f5c518); color:#000;
    box-shadow: 0 0 20px rgba(245,197,24,.18);
  }
  .sys-btn-gold:hover { background:#ffd740; transform:translateY(-1px); }
  .sys-btn-outline {
    background:transparent; color:var(--text,#c8d8e8);
    border:1px solid #1a2535;
  }
  .sys-btn-outline:hover { border-color:var(--gold,#f5c518); color:var(--gold,#f5c518); }
  .sys-btn:disabled { opacity:.4; cursor:not-allowed; transform:none !important; }
  .sys-btn-green {
    background:#25d366; color:#fff;
  }
  .sys-btn-green:hover { background:#1ebe59; }

  /* ── Status message ── */
  .sys-status {
    display:none; margin-top:12px; padding:10px 14px;
    border-radius:5px; font-family:'Share Tech Mono',monospace;
    font-size:.5rem; line-height:1.6; text-align:center;
  }
  .sys-status.show  { display:block; }
  .sys-status.info  { background:rgba(41,182,246,.08); border:1px solid rgba(41,182,246,.2); color:#7dcef8; }
  .sys-status.ok    { background:rgba(0,230,118,.08);  border:1px solid rgba(0,230,118,.2);  color:#00e676; }
  .sys-status.err   { background:rgba(255,23,68,.08);  border:1px solid rgba(255,23,68,.2);  color:#ff6b88; }

  .sys-spinner {
    display:inline-block; width:12px; height:12px;
    border:2px solid rgba(245,197,24,.3); border-top-color:var(--gold,#f5c518);
    border-radius:50%; animation:sysSpin .7s linear infinite;
    vertical-align:middle; margin-right:6px;
  }
  @keyframes sysSpin { to { transform:rotate(360deg); } }

  .sys-divider {
    display:flex; align-items:center; gap:10px;
    margin:16px 0; color:#2a3a50;
    font-family:'Share Tech Mono',monospace; font-size:.4rem; letter-spacing:2px;
  }
  .sys-divider::before, .sys-divider::after {
    content:''; flex:1; height:1px; background:#1a2535;
  }

  /* ── Plan cards ── */
  .sys-plans { display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-bottom:20px; }
  .sys-plan {
    border:1px solid #1a2535; border-radius:6px;
    padding:12px 8px; text-align:center; cursor:pointer;
    background:transparent; color:var(--text,#c8d8e8);
    transition: all .18s;
  }
  .sys-plan:hover { border-color:var(--gold,#f5c518); }
  .sys-plan.active { border-color:var(--gold,#f5c518); background:rgba(245,197,24,.07); }
  .sys-plan-name {
    font-family:'Orbitron',sans-serif; font-size:.38rem;
    letter-spacing:2px; color:var(--dim,#3a4a60); margin-bottom:4px;
  }
  .sys-plan.active .sys-plan-name { color:var(--gold,#f5c518); }
  .sys-plan-price { font-size:.85rem; font-weight:900; line-height:1; }
  .sys-plan-unit  { font-family:'Share Tech Mono',monospace; font-size:.38rem; color:var(--dim,#3a4a60); margin-top:3px; }

  /* ── Limit gate modal ── */
  .sys-gate-icon  { font-size:2.2rem; text-align:center; margin-bottom:12px; }
  .sys-gate-title {
    font-family:'Orbitron',sans-serif; font-size:.7rem; font-weight:700;
    color:var(--gold,#f5c518); letter-spacing:2px; text-align:center; margin-bottom:8px;
  }
  .sys-gate-msg   { font-size:.55rem; color:var(--dim,#3a4a60); text-align:center; line-height:1.7; margin-bottom:20px; }
  .sys-features   { list-style:none; margin-bottom:20px; display:flex; flex-direction:column; gap:8px; }
  .sys-features li {
    display:flex; align-items:center; gap:8px;
    font-family:'Share Tech Mono',monospace; font-size:.5rem; color:var(--text,#c8d8e8);
  }
  .sys-features li::before { content:'✓'; color:var(--green,#00e676); font-weight:bold; }

  /* ── Dashboard sidebar ── */
  #sysDash {
    position: fixed; top: 0; right: -340px; bottom: 0;
    width: 320px; z-index: 18000;
    background: #0d1117;
    border-left: 1px solid #1a2535;
    display: flex; flex-direction: column;
    transition: right .3s cubic-bezier(.16,1,.3,1);
    box-shadow: -8px 0 40px rgba(0,0,0,.5);
  }
  #sysDash.open { right: 0; }

  .dash-head {
    padding: 18px 20px;
    border-bottom: 1px solid #1a2535;
    display: flex; align-items:center; justify-content:space-between;
  }
  .dash-name {
    font-family:'Orbitron',sans-serif; font-size:.6rem; font-weight:700;
    color:var(--gold,#f5c518); letter-spacing:2px;
  }
  .dash-plan-badge {
    font-family:'Share Tech Mono',monospace; font-size:.4rem; letter-spacing:1px;
    padding: 3px 8px; border-radius:12px;
  }
  .dash-plan-badge.free    { background:rgba(58,74,96,.4); color:#3a4a60; border:1px solid #1a2535; }
  .dash-plan-badge.premium { background:rgba(245,197,24,.12); color:var(--gold,#f5c518); border:1px solid rgba(245,197,24,.3); }
  .dash-close {
    background:none; border:none; color:var(--dim,#3a4a60);
    font-size:.9rem; cursor:pointer; transition:color .15s; padding:2px 6px;
  }
  .dash-close:hover { color:var(--text,#c8d8e8); }

  .dash-body { flex:1; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:16px; }
  .dash-body::-webkit-scrollbar { width:3px; }
  .dash-body::-webkit-scrollbar-thumb { background:#1a2535; border-radius:2px; }

  /* Readiness ring */
  .dash-readiness {
    background:#111820; border:1px solid #1a2535; border-radius:10px;
    padding:18px; text-align:center;
  }
  .dash-readiness-ring {
    width:96px; height:96px; margin:0 auto 12px;
    position:relative;
  }
  .dash-readiness-ring svg { width:100%; height:100%; transform:rotate(-90deg); }
  .ring-bg    { fill:none; stroke:#1a2535; stroke-width:8; }
  .ring-fill  { fill:none; stroke:var(--gold,#f5c518); stroke-width:8; stroke-linecap:round;
                transition: stroke-dashoffset .8s cubic-bezier(.16,1,.3,1); }
  .ring-score {
    position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center;
    font-family:'Orbitron',sans-serif;
  }
  .ring-num  { font-size:.85rem; font-weight:900; color:var(--gold,#f5c518); line-height:1; }
  .ring-lbl  { font-size:.3rem; letter-spacing:2px; color:var(--dim,#3a4a60); margin-top:2px; }
  .dash-readiness-label {
    font-family:'Orbitron',sans-serif; font-size:.42rem; letter-spacing:2px;
    color:var(--text,#c8d8e8); margin-bottom:4px;
  }
  .dash-readiness-sub { font-size:.45rem; color:var(--dim,#3a4a60); font-family:'Share Tech Mono',monospace; }

  /* Streak */
  .dash-streak {
    background:#111820; border:1px solid #1a2535; border-radius:10px;
    padding:14px 16px; display:flex; align-items:center; gap:14px;
  }
  .streak-fire { font-size:1.8rem; line-height:1; }
  .streak-num  { font-family:'Orbitron',sans-serif; font-size:.9rem; font-weight:900; color:var(--orange,#ff9100); line-height:1; }
  .streak-lbl  { font-family:'Share Tech Mono',monospace; font-size:.42rem; color:var(--dim,#3a4a60); letter-spacing:1px; }

  /* Stats row */
  .dash-stats { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .dash-stat {
    background:#111820; border:1px solid #1a2535; border-radius:8px;
    padding:12px; text-align:center;
  }
  .dash-stat-num  { font-family:'Orbitron',sans-serif; font-size:.7rem; font-weight:700; color:var(--gold,#f5c518); }
  .dash-stat-lbl  { font-family:'Share Tech Mono',monospace; font-size:.38rem; color:var(--dim,#3a4a60); letter-spacing:1px; margin-top:3px; }

  /* Usage meters */
  .dash-meter { margin-bottom:8px; }
  .dash-meter-row { display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; }
  .dash-meter-label { font-family:'Share Tech Mono',monospace; font-size:.42rem; color:var(--dim,#3a4a60); letter-spacing:1px; }
  .dash-meter-val   { font-family:'Orbitron',sans-serif; font-size:.42rem; color:var(--text,#c8d8e8); }
  .dash-bar { height:4px; background:#1a2535; border-radius:2px; overflow:hidden; }
  .dash-bar-fill { height:100%; border-radius:2px; transition:width .5s ease; }
  .dash-bar-fill.quiz { background:var(--gold,#f5c518); }
  .dash-bar-fill.sim  { background:var(--cyan,#00e5ff); }

  /* Trend chart (7 days) */
  .dash-trend {
    background:#111820; border:1px solid #1a2535; border-radius:10px;
    padding:14px 16px;
  }
  .dash-trend-title { font-family:'Orbitron',sans-serif; font-size:.4rem; letter-spacing:2px; color:var(--dim,#3a4a60); margin-bottom:10px; }
  .trend-bars { display:flex; align-items:flex-end; gap:4px; height:40px; }
  .trend-bar-wrap { flex:1; display:flex; flex-direction:column; align-items:center; gap:3px; }
  .trend-bar { width:100%; border-radius:2px 2px 0 0; transition:height .5s ease; min-height:2px; }
  .trend-day { font-family:'Share Tech Mono',monospace; font-size:.3rem; color:var(--dim,#3a4a60); }

  /* Achievements */
  .dash-badges { display:flex; flex-wrap:wrap; gap:6px; }
  .dash-badge {
    background:rgba(245,197,24,.07); border:1px solid rgba(245,197,24,.2);
    border-radius:20px; padding:4px 10px;
    font-family:'Share Tech Mono',monospace; font-size:.42rem; color:var(--gold,#f5c518);
  }

  /* Upgrade CTA */
  .dash-upgrade {
    background:linear-gradient(135deg,rgba(245,197,24,.08),rgba(245,197,24,.03));
    border:1px solid rgba(245,197,24,.2); border-radius:10px;
    padding:14px 16px; text-align:center;
  }
  .dash-upgrade-title { font-family:'Orbitron',sans-serif; font-size:.5rem; font-weight:700; color:var(--gold,#f5c518); letter-spacing:2px; margin-bottom:6px; }
  .dash-upgrade-sub   { font-family:'Share Tech Mono',monospace; font-size:.42rem; color:var(--dim,#3a4a60); line-height:1.6; margin-bottom:12px; }

  /* ── Top nav user button ── */
  #sysNavBtn {
    display:flex; align-items:center; gap:6px;
    padding: 6px 12px;
    background:transparent; border:1px solid #1a2535;
    border-radius:5px; cursor:pointer;
    font-family:'Orbitron',sans-serif; font-size:.44rem; font-weight:700;
    color:var(--dim,#3a4a60); letter-spacing:1px;
    transition:all .18s;
  }
  #sysNavBtn:hover { border-color:var(--gold,#f5c518); color:var(--gold,#f5c518); }
  #sysNavBtn .nav-btn-avatar {
    width:22px; height:22px; border-radius:50%;
    background:var(--gold,#f5c518);
    display:flex; align-items:center; justify-content:center;
    font-size:.5rem; font-weight:900; color:#000; flex-shrink:0;
  }
  #sysNavBtn.logged-in { border-color:rgba(245,197,24,.3); color:var(--gold,#f5c518); }

  /* ── Freemium usage bar (inside app) ── */
  #sysUsageBar {
    display:none;
    position:fixed; bottom:0; left:0; right:0; z-index:9000;
    background:#0d1117; border-top:1px solid #1a2535;
    padding:6px 16px; gap:16px; align-items:center;
    font-family:'Share Tech Mono',monospace; font-size:.44rem; color:var(--dim,#3a4a60);
  }
  #sysUsageBar.show { display:flex; }
  .usage-item { display:flex; align-items:center; gap:6px; }
  .usage-dot  { width:6px; height:6px; border-radius:50%; }
  .usage-dot.warn { background:var(--orange,#ff9100); box-shadow:0 0 5px var(--orange); }
  .usage-dot.ok   { background:var(--green,#00e676);  box-shadow:0 0 5px var(--green); }
  .usage-upgrade {
    margin-left:auto; background:var(--gold,#f5c518); border:none;
    color:#000; padding:5px 12px; border-radius:4px;
    font-family:'Orbitron',sans-serif; font-size:.4rem; font-weight:700;
    letter-spacing:1px; cursor:pointer; transition:background .15s;
  }
  .usage-upgrade:hover { background:#ffd740; }

  /* ── Dash backdrop ── */
  #sysDashBackdrop {
    display:none; position:fixed; inset:0; z-index:17999;
    background:rgba(0,0,0,.4);
  }
  #sysDashBackdrop.show { display:block; }
  `;

  const styleEl = document.createElement('style');
  styleEl.textContent = CSS;
  document.head.appendChild(styleEl);

  /* ══════════════════════════════════════════════
     TOKEN / USER STORAGE
  ══════════════════════════════════════════════ */
  function getToken()    { return localStorage.getItem(TOKEN_KEY); }
  function getUser()     { try { return JSON.parse(localStorage.getItem(USER_KEY)); } catch { return null; } }
  function setAuth(token, user) {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    _token = token;
    _user  = user;
  }
  function clearAuth() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem(CACHE_KEY);
    _token = null; _user = null; _dashboard = null;
  }

  function authHeaders() {
    return { 'Content-Type': 'application/json',
             ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}) };
  }

  /* ══════════════════════════════════════════════
     OVERLAY HELPERS
  ══════════════════════════════════════════════ */
  function showOverlay(html, onClose) {
    removeOverlay();
    const el = document.createElement('div');
    el.className = 'sys-overlay';
    el.id = 'sysOverlay';
    el.innerHTML = html;
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    if (onClose) el.addEventListener('click', e => { if (e.target === el) onClose(); });
    return el;
  }
  function removeOverlay() {
    const el = document.getElementById('sysOverlay');
    if (el) el.remove();
    document.body.style.overflow = '';
  }

  function setStatus(ovlId, msg, type) {
    const el = document.getElementById(ovlId);
    if (!el) return;
    el.className = `sys-status ${type} show`;
    el.innerHTML = msg;
  }

  /* ══════════════════════════════════════════════
     AUTH MODAL — Register / Login
  ══════════════════════════════════════════════ */
  function showAuthModal(defaultTab = 'login') {
    showOverlay(`
      <div class="sys-card">
        <div class="sys-card-head">
          <div class="sys-hex">NTSA</div>
          <div class="sys-card-title">DRIVING ACADEMY</div>
          <div class="sys-card-sub">Sign in to track your progress &amp; unlock full access</div>
        </div>
        <div class="sys-card-body">
          <div class="sys-tabs">
            <button class="sys-tab ${defaultTab==='login'?'active':''}" id="sysTabLogin" onclick="NTSA._tab('login')">LOGIN</button>
            <button class="sys-tab ${defaultTab==='register'?'active':''}" id="sysTabReg" onclick="NTSA._tab('register')">REGISTER</button>
          </div>

          <!-- LOGIN FORM -->
          <div id="sysLoginForm" style="${defaultTab!=='login'?'display:none':''}">
            <div class="sys-field">
              <label class="sys-label">Phone Number</label>
              <input id="loginPhone" class="sys-input" type="tel" placeholder="0712 345 678" autocomplete="tel">
            </div>
            <div class="sys-field">
              <label class="sys-label">Password</label>
              <input id="loginPass" class="sys-input" type="password" placeholder="••••••••" autocomplete="current-password">
            </div>
            <button class="sys-btn sys-btn-gold" onclick="NTSA._login()">LOGIN →</button>
            <div class="sys-status" id="loginStatus"></div>
          </div>

          <!-- REGISTER FORM -->
          <div id="sysRegForm" style="${defaultTab!=='register'?'display:none':''}">
            <div class="sys-field">
              <label class="sys-label">Full Name</label>
              <input id="regName" class="sys-input" type="text" placeholder="John Kamau" autocomplete="name">
            </div>
            <div class="sys-field">
              <label class="sys-label">Phone Number (M-Pesa)</label>
              <input id="regPhone" class="sys-input" type="tel" placeholder="0712 345 678" autocomplete="tel">
            </div>
            <div class="sys-field">
              <label class="sys-label">Password (min 6 chars)</label>
              <input id="regPass" class="sys-input" type="password" placeholder="••••••••" autocomplete="new-password">
            </div>
            <button class="sys-btn sys-btn-gold" onclick="NTSA._register()">CREATE ACCOUNT →</button>
            <div class="sys-status" id="regStatus"></div>
          </div>

          <div class="sys-divider">OR CONTINUE FREE</div>
          <button class="sys-btn sys-btn-outline" onclick="NTSA._closeAuth()">Use free version (10 questions/day)</button>
        </div>
      </div>
    `);

    /* Enter-key support */
    setTimeout(() => {
      document.getElementById('loginPass')?.addEventListener('keydown', e => { if(e.key==='Enter') NTSA._login(); });
      document.getElementById('regPass')?.addEventListener('keydown',  e => { if(e.key==='Enter') NTSA._register(); });
      document.getElementById('loginPhone')?.focus();
    }, 50);
  }

  /* ══════════════════════════════════════════════
     UPGRADE (PAYMENT) MODAL
  ══════════════════════════════════════════════ */
  function showUpgradeModal(reason = '') {
    let _plan = 'monthly';

    showOverlay(`
      <div class="sys-card">
        <div class="sys-card-head">
          <div class="sys-hex">💎</div>
          <div class="sys-card-title">UNLOCK FULL ACCESS</div>
          <div class="sys-card-sub">${reason || 'Get unlimited questions, simulator &amp; progress tracking'}</div>
        </div>
        <div class="sys-card-body">

          <div class="sys-plans" id="upgPlans">
            <button class="sys-plan active" data-plan="monthly" onclick="NTSA._upgPlan('monthly',this)">
              <div class="sys-plan-name">MONTHLY</div>
              <div class="sys-plan-price" style="color:var(--gold)">150</div>
              <div class="sys-plan-unit">KES · 30 DAYS</div>
            </button>
            <button class="sys-plan" data-plan="course" onclick="NTSA._upgPlan('course',this)">
              <div class="sys-plan-name">COURSE</div>
              <div class="sys-plan-price" style="color:var(--gold)">999</div>
              <div class="sys-plan-unit">KES · 1 YEAR</div>
            </button>
            <button class="sys-plan" data-plan="school" onclick="NTSA._upgPlan('school',this)">
              <div class="sys-plan-name">SCHOOL</div>
              <div class="sys-plan-price" style="color:var(--gold)">5K</div>
              <div class="sys-plan-unit">KES / MONTH</div>
            </button>
          </div>

          <ul class="sys-features">
            <li>Unlimited quiz questions — all topics</li>
            <li>Full simulator — no time limit</li>
            <li>Progress tracking &amp; readiness score</li>
            <li>Daily streak &amp; achievement badges</li>
            <li>Offline access — works without internet</li>
          </ul>

          <div class="sys-field">
            <label class="sys-label">M-Pesa Phone Number</label>
            <input id="upgPhone" class="sys-input" type="tel"
              placeholder="0712 345 678"
              value="${_user?.phone?.replace(/^254/,'0') || ''}"
              autocomplete="tel">
          </div>

          <button class="sys-btn sys-btn-green" id="upgPayBtn" onclick="NTSA._pay()">
            💚 &nbsp;PAY WITH M-PESA
          </button>
          <div class="sys-status" id="upgStatus"></div>

          <div class="sys-divider">NOT NOW</div>
          <button class="sys-btn sys-btn-outline" onclick="NTSA._closeUpgrade()">Continue with free version</button>
        </div>
      </div>
    `);

    /* Capture plan selection in closure */
    window.__upgPlanSelected = 'monthly';
    setTimeout(() => document.getElementById('upgPhone')?.focus(), 50);
  }

  /* ══════════════════════════════════════════════
     LIMIT GATE MODAL
  ══════════════════════════════════════════════ */
  function showLimitModal(type) {
    const msg = type === 'quiz'
      ? `You've used your <strong>${FREE_QUIZ_DAILY} free questions</strong> for today.<br>Come back tomorrow or upgrade for unlimited access.`
      : `You've reached your <strong>${FREE_SIM_MINS}-minute free simulator</strong> session for today.<br>Upgrade for unlimited driving practice.`;

    showOverlay(`
      <div class="sys-card">
        <div class="sys-card-body" style="text-align:center;padding-top:28px">
          <div class="sys-gate-icon">${type==='quiz' ? '📝' : '🚗'}</div>
          <div class="sys-gate-title">DAILY LIMIT REACHED</div>
          <p class="sys-gate-msg">${msg}</p>
          <button class="sys-btn sys-btn-gold" onclick="NTSA._closeGate();NTSA.showUpgrade('Upgrade to remove all daily limits.')">
            🔓 UPGRADE — KES 150/MONTH
          </button>
          <div style="margin-top:10px">
            <button class="sys-btn sys-btn-outline" onclick="NTSA._closeGate()" style="margin-top:0">Maybe later</button>
          </div>
        </div>
      </div>
    `);
  }

  /* ══════════════════════════════════════════════
     DASHBOARD SIDEBAR
  ══════════════════════════════════════════════ */
  function buildDashboard() {
    const d    = _dashboard;
    const u    = d?.user || _user;
    const prem = d?.premium || false;

    if (!u) return;

    const readiness    = d?.readiness ?? 0;
    const streak       = u.streak     ?? 0;
    const total        = u.totalQuizAnswered ?? 0;
    const correct      = u.totalCorrect      ?? 0;
    const acc          = total ? Math.round(correct / total * 100) : 0;
    const achievements = d?.achievements ?? [];
    const limits       = d?.limits ?? {};
    const trend        = d?.trend  ?? [];
    const daysLeft     = d?.daysLeft ?? null;

    /* Readiness ring */
    const R = 40; const C = 2 * Math.PI * R;
    const dash = C - (readiness / 100) * C;

    /* Trend bars */
    const maxPct  = Math.max(...trend.map(t => t.pct ?? 0), 1);
    const trendHtml = trend.map(t => {
      const h   = t.pct !== null ? Math.round((t.pct / maxPct) * 36) : 0;
      const col = t.pct >= 70 ? 'var(--green)' : t.pct >= 50 ? 'var(--gold)' : 'var(--red)';
      const day = t.date ? t.date.slice(5) : '';
      return `<div class="trend-bar-wrap">
        <div class="trend-bar" style="height:${h}px;background:${h?col:'#1a2535'};"></div>
        <span class="trend-day">${day}</span>
      </div>`;
    }).join('');

    /* Limits */
    const quizPct = limits.quizMax ? Math.min(limits.quizUsed / limits.quizMax * 100, 100) : 0;
    const simPct  = limits.simMax  ? Math.min(limits.simUsed  / limits.simMax  * 100, 100) : 0;

    const dash = document.getElementById('sysDash');
    if (!dash) return;

    dash.innerHTML = `
      <div class="dash-head">
        <div>
          <div class="dash-name">${u.name?.toUpperCase() || 'USER'}</div>
          <div style="margin-top:4px">
            <span class="dash-plan-badge ${prem?'premium':'free'}">${prem ? (u.plan?.toUpperCase()||'PREMIUM') : 'FREE'}</span>
            ${prem && daysLeft !== null ? `<span style="font-family:'Share Tech Mono',monospace;font-size:.38rem;color:var(--dim);margin-left:6px">${daysLeft}d LEFT</span>` : ''}
          </div>
        </div>
        <button class="dash-close" onclick="NTSA.closeDash()" title="Close">✕</button>
      </div>

      <div class="dash-body">

        <!-- Readiness ring -->
        <div class="dash-readiness">
          <div class="dash-readiness-ring">
            <svg viewBox="0 0 96 96">
              <circle class="ring-bg"   cx="48" cy="48" r="${R}"/>
              <circle class="ring-fill" cx="48" cy="48" r="${R}"
                stroke-dasharray="${C}"
                stroke-dashoffset="${dash}"
                style="stroke:${readiness>=70?'var(--green)':readiness>=50?'var(--gold)':'var(--red)'}"/>
            </svg>
            <div class="ring-score">
              <span class="ring-num" style="color:${readiness>=70?'var(--green)':readiness>=50?'var(--gold)':'var(--red)'}">${readiness}</span>
              <span class="ring-lbl">%</span>
            </div>
          </div>
          <div class="dash-readiness-label">NTSA READINESS</div>
          <div class="dash-readiness-sub">
            ${readiness>=80?'✅ Ready for the test!':readiness>=60?'📈 Getting there — keep going':readiness>=30?'📚 More practice needed':'🔰 Just getting started'}
          </div>
        </div>

        <!-- Streak -->
        <div class="dash-streak">
          <span class="streak-fire">🔥</span>
          <div>
            <div class="streak-num">${streak}</div>
            <div class="streak-lbl">DAY${streak!==1?'S':''} STREAK</div>
          </div>
          <div style="margin-left:auto;text-align:right">
            <div style="font-family:'Orbitron',sans-serif;font-size:.42rem;color:var(--dim)">ACCURACY</div>
            <div style="font-family:'Orbitron',sans-serif;font-size:.65rem;font-weight:700;color:var(--gold)">${acc}%</div>
          </div>
        </div>

        <!-- Stats -->
        <div class="dash-stats">
          <div class="dash-stat">
            <div class="dash-stat-num">${total}</div>
            <div class="dash-stat-lbl">QUESTIONS DONE</div>
          </div>
          <div class="dash-stat">
            <div class="dash-stat-num">${correct}</div>
            <div class="dash-stat-lbl">CORRECT</div>
          </div>
        </div>

        ${!prem ? `
        <!-- Usage meters -->
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:.38rem;letter-spacing:2px;color:var(--dim);margin-bottom:10px">TODAY'S USAGE</div>
          <div class="dash-meter">
            <div class="dash-meter-row">
              <span class="dash-meter-label">📝 QUIZ</span>
              <span class="dash-meter-val">${limits.quizUsed||0} / ${FREE_QUIZ_DAILY}</span>
            </div>
            <div class="dash-bar"><div class="dash-bar-fill quiz" style="width:${quizPct}%"></div></div>
          </div>
          <div class="dash-meter">
            <div class="dash-meter-row">
              <span class="dash-meter-label">🚗 SIMULATOR</span>
              <span class="dash-meter-val">${limits.simUsed||0} / ${FREE_SIM_MINS} min</span>
            </div>
            <div class="dash-bar"><div class="dash-bar-fill sim" style="width:${simPct}%"></div></div>
          </div>
        </div>` : ''}

        <!-- 7-day trend -->
        ${trend.length ? `
        <div class="dash-trend">
          <div class="dash-trend-title">7-DAY QUIZ SCORE TREND</div>
          <div class="trend-bars">${trendHtml}</div>
        </div>` : ''}

        <!-- Achievements -->
        ${achievements.length ? `
        <div>
          <div style="font-family:'Orbitron',sans-serif;font-size:.38rem;letter-spacing:2px;color:var(--dim);margin-bottom:8px">ACHIEVEMENTS</div>
          <div class="dash-badges">
            ${achievements.map(a=>`<span class="dash-badge">${a.label}</span>`).join('')}
          </div>
        </div>` : ''}

        <!-- Upgrade CTA if free -->
        ${!prem ? `
        <div class="dash-upgrade">
          <div class="dash-upgrade-title">GO PREMIUM</div>
          <div class="dash-upgrade-sub">Unlimited questions, full simulator,<br>progress tracking &amp; more.</div>
          <button class="sys-btn sys-btn-gold" onclick="NTSA.closeDash();NTSA.showUpgrade()" style="font-size:.48rem">
            🔓 UPGRADE — KES 150/MONTH
          </button>
        </div>` : ''}

        <!-- Logout -->
        <button class="sys-btn sys-btn-outline" onclick="NTSA.logout()" style="font-size:.44rem;margin-top:4px">
          LOGOUT
        </button>

      </div>
    `;
  }

  /* ══════════════════════════════════════════════
     INJECT NAV BUTTON + USAGE BAR + DASHBOARD
  ══════════════════════════════════════════════ */
  function injectUI() {
    /* Nav button */
    const navRight = document.querySelector('.nav-right');
    if (navRight && !document.getElementById('sysNavBtn')) {
      const btn = document.createElement('button');
      btn.id = 'sysNavBtn';
      btn.setAttribute('aria-label','My account');
      btn.innerHTML = `<span class="nav-btn-avatar" id="sysAvatar">?</span><span id="sysNavLabel">LOGIN</span>`;
      btn.onclick = () => NTSA.navBtnClick();
      navRight.insertBefore(btn, navRight.firstChild);
    }

    /* Dashboard sidebar */
    if (!document.getElementById('sysDash')) {
      const dash = document.createElement('div');
      dash.id = 'sysDash';
      document.body.appendChild(dash);

      const backdrop = document.createElement('div');
      backdrop.id = 'sysDashBackdrop';
      backdrop.onclick = () => NTSA.closeDash();
      document.body.appendChild(backdrop);
    }

    /* Freemium usage bar */
    if (!document.getElementById('sysUsageBar')) {
      const bar = document.createElement('div');
      bar.id = 'sysUsageBar';
      bar.innerHTML = `
        <span class="usage-item"><span class="usage-dot ok" id="quizDot"></span><span id="quizUsageTxt">Quiz: 0/${FREE_QUIZ_DAILY}</span></span>
        <span class="usage-item"><span class="usage-dot ok" id="simDot"></span><span id="simUsageTxt">Sim: 0/${FREE_SIM_MINS}min</span></span>
        <button class="usage-upgrade" onclick="NTSA.showUpgrade()">UPGRADE ↑</button>
      `;
      document.body.appendChild(bar);
    }
  }

  function updateNavBtn() {
    const u      = _user;
    const avatar = document.getElementById('sysAvatar');
    const label  = document.getElementById('sysNavLabel');
    const btn    = document.getElementById('sysNavBtn');
    if (!btn) return;

    if (u) {
      if (avatar) avatar.textContent = u.name?.[0]?.toUpperCase() || '?';
      if (label)  label.textContent  = u.name?.split(' ')[0]?.toUpperCase() || 'ME';
      btn.classList.add('logged-in');
    } else {
      if (avatar) avatar.textContent = '?';
      if (label)  label.textContent  = 'LOGIN';
      btn.classList.remove('logged-in');
    }
  }

  function updateUsageBar() {
    if (!_user) return;
    const d = _dashboard;
    const prem = d?.premium || false;
    const bar  = document.getElementById('sysUsageBar');
    if (!bar) return;

    if (prem) { bar.classList.remove('show'); return; }

    const qu   = d?.limits?.quizUsed ?? 0;
    const su   = d?.limits?.simUsed  ?? 0;
    const qEl  = document.getElementById('quizUsageTxt');
    const sEl  = document.getElementById('simUsageTxt');
    const qDot = document.getElementById('quizDot');
    const sDot = document.getElementById('simDot');

    if (qEl)  qEl.textContent  = `Quiz: ${qu}/${FREE_QUIZ_DAILY}`;
    if (sEl)  sEl.textContent  = `Sim: ${su}/${FREE_SIM_MINS}min`;
    if (qDot) qDot.className   = `usage-dot ${qu >= FREE_QUIZ_DAILY ? 'warn' : 'ok'}`;
    if (sDot) sDot.className   = `usage-dot ${su >= FREE_SIM_MINS   ? 'warn' : 'ok'}`;

    bar.classList.add('show');
  }

  /* ══════════════════════════════════════════════
     NETWORK
  ══════════════════════════════════════════════ */
  async function fetchDashboard() {
    if (!getToken()) return;
    try {
      const r = await fetch(`${API}/api/dashboard`, { headers: authHeaders() });
      if (r.status === 401) { clearAuth(); updateNavBtn(); return; }
      _dashboard = await r.json();
      localStorage.setItem(CACHE_KEY, JSON.stringify(_dashboard));
      _user = _dashboard.user;
      localStorage.setItem(USER_KEY, JSON.stringify(_user));
      updateNavBtn();
      updateUsageBar();
    } catch {
      /* offline — use cache */
      try { _dashboard = JSON.parse(localStorage.getItem(CACHE_KEY)); } catch {}
    }
  }

  /* ══════════════════════════════════════════════
     FREEMIUM GATE CHECK (local only — fast)
  ══════════════════════════════════════════════ */
  function localLimitHit(type) {
    if (!_user) return false;           // not logged in — app handles freely
    if (_dashboard?.premium) return false;  // paid user — no limits

    const today = new Date().toISOString().slice(0, 10);
    const u     = _user;

    if (type === 'quiz') {
      const count = u.dailyQuiz?.date === today ? u.dailyQuiz.count : 0;
      return count >= FREE_QUIZ_DAILY;
    }
    if (type === 'sim') {
      const mins = u.dailySim?.date === today ? u.dailySim.minutes : 0;
      return mins >= FREE_SIM_MINS;
    }
    return false;
  }

  /* ══════════════════════════════════════════════
     PUBLIC API  (window.NTSA)
  ══════════════════════════════════════════════ */
  window.NTSA = {

    /* ── called by nav button ── */
    navBtnClick() {
      if (_user) NTSA.openDash();
      else       showAuthModal('login');
    },

    /* ── auth tab switch ── */
    _tab(tab) {
      document.getElementById('sysLoginForm').style.display = tab==='login'  ? '' : 'none';
      document.getElementById('sysRegForm').style.display   = tab==='register'? '' : 'none';
      document.getElementById('sysTabLogin').classList.toggle('active', tab==='login');
      document.getElementById('sysTabReg').classList.toggle('active', tab==='register');
    },

    /* ── register ── */
    async _register() {
      const name  = document.getElementById('regName')?.value.trim();
      const phone = document.getElementById('regPhone')?.value.trim();
      const pass  = document.getElementById('regPass')?.value;
      setStatus('regStatus','<span class="sys-spinner"></span> Creating account…','info');
      try {
        const r = await fetch(`${API}/api/auth/register`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ name, phone, password: pass }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setAuth(d.token, d.user);
        setStatus('regStatus','✓ Account created! Welcome, ' + d.user.name + '!','ok');
        setTimeout(() => { removeOverlay(); updateNavBtn(); fetchDashboard(); }, 1200);
      } catch (e) {
        setStatus('regStatus', '✗ ' + e.message, 'err');
      }
    },

    /* ── login ── */
    async _login() {
      const phone = document.getElementById('loginPhone')?.value.trim();
      const pass  = document.getElementById('loginPass')?.value;
      setStatus('loginStatus','<span class="sys-spinner"></span> Signing in…','info');
      try {
        const r = await fetch(`${API}/api/auth/login`,{
          method:'POST', headers:{'Content-Type':'application/json'},
          body: JSON.stringify({ phone, password: pass }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setAuth(d.token, d.user);
        setStatus('loginStatus','✓ Welcome back, ' + d.user.name + '!','ok');
        setTimeout(() => { removeOverlay(); updateNavBtn(); fetchDashboard(); }, 1000);
      } catch (e) {
        setStatus('loginStatus', '✗ ' + e.message, 'err');
      }
    },

    _closeAuth()    { removeOverlay(); },
    _closeUpgrade() { removeOverlay(); },
    _closeGate()    { removeOverlay(); },

    /* ── plan select ── */
    _upgPlan(plan, btn) {
      document.querySelectorAll('.sys-plan').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.__upgPlanSelected = plan;
    },

    /* ── payment ── */
    async _pay() {
      const phone = document.getElementById('upgPhone')?.value.trim();
      const plan  = window.__upgPlanSelected || 'monthly';
      const btn   = document.getElementById('upgPayBtn');
      if (!phone) { setStatus('upgStatus','Enter your M-Pesa phone number.','err'); return; }
      btn.disabled = true;
      setStatus('upgStatus','<span class="sys-spinner"></span> Sending M-Pesa prompt…','info');
      try {
        const r = await fetch(`${API}/api/pay`,{
          method:'POST', headers:authHeaders(),
          body: JSON.stringify({ phone, plan }),
        });
        const d = await r.json();
        if (!r.ok) throw new Error(d.error);
        setStatus('upgStatus','<span class="sys-spinner"></span> <strong>Check your phone!</strong> Enter your M-Pesa PIN…','info');
        /* Poll for confirmation */
        const paid = await pollPayment(phone, 90);
        if (paid) {
          setStatus('upgStatus','✅ Payment confirmed! Unlocking full access…','ok');
          await fetchDashboard();
          setTimeout(() => { removeOverlay(); updateUsageBar(); }, 1400);
        } else {
          setStatus('upgStatus','⏱ No confirmation yet — enter your PIN and wait 30s, then check again.','err');
          btn.disabled = false;
        }
      } catch (e) {
        setStatus('upgStatus','✗ ' + e.message,'err');
        btn.disabled = false;
      }
    },

    /* ── public methods ── */
    showLogin()          { showAuthModal('login'); },
    showRegister()       { showAuthModal('register'); },
    showUpgrade(reason)  { showUpgradeModal(reason); },
    showLimitGate(type)  { showLimitModal(type); },

    openDash() {
      buildDashboard();
      document.getElementById('sysDash').classList.add('open');
      document.getElementById('sysDashBackdrop').classList.add('show');
    },
    closeDash() {
      document.getElementById('sysDash').classList.remove('open');
      document.getElementById('sysDashBackdrop').classList.remove('show');
    },

    logout() {
      clearAuth();
      updateNavBtn();
      document.getElementById('sysUsageBar')?.classList.remove('show');
      NTSA.closeDash();
    },

    /* ── called by app.js after a quiz session ── */
    async saveQuizProgress(score, total, topic, pct) {
      if (!getToken()) return;
      try {
        const r = await fetch(`${API}/api/progress`,{
          method:'POST', headers:authHeaders(),
          body: JSON.stringify({ type:'quiz', score, total, topic, pct }),
        });
        const d = await r.json();
        if (r.status === 403 && d.error === 'free_limit') {
          NTSA.showLimitGate('quiz'); return;
        }
        if (r.ok) { _user = d.user; localStorage.setItem(USER_KEY,JSON.stringify(_user)); }
      } catch {}
      fetchDashboard();
    },

    /* ── called by app.js when simulator session ends ── */
    async saveSimProgress(minutes) {
      if (!getToken()) return;
      try {
        const r = await fetch(`${API}/api/progress`,{
          method:'POST', headers:authHeaders(),
          body: JSON.stringify({ type:'sim', minutes }),
        });
        const d = await r.json();
        if (r.status === 403 && d.error === 'free_limit') {
          NTSA.showLimitGate('sim'); return;
        }
        if (r.ok) { _user = d.user; localStorage.setItem(USER_KEY,JSON.stringify(_user)); }
      } catch {}
    },

    /* ── gate check before quiz question or simulator start ── */
    checkQuizGate()  { if (localLimitHit('quiz')) { NTSA.showLimitGate('quiz'); return false; } return true; },
    checkSimGate()   { if (localLimitHit('sim'))  { NTSA.showLimitGate('sim');  return false; } return true; },

    isPremium()      { return !!(_dashboard?.premium); },
    getUser()        { return _user; },
    getDashboard()   { return _dashboard; },

    /* Internal: tab switch (used inline in modal) */
    _tab,
  };

  /* ══════════════════════════════════════════════
     POLL PAYMENT
  ══════════════════════════════════════════════ */
  async function pollPayment(phone, maxSecs) {
    const deadline = Date.now() + maxSecs * 1000;
    while (Date.now() < deadline) {
      await sleep(3500);
      try {
        const r = await fetch(`${API}/api/verify?phone=${encodeURIComponent(phone)}`);
        const d = await r.json();
        if (d.paid) return true;
      } catch {}
    }
    return false;
  }
  function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

  /* ══════════════════════════════════════════════
     BOOTSTRAP
  ══════════════════════════════════════════════ */
  async function init() {
    _token = getToken();
    _user  = getUser();

    injectUI();
    updateNavBtn();

    /* Restore cached dashboard immediately (feels instant) */
    try {
      const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      if (cached) { _dashboard = cached; updateUsageBar(); }
    } catch {}

    /* Refresh from server in background */
    if (_token) {
      fetchDashboard();
    }

    /* Prompt first-time visitors after 15 s */
    if (!_user && !sessionStorage.getItem('sys_prompted')) {
      setTimeout(() => {
        if (!_user) {
          showAuthModal('register');
          sessionStorage.setItem('sys_prompted','1');
        }
      }, 15000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
