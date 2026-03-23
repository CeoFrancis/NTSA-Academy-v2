/**
 * ══════════════════════════════════════════════════════════════
 *  NTSA DRIVING ACADEMY — ACCOUNTS, SCORING & MISTAKE TRACKER
 *  accounts.js  —  add ONE <script src="accounts.js"></script>
 *                  AFTER system.js, BEFORE the closing </body>
 *
 *  Adds to the app:
 *   1. 👤 PROFILE PAGE  — full "My Account" tab in the nav bar
 *      • Login / register inline (no overlay, native feel)
 *      • Account info: name, phone, plan, days remaining
 *      • Streak fire animation
 *      • NTSA Readiness ring
 *      • Lifetime stats: total Q answered, accuracy, sessions
 *
 *   2. 📊 SCORING SYSTEM  — persistent per-question records
 *      • Every answer tagged: questionId + correct/wrong + category
 *      • Running accuracy by category (shown in profile)
 *      • Per-session history stored in localStorage + server
 *      • Score badge injected onto quiz result overlay
 *
 *   3. 🔴 MISTAKE TRACKER  — "Review My Mistakes" panel
 *      • Tracks every wrong answer with questionId + how many times wrong
 *      • "RETRY MISTAKES" button launches a filtered quiz of worst questions
 *      • Badge on nav tab when new mistakes exist
 *      • Mistake list sorted by frequency (most-missed first)
 *
 *  Storage keys:
 *    ntsa_attempts   — { [qIndex]: { correct: N, wrong: N, lastWrong: bool } }
 *    ntsa_mistakes   — [{ qi, q, cat, wrongCount, lastDate }]
 *    ntsa_jwt        — JWT from system.js (shared)
 *    ntsa_user       — user object from system.js (shared)
 * ══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Storage keys ── */
  const KEY_ATTEMPTS = 'ntsa_attempts';   // per-question stats
  const KEY_MISTAKES = 'ntsa_mistakes';   // mistake list
  const KEY_SESSIONS = 'ntsa_sessions';   // session history
  const TOKEN_KEY    = 'ntsa_jwt';
  const USER_KEY     = 'ntsa_user';

  /* ── Helpers ── */
  const load = k   => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };
  const save = (k,v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };
  const getToken = () => localStorage.getItem(TOKEN_KEY);
  const getUser  = () => load(USER_KEY);
  const authHdr  = () => ({
    'Content-Type': 'application/json',
    ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
  });
  const API = '';   // same origin

  /* ══════════════════════════════════════════════
     1.  PER-QUESTION ATTEMPT TRACKING
         Patches the existing quizSelectOpt() function
  ══════════════════════════════════════════════ */
  function patchQuizSelectOpt() {
    const _orig = window.quizSelectOpt;
    if (!_orig) return;

    window.quizSelectOpt = function (i) {
      /* Call original first */
      _orig(i);

      /* Record this answer */
      const qi      = window.qOrder?.[window.qCurrent];
      if (qi === undefined) return;

      const correct = (i === window.QUIZ?.[qi]?.correct);
      const cat     = window.QUIZ?.[qi]?.cat || 'GENERAL';

      recordAttempt(qi, correct, cat);
    };
  }

  function recordAttempt(qi, correct, cat) {
    const attempts = load(KEY_ATTEMPTS) || {};
    if (!attempts[qi]) attempts[qi] = { correct: 0, wrong: 0, cat };
    if (correct) { attempts[qi].correct++; }
    else         { attempts[qi].wrong++;   attempts[qi].lastWrong = true; }
    save(KEY_ATTEMPTS, attempts);

    if (!correct) recordMistake(qi, cat);
    else          clearMistakeStreak(qi);

    refreshMistakeBadge();
  }

  /* ══════════════════════════════════════════════
     2.  MISTAKE TRACKER
  ══════════════════════════════════════════════ */
  function recordMistake(qi, cat) {
    const mistakes = load(KEY_MISTAKES) || {};
    if (!mistakes[qi]) {
      mistakes[qi] = {
        qi, cat,
        q:         window.QUIZ?.[qi]?.q || '',
        wrongCount: 0,
        firstDate:  new Date().toLocaleDateString('en-KE', {day:'2-digit',month:'short'}),
        lastDate:   null,
      };
    }
    mistakes[qi].wrongCount++;
    mistakes[qi].lastDate = new Date().toLocaleDateString('en-KE', {day:'2-digit',month:'short'});
    save(KEY_MISTAKES, mistakes);
  }

  function clearMistakeStreak(qi) {
    /* When answered correctly, mark it as "improved" but keep history */
    const mistakes = load(KEY_MISTAKES) || {};
    if (mistakes[qi]) {
      mistakes[qi].mastered = true;
      save(KEY_MISTAKES, mistakes);
    }
  }

  function getMistakeList() {
    const mistakes  = load(KEY_MISTAKES) || {};
    return Object.values(mistakes)
      .filter(m => !m.mastered)
      .sort((a, b) => b.wrongCount - a.wrongCount);
  }

  function getMistakeCount() {
    return getMistakeList().length;
  }

  function refreshMistakeBadge() {
    const n   = getMistakeCount();
    const tab = document.querySelector('.nav-tab[data-page="profile"]');
    if (!tab) return;
    let badge = tab.querySelector('.mistake-badge');
    if (n > 0) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'mistake-badge';
        tab.appendChild(badge);
      }
      badge.textContent = n > 99 ? '99+' : n;
    } else if (badge) {
      badge.remove();
    }
  }

  /* Launch a quiz using only the user's mistake questions */
  window.retryMistakes = function () {
    const list = getMistakeList();
    if (!list.length) { window.toast?.('No mistakes to retry! 🎉'); return; }

    /* Override qOrder with mistake question indices */
    const indices = list.map(m => Number(m.qi));
    window.qOrder    = indices;
    window.qCurrent  = 0;
    window.qCorrect  = 0;
    window.qWrong    = 0;
    window.qAnswers  = new Array(indices.length).fill(null);
    window.qSelected = new Array(indices.length).fill(null);

    document.getElementById('qStatTotal').textContent = indices.length;
    document.getElementById('qStatCorrect').textContent = '0';
    document.getElementById('qStatWrong').textContent   = '0';
    document.getElementById('qStatPct').textContent     = '—';
    document.getElementById('quizResult')?.classList.remove('show');
    document.getElementById('qProgFill').style.background = 'var(--gold)';
    document.getElementById('qProgFill').style.width = '0%';

    window.quizRenderCard?.();
    window.goTo?.('quiz');
    window.toast?.(`🔴 Retrying ${indices.length} mistake${indices.length !== 1 ? 's' : ''}`);
  };

  /* ══════════════════════════════════════════════
     3.  SCORING SYSTEM — category accuracy
  ══════════════════════════════════════════════ */
  function getCategoryStats() {
    const attempts = load(KEY_ATTEMPTS) || {};
    const cats = {};
    Object.values(attempts).forEach(a => {
      if (!cats[a.cat]) cats[a.cat] = { correct: 0, wrong: 0 };
      cats[a.cat].correct += a.correct;
      cats[a.cat].wrong   += a.wrong;
    });
    return Object.entries(cats).map(([cat, v]) => {
      const total = v.correct + v.wrong;
      return { cat, correct: v.correct, wrong: v.wrong, total,
               pct: total ? Math.round(v.correct / total * 100) : 0 };
    }).sort((a, b) => a.pct - b.pct); /* weakest first */
  }

  function getLifetimeStats() {
    const attempts = load(KEY_ATTEMPTS) || {};
    let totalC = 0, totalW = 0;
    Object.values(attempts).forEach(a => { totalC += a.correct; totalW += a.wrong; });
    const total = totalC + totalW;
    return {
      answered: total,
      correct:  totalC,
      wrong:    totalW,
      accuracy: total ? Math.round(totalC / total * 100) : 0,
    };
  }

  /* Patch quizShowResult to also show mistake count in result overlay */
  function patchQuizShowResult() {
    const _orig = window.quizShowResult;
    if (!_orig) return;

    window.quizShowResult = function () {
      _orig();

      /* Inject mistake summary into result overlay */
      const detail = document.getElementById('resDetail');
      if (!detail) return;

      const mistakes = getMistakeCount();
      const cats     = getCategoryStats();
      const weak     = cats.filter(c => c.pct < 70).slice(0, 3);

      let extra = '';
      if (mistakes > 0) {
        extra += `<div style="margin-top:10px;padding:8px 12px;background:rgba(255,23,68,.08);border:1px solid rgba(255,23,68,.2);border-radius:6px;font-size:.5rem;letter-spacing:.5px;line-height:1.7;">
          🔴 ${mistakes} question${mistakes !== 1 ? 's' : ''} in your Mistake Tracker
          <br><button onclick="retryMistakes()" style="margin-top:6px;background:rgba(255,23,68,.15);border:1px solid rgba(255,23,68,.3);color:#ff6b88;padding:4px 12px;border-radius:4px;font-size:.45rem;font-family:var(--mono);letter-spacing:1px;cursor:pointer;">🔁 RETRY MISTAKES</button>
        </div>`;
      }
      if (weak.length) {
        extra += `<div style="margin-top:8px;font-size:.45rem;color:var(--dim);letter-spacing:.5px;">Weakest topics: ${weak.map(c => `${c.cat} (${c.pct}%)`).join(' · ')}</div>`;
      }
      if (extra) detail.insertAdjacentHTML('beforeend', extra);
    };
  }

  /* ══════════════════════════════════════════════
     4.  PROFILE PAGE — full HTML page
  ══════════════════════════════════════════════ */
  const PROFILE_CSS = `
  /* ── Profile page ── */
  #page-profile {
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  #page-profile::-webkit-scrollbar { width: 3px; }
  #page-profile::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  .pf-wrap {
    max-width: 760px; margin: 0 auto; padding: 24px 20px 80px;
  }

  /* Hero card */
  .pf-hero {
    background: linear-gradient(135deg, var(--panel), var(--panel2));
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 28px 28px 24px;
    margin-bottom: 16px;
    position: relative; overflow: hidden;
  }
  .pf-hero::before {
    content: '⬡';
    position: absolute; right: -10px; top: -10px;
    font-size: 7rem; color: rgba(245,197,24,.04);
    line-height: 1; pointer-events: none;
  }
  .pf-hero-top { display: flex; align-items: center; gap: 16px; margin-bottom: 18px; }
  .pf-avatar {
    width: 56px; height: 56px; border-radius: 50%;
    background: var(--gold); display: flex; align-items: center; justify-content: center;
    font-family: var(--disp); font-size: 1.4rem; font-weight: 900; color: #000;
    flex-shrink: 0; box-shadow: 0 0 20px rgba(245,197,24,.25);
  }
  .pf-name {
    font-family: var(--disp); font-size: .9rem; font-weight: 700;
    color: var(--gold); letter-spacing: 2px; line-height: 1.1;
  }
  .pf-phone {
    font-family: var(--mono); font-size: .48rem; color: var(--dim);
    letter-spacing: 1px; margin-top: 4px;
  }
  .pf-plan-badge {
    display: inline-block; padding: 4px 12px; border-radius: 20px;
    font-family: var(--mono); font-size: .42rem; letter-spacing: 2px;
    margin-top: 6px;
  }
  .pf-plan-badge.free    { background: rgba(58,74,96,.3); color: var(--dim); border: 1px solid var(--border); }
  .pf-plan-badge.premium { background: rgba(245,197,24,.1); color: var(--gold); border: 1px solid rgba(245,197,24,.3); }
  .pf-days {
    font-family: var(--mono); font-size: .4rem; color: var(--dim);
    letter-spacing: 1px; margin-left: 8px;
  }

  /* Readiness + streak row */
  .pf-vitals { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .pf-vital-card {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 10px; padding: 16px; text-align: center;
  }

  /* Readiness ring */
  .pf-ring-wrap { width: 80px; height: 80px; position: relative; margin: 0 auto 8px; }
  .pf-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .pf-ring-bg   { fill: none; stroke: var(--border); stroke-width: 8; }
  .pf-ring-fill { fill: none; stroke-width: 8; stroke-linecap: round;
                  transition: stroke-dashoffset 1s cubic-bezier(.16,1,.3,1); }
  .pf-ring-txt  { position: absolute; inset: 0; display: flex; flex-direction: column;
                  align-items: center; justify-content: center; }
  .pf-ring-num  { font-family: var(--disp); font-size: .75rem; font-weight: 900; line-height: 1; }
  .pf-ring-lbl  { font-family: var(--mono); font-size: .28rem; letter-spacing: 2px; color: var(--dim); }

  .pf-vital-title {
    font-family: var(--disp); font-size: .42rem; letter-spacing: 2px;
    color: var(--text); margin-bottom: 4px;
  }
  .pf-vital-sub { font-family: var(--mono); font-size: .38rem; color: var(--dim); letter-spacing: 1px; }

  .pf-streak-num { font-family: var(--disp); font-size: 1.6rem; font-weight: 900; color: var(--orange); line-height: 1; }
  .pf-streak-fire { font-size: 1.4rem; }

  /* Section titles */
  .pf-section-title {
    font-family: var(--disp); font-size: .48rem; letter-spacing: 3px;
    color: var(--dim); margin: 20px 0 10px;
    display: flex; align-items: center; gap: 8px;
  }
  .pf-section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* Stats grid */
  .pf-stats { display: grid; grid-template-columns: repeat(4,1fr); gap: 8px; margin-bottom: 4px; }
  @media(max-width:480px){ .pf-stats { grid-template-columns: repeat(2,1fr); } }
  .pf-stat {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px 8px; text-align: center;
  }
  .pf-stat-num { font-family: var(--disp); font-size: .72rem; font-weight: 700; color: var(--gold); line-height: 1; }
  .pf-stat-lbl { font-family: var(--mono); font-size: .35rem; color: var(--dim); letter-spacing: 1px; margin-top: 4px; }

  /* Category accuracy bars */
  .pf-cat-row {
    display: flex; align-items: center; gap: 10px;
    padding: 8px 0; border-bottom: 1px solid var(--border);
  }
  .pf-cat-row:last-child { border-bottom: none; }
  .pf-cat-name { font-family: var(--mono); font-size: .45rem; color: var(--text); flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .pf-cat-bar-wrap { width: 100px; height: 6px; background: var(--border); border-radius: 3px; flex-shrink: 0; overflow: hidden; }
  .pf-cat-bar { height: 100%; border-radius: 3px; transition: width .6s ease; }
  .pf-cat-pct { font-family: var(--disp); font-size: .42rem; color: var(--text); flex-shrink: 0; min-width: 32px; text-align: right; }

  /* Mistake tracker */
  .pf-mistake-row {
    display: flex; align-items: flex-start; gap: 10px;
    padding: 10px 12px; border-radius: 7px; margin-bottom: 6px;
    background: rgba(255,23,68,.04); border: 1px solid rgba(255,23,68,.12);
    transition: border-color .2s;
  }
  .pf-mistake-row:hover { border-color: rgba(255,23,68,.3); }
  .pf-mistake-qi { font-family: var(--disp); font-size: .5rem; font-weight: 700; color: var(--red); flex-shrink: 0; min-width: 32px; }
  .pf-mistake-q  { font-family: var(--prose); font-size: .58rem; color: var(--text); line-height: 1.5; flex: 1; }
  .pf-mistake-meta { font-family: var(--mono); font-size: .38rem; color: var(--dim); flex-shrink: 0; text-align: right; }
  .pf-mistake-count { font-family: var(--disp); font-size: .55rem; color: var(--red); }

  .pf-retry-btn {
    width: 100%; padding: 14px; border: none; border-radius: 6px;
    background: rgba(255,23,68,.1); border: 1px solid rgba(255,23,68,.25);
    color: #ff6b88; font-family: var(--disp); font-size: .52rem;
    font-weight: 700; letter-spacing: 2px; cursor: pointer;
    transition: all .18s; margin-top: 4px;
  }
  .pf-retry-btn:hover { background: rgba(255,23,68,.18); transform: translateY(-1px); }

  .pf-all-clear {
    text-align: center; padding: 24px;
    font-family: var(--mono); font-size: .48rem; color: var(--dim); letter-spacing: 1px;
  }
  .pf-all-clear span { display: block; font-size: 2rem; margin-bottom: 8px; }

  /* Achievements */
  .pf-badges { display: flex; flex-wrap: wrap; gap: 8px; }
  .pf-badge {
    padding: 5px 12px; border-radius: 20px;
    background: rgba(245,197,24,.07); border: 1px solid rgba(245,197,24,.2);
    font-family: var(--mono); font-size: .44rem; color: var(--gold);
    letter-spacing: 1px;
  }

  /* Login form inside profile page */
  .pf-auth {
    background: var(--panel); border: 1px solid var(--border);
    border-radius: 12px; padding: 28px 24px; text-align: center;
    max-width: 380px; margin: 40px auto 0;
  }
  .pf-auth-title { font-family: var(--disp); font-size: .75rem; font-weight: 700;
    color: var(--gold); letter-spacing: 2px; margin-bottom: 6px; }
  .pf-auth-sub   { font-family: var(--mono); font-size: .45rem; color: var(--dim);
    letter-spacing: 1px; line-height: 1.7; margin-bottom: 22px; }

  .pf-tabs { display: flex; border: 1px solid var(--border); border-radius: 5px;
    overflow: hidden; margin-bottom: 20px; }
  .pf-tab { flex: 1; padding: 9px; background: transparent; border: none;
    font-family: var(--disp); font-size: .44rem; letter-spacing: 2px;
    color: var(--dim); cursor: pointer; transition: all .18s; }
  .pf-tab.active { background: rgba(245,197,24,.1); color: var(--gold);
    border-bottom: 2px solid var(--gold); }

  .pf-field { margin-bottom: 12px; text-align: left; }
  .pf-field label { display: block; font-family: var(--disp); font-size: .38rem;
    letter-spacing: 2px; color: var(--dim); margin-bottom: 5px; }
  .pf-field input { width: 100%; padding: 11px 13px; background: #080b10;
    border: 1px solid var(--border); border-radius: 4px; color: var(--text);
    font-family: var(--mono); font-size: .58rem; letter-spacing: 1px;
    outline: none; transition: border-color .18s; }
  .pf-field input:focus { border-color: var(--gold); }
  .pf-field input::placeholder { color: var(--dim); }

  .pf-submit { width: 100%; padding: 12px; background: var(--gold); border: none;
    border-radius: 4px; color: #000; font-family: var(--disp); font-size: .52rem;
    font-weight: 700; letter-spacing: 2px; cursor: pointer; margin-top: 6px;
    transition: background .18s, transform .15s; }
  .pf-submit:hover  { background: #ffd740; transform: translateY(-1px); }
  .pf-submit:disabled { opacity: .4; cursor: not-allowed; transform: none; }

  .pf-auth-status { display: none; margin-top: 10px; padding: 9px 12px;
    border-radius: 4px; font-family: var(--mono); font-size: .48rem;
    text-align: center; line-height: 1.6; }
  .pf-auth-status.show { display: block; }
  .pf-auth-status.ok  { background: rgba(0,230,118,.08); border: 1px solid rgba(0,230,118,.2); color: #00e676; }
  .pf-auth-status.err { background: rgba(255,23,68,.08); border: 1px solid rgba(255,23,68,.2); color: #ff6b88; }
  .pf-auth-status.inf { background: rgba(41,182,246,.08); border: 1px solid rgba(41,182,246,.2); color: #7dcef8; }
  .pf-spin { display: inline-block; width: 11px; height: 11px;
    border: 2px solid rgba(245,197,24,.3); border-top-color: var(--gold);
    border-radius: 50%; animation: pfSpin .7s linear infinite; vertical-align: middle; margin-right: 5px; }
  @keyframes pfSpin { to { transform: rotate(360deg); } }

  .pf-logout-btn { width: 100%; padding: 11px; margin-top: 14px;
    background: transparent; border: 1px solid var(--border);
    border-radius: 4px; color: var(--dim); font-family: var(--disp);
    font-size: .44rem; letter-spacing: 2px; cursor: pointer; transition: all .18s; }
  .pf-logout-btn:hover { border-color: var(--red); color: var(--red); }

  /* Mistake badge on nav tab */
  .mistake-badge {
    position: absolute; top: 4px; right: 6px;
    min-width: 14px; height: 14px; border-radius: 7px;
    background: var(--red); color: #fff;
    font-family: var(--mono); font-size: .3rem; font-weight: bold;
    display: flex; align-items: center; justify-content: center;
    padding: 0 3px; line-height: 1;
    box-shadow: 0 0 6px rgba(255,23,68,.5);
  }
  `;

  function injectProfileCSS() {
    const s = document.createElement('style');
    s.textContent = PROFILE_CSS;
    document.head.appendChild(s);
  }

  /* ── Add "PROFILE" tab to the nav ── */
  function injectProfileTab() {
    const tabs = document.querySelector('.nav-tabs');
    if (!tabs || document.querySelector('[data-page="profile"]')) return;

    const btn = document.createElement('button');
    btn.className = 'nav-tab';
    btn.dataset.page = 'profile';
    btn.innerHTML = `<span class="tab-icon">👤</span><span class="tab-label">MY ACCOUNT</span>`;
    btn.onclick = () => window.goTo?.('profile');
    btn.style.position = 'relative';   /* for badge positioning */
    tabs.appendChild(btn);
  }

  /* ── Create the profile page div ── */
  function injectProfilePage() {
    if (document.getElementById('page-profile')) return;

    const pages = document.getElementById('pages');
    if (!pages) return;

    const div = document.createElement('div');
    div.className = 'page';
    div.id = 'page-profile';
    div.innerHTML = `<div class="pf-wrap" id="pfWrap">
      <div style="font-family:var(--disp);font-size:.5rem;letter-spacing:2px;color:var(--dim);padding:40px;text-align:center;">
        <span class="pf-spin"></span> Loading…
      </div>
    </div>`;
    pages.appendChild(div);
  }

  /* ── Render profile content ── */
  function renderProfile() {
    const wrap = document.getElementById('pfWrap');
    if (!wrap) return;

    const user = getUser();
    if (!user) { renderAuthForm(wrap); return; }

    /* Pull data */
    const dash      = window.NTSA?.getDashboard?.() || {};
    const readiness = dash.readiness ?? 0;
    const streak    = user.streak    ?? 0;
    const daysLeft  = dash.daysLeft  ?? null;
    const premium   = dash.premium   ?? false;
    const achievements = dash.achievements ?? [];
    const stats     = getLifetimeStats();
    const catStats  = getCategoryStats();
    const mistakes  = getMistakeList();
    const initial   = (user.name?.[0] || '?').toUpperCase();

    /* Readiness ring math */
    const R = 34; const C = 2 * Math.PI * R;
    const dashOff = C - (readiness / 100) * C;
    const ringCol = readiness >= 70 ? 'var(--green)' : readiness >= 50 ? 'var(--gold)' : 'var(--red)';

    /* Category bars */
    const catsHtml = catStats.length
      ? catStats.map(c => {
          const col = c.pct >= 70 ? 'var(--green)' : c.pct >= 50 ? 'var(--gold)' : 'var(--red)';
          return `<div class="pf-cat-row">
            <span class="pf-cat-name">${c.cat}</span>
            <div class="pf-cat-bar-wrap"><div class="pf-cat-bar" style="width:${c.pct}%;background:${col}"></div></div>
            <span class="pf-cat-pct" style="color:${col}">${c.pct}%</span>
          </div>`;
        }).join('')
      : `<div style="font-family:var(--mono);font-size:.45rem;color:var(--dim);padding:12px 0;">
           No quiz attempts yet — answer some questions to see your breakdown.
         </div>`;

    /* Mistake list */
    const mistakesHtml = mistakes.length
      ? `<div style="max-height:280px;overflow-y:auto;padding-right:2px;">
          ${mistakes.slice(0, 20).map(m => `
          <div class="pf-mistake-row">
            <span class="pf-mistake-qi">Q${Number(m.qi)+1}</span>
            <span class="pf-mistake-q">${m.q}</span>
            <div class="pf-mistake-meta">
              <div class="pf-mistake-count">${m.wrongCount}✗</div>
              <div style="font-size:.35rem;margin-top:2px;">${m.lastDate}</div>
              <div style="font-size:.32rem;color:rgba(58,74,96,.8)">${m.cat}</div>
            </div>
          </div>`).join('')}
        </div>
        <button class="pf-retry-btn" onclick="retryMistakes()">🔁 RETRY ALL ${mistakes.length} MISTAKES</button>`
      : `<div class="pf-all-clear"><span>🎉</span>NO MISTAKES ON RECORD<br>Answer questions to start tracking.</div>`;

    /* Achievements */
    const badgesHtml = achievements.length
      ? `<div class="pf-badges">${achievements.map(a => `<span class="pf-badge">${a.label}</span>`).join('')}</div>`
      : `<div style="font-family:var(--mono);font-size:.44rem;color:var(--dim);padding:8px 0;">Keep studying to earn badges!</div>`;

    wrap.innerHTML = `
      <!-- Hero card -->
      <div class="pf-hero">
        <div class="pf-hero-top">
          <div class="pf-avatar">${initial}</div>
          <div>
            <div class="pf-name">${user.name?.toUpperCase() || 'USER'}</div>
            <div class="pf-phone">${user.phone?.replace(/^254/, '0') || ''}</div>
            <div>
              <span class="pf-plan-badge ${premium ? 'premium' : 'free'}">${premium ? (user.plan?.toUpperCase() || 'PREMIUM') : 'FREE TIER'}</span>
              ${premium && daysLeft !== null ? `<span class="pf-days">${daysLeft} day${daysLeft !== 1 ? 's' : ''} left</span>` : ''}
            </div>
          </div>
        </div>

        <!-- Vitals row -->
        <div class="pf-vitals">
          <!-- Readiness ring -->
          <div class="pf-vital-card">
            <div class="pf-ring-wrap">
              <svg viewBox="0 0 80 80">
                <circle class="pf-ring-bg"   cx="40" cy="40" r="${R}"/>
                <circle class="pf-ring-fill" cx="40" cy="40" r="${R}"
                  stroke="${ringCol}"
                  stroke-dasharray="${C.toFixed(1)}"
                  stroke-dashoffset="${dashOff.toFixed(1)}"/>
              </svg>
              <div class="pf-ring-txt">
                <span class="pf-ring-num" style="color:${ringCol}">${readiness}</span>
                <span class="pf-ring-lbl">%</span>
              </div>
            </div>
            <div class="pf-vital-title">READINESS</div>
            <div class="pf-vital-sub">${readiness >= 80 ? '✅ Test-ready!' : readiness >= 60 ? '📈 Almost there' : '📚 Keep studying'}</div>
          </div>

          <!-- Streak -->
          <div class="pf-vital-card">
            <div class="pf-streak-fire">${streak >= 7 ? '🔥🔥' : streak >= 3 ? '🔥' : '💤'}</div>
            <div class="pf-streak-num">${streak}</div>
            <div class="pf-vital-title">DAY STREAK</div>
            <div class="pf-vital-sub">Best: keep going!</div>
          </div>
        </div>

        ${!premium ? `
        <button onclick="window.NTSA?.showUpgrade('Unlock your full potential — go Premium')"
          style="width:100%;padding:10px;background:rgba(245,197,24,.08);border:1px solid rgba(245,197,24,.25);
          border-radius:6px;color:var(--gold);font-family:var(--disp);font-size:.48rem;font-weight:700;
          letter-spacing:2px;cursor:pointer;transition:all .18s;"
          onmouseover="this.style.background='rgba(245,197,24,.15)'"
          onmouseout="this.style.background='rgba(245,197,24,.08)'">
          🔓 UPGRADE TO PREMIUM — KES 150/MONTH
        </button>` : ''}
      </div>

      <!-- Lifetime stats -->
      <div class="pf-section-title">📊 LIFETIME STATS</div>
      <div class="pf-stats">
        <div class="pf-stat"><div class="pf-stat-num">${stats.answered}</div><div class="pf-stat-lbl">ANSWERED</div></div>
        <div class="pf-stat"><div class="pf-stat-num" style="color:var(--green)">${stats.correct}</div><div class="pf-stat-lbl">CORRECT</div></div>
        <div class="pf-stat"><div class="pf-stat-num" style="color:var(--red)">${stats.wrong}</div><div class="pf-stat-lbl">WRONG</div></div>
        <div class="pf-stat"><div class="pf-stat-num" style="color:${stats.accuracy>=70?'var(--green)':stats.accuracy>=50?'var(--gold)':'var(--red)'}">${stats.accuracy}%</div><div class="pf-stat-lbl">ACCURACY</div></div>
      </div>

      <!-- Category breakdown -->
      <div class="pf-section-title">📂 ACCURACY BY TOPIC</div>
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        ${catsHtml}
      </div>

      <!-- Mistake tracker -->
      <div class="pf-section-title">🔴 MISTAKE TRACKER <span style="font-size:.38rem;color:var(--red);margin-left:4px;">${mistakes.length > 0 ? mistakes.length + ' to review' : ''}</span></div>
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        ${mistakesHtml}
      </div>

      <!-- Achievements -->
      <div class="pf-section-title">🏆 ACHIEVEMENTS</div>
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:14px 16px;">
        ${badgesHtml}
      </div>

      <!-- Account actions -->
      <div class="pf-section-title">⚙ ACCOUNT</div>
      <div style="background:var(--panel);border:1px solid var(--border);border-radius:10px;padding:16px;">
        <div style="font-family:var(--mono);font-size:.44rem;color:var(--dim);line-height:1.9;margin-bottom:14px;">
          Joined: ${user.createdAt ? new Date(user.createdAt).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : '—'}<br>
          Last seen: ${user.lastSeen ? new Date(user.lastSeen).toLocaleDateString('en-KE',{day:'2-digit',month:'short',year:'numeric'}) : '—'}<br>
          Plan: ${user.plan?.toUpperCase() || 'FREE'}
        </div>
        <button class="pf-logout-btn" onclick="pfLogout()">LOGOUT →</button>
      </div>
    `;
  }

  function renderAuthForm(wrap) {
    let tab = 'login';
    const switchTab = (t) => {
      tab = t;
      document.getElementById('pfLoginForm').style.display  = t === 'login'    ? '' : 'none';
      document.getElementById('pfRegForm').style.display    = t === 'register' ? '' : 'none';
      document.getElementById('pfTabLogin').classList.toggle('active', t === 'login');
      document.getElementById('pfTabReg').classList.toggle('active', t === 'register');
    };
    window._pfSwitchTab = switchTab;

    wrap.innerHTML = `
      <div class="pf-auth">
        <div style="font-size:2rem;margin-bottom:12px;">🎓</div>
        <div class="pf-auth-title">MY ACCOUNT</div>
        <div class="pf-auth-sub">Sign in to save your progress, track mistakes and unlock your full readiness score.</div>

        <div class="pf-tabs">
          <button class="pf-tab active" id="pfTabLogin" onclick="_pfSwitchTab('login')">LOGIN</button>
          <button class="pf-tab" id="pfTabReg" onclick="_pfSwitchTab('register')">REGISTER</button>
        </div>

        <!-- Login -->
        <div id="pfLoginForm">
          <div class="pf-field"><label>PHONE NUMBER</label>
            <input id="pfLPhone" type="tel" placeholder="0712 345 678" autocomplete="tel">
          </div>
          <div class="pf-field"><label>PASSWORD</label>
            <input id="pfLPass" type="password" placeholder="••••••••" autocomplete="current-password">
          </div>
          <button class="pf-submit" onclick="pfDoLogin()">LOGIN →</button>
        </div>

        <!-- Register -->
        <div id="pfRegForm" style="display:none">
          <div class="pf-field"><label>FULL NAME</label>
            <input id="pfRName" type="text" placeholder="John Kamau" autocomplete="name">
          </div>
          <div class="pf-field"><label>PHONE (M-PESA NUMBER)</label>
            <input id="pfRPhone" type="tel" placeholder="0712 345 678" autocomplete="tel">
          </div>
          <div class="pf-field"><label>PASSWORD (MIN 6 CHARS)</label>
            <input id="pfRPass" type="password" placeholder="••••••••" autocomplete="new-password">
          </div>
          <button class="pf-submit" onclick="pfDoRegister()">CREATE ACCOUNT →</button>
        </div>

        <div class="pf-auth-status" id="pfAuthStatus"></div>
      </div>
    `;

    /* Enter-key support */
    setTimeout(() => {
      document.getElementById('pfLPass')?.addEventListener('keydown', e => { if (e.key==='Enter') window.pfDoLogin(); });
      document.getElementById('pfRPass')?.addEventListener('keydown', e => { if (e.key==='Enter') window.pfDoRegister(); });
    }, 50);
  }

  /* ── Auth helpers ── */
  function pfStatus(msg, type) {
    const el = document.getElementById('pfAuthStatus');
    if (!el) return;
    el.className = `pf-auth-status ${type} show`;
    el.innerHTML = msg;
  }

  window.pfDoLogin = async function () {
    const phone = document.getElementById('pfLPhone')?.value?.trim();
    const pass  = document.getElementById('pfLPass')?.value;
    const btn   = document.querySelector('#pfLoginForm .pf-submit');
    if (btn) btn.disabled = true;
    pfStatus('<span class="pf-spin"></span> Signing in…', 'inf');
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, password: pass }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      localStorage.setItem(TOKEN_KEY, d.token);
      localStorage.setItem(USER_KEY, JSON.stringify(d.user));
      pfStatus(`✓ Welcome back, ${d.user.name}!`, 'ok');
      setTimeout(() => { renderProfile(); window.NTSA?.getDashboard?.(); }, 900);
    } catch (e) {
      pfStatus('✗ ' + e.message, 'err');
      if (btn) btn.disabled = false;
    }
  };

  window.pfDoRegister = async function () {
    const name  = document.getElementById('pfRName')?.value?.trim();
    const phone = document.getElementById('pfRPhone')?.value?.trim();
    const pass  = document.getElementById('pfRPass')?.value;
    const btn   = document.querySelector('#pfRegForm .pf-submit');
    if (btn) btn.disabled = true;
    pfStatus('<span class="pf-spin"></span> Creating account…', 'inf');
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, phone, password: pass }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      localStorage.setItem(TOKEN_KEY, d.token);
      localStorage.setItem(USER_KEY, JSON.stringify(d.user));
      pfStatus(`✓ Welcome, ${d.user.name}! Account created.`, 'ok');
      setTimeout(() => renderProfile(), 900);
    } catch (e) {
      pfStatus('✗ ' + e.message, 'err');
      if (btn) btn.disabled = false;
    }
  };

  window.pfLogout = function () {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
    localStorage.removeItem('ntsa_dash');
    window.NTSA?.logout?.();
    renderAuthForm(document.getElementById('pfWrap'));
  };

  /* ── Hook goTo to render profile when tab is clicked ── */
  function patchGoTo() {
    const _orig = window.goTo;
    if (!_orig) return;
    window.goTo = function (page) {
      _orig(page);
      if (page === 'profile') {
        /* Small delay to let page become visible */
        setTimeout(renderProfile, 50);
      }
    };
  }

  /* ══════════════════════════════════════════════
     5.  BOOTSTRAP
  ══════════════════════════════════════════════ */
  function init() {
    injectProfileCSS();
    injectProfileTab();
    injectProfilePage();

    /* Wait briefly for existing app scripts to finish init */
    setTimeout(() => {
      patchQuizSelectOpt();
      patchQuizShowResult();
      patchGoTo();
      refreshMistakeBadge();
    }, 200);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
