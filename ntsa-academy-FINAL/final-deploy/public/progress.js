/**
 * ══════════════════════════════════════════════════════════════
 *  NTSA DRIVING ACADEMY — PROGRESS, SCORING & RECOMMENDATIONS
 *  progress.js  —  add <script src="progress.js"></script>
 *                  AFTER accounts.js in index.html
 *
 *  Adds:
 *   1. 📊 HOME DASHBOARD  — live progress card injected into
 *      the home page between the hero and module cards:
 *      • NTSA readiness ring + streak + pass rate
 *      • 7-day score sparkline
 *      • Today's session summary
 *      • "Continue where you left off" CTA
 *
 *   2. 🏆 ENHANCED RESULT SCREEN  — replaces the basic pass/fail
 *      overlay with a rich breakdown:
 *      • Score ring animation
 *      • Category performance table (green/amber/red per topic)
 *      • Personal best / average comparison
 *      • Smart feedback message (grade-based)
 *      • Action buttons: retry weak topic | retry mistakes | review
 *
 *   3. 🎯 RECOMMENDATIONS ENGINE  — analyses every answer and
 *      produces up to 3 personalised study tips:
 *      • Weak topic detected → "Practice [topic] — only X% accuracy"
 *      • Untried topic → "You haven't tried [topic] yet"
 *      • Streak encouragement / warning
 *      • On home page card AND in result overlay
 *
 *  Storage: reads ntsa_attempts (accounts.js), ntsa_quiz_scores
 *           (existing histRecord). Write-only to existing keys.
 * ══════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  /* ── Storage helpers ── */
  const load = k => { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch { return null; } };

  /* Keys written by other modules — read-only here */
  const HIST_KEY     = 'ntsa_quiz_scores';   // from histRecord()
  const ATTEMPT_KEY  = 'ntsa_attempts';       // from accounts.js

  /* ── Category groups for recommendations ── */
  const CAT_GROUPS = {
    'Road Signs':    ['WARNING SIGNS','PROHIBITORY SIGNS','MANDATORY SIGNS','INFORMATORY SIGNS',
                      'PRIORITY SIGNS','ROAD SIGNS','ROAD SIGN CLASSES'],
    'Road Rules':    ['RULES OF THE ROAD','OVERTAKING','STOPPING','PARKING','SPEED LIMITS',
                      'TURNING','ROUNDABOUTS','JUNCTIONS','RAILWAY CROSSINGS','PRIORITY VEHICLES'],
    'Traffic Lights':['TRAFFIC LIGHTS'],
    'Road Markings': ['ROAD MARKINGS'],
    'Vehicle':       ['VEHICLE KNOWLEDGE','LIGHTS','EQUIPMENT','VEHICLE MAINTENANCE',
                      'VEHICLE INSPECTION','STEERING','MIRROR USE'],
    'Safety':        ['ROAD SAFETY','PEDESTRIANS','ACCIDENTS','HAZARD AWARENESS',
                      'OBSERVATION','NIGHT DRIVING','HORN'],
    'Legal':         ['LICENSING','DOCUMENTS','HIGHWAY CODE','INSPECTION','MODEL TOWN'],
  };

  /* Flat map: canonical cat → group */
  const catToGroup = {};
  Object.entries(CAT_GROUPS).forEach(([g, cats]) => cats.forEach(c => { catToGroup[c] = g; }));

  /* Normalise a category string */
  function normCat(c) { return (c || 'GENERAL').toUpperCase().trim(); }

  /* ══════════════════════════════════════════════
     DATA HELPERS
  ══════════════════════════════════════════════ */

  /** All quiz sessions from localStorage */
  function getSessions() { return load(HIST_KEY) || []; }

  /** Per-question attempt data */
  function getAttempts() { return load(ATTEMPT_KEY) || {}; }

  /** Accuracy 0-100 for a given category (or null if no attempts) */
  function catAccuracy(cat) {
    const attempts = getAttempts();
    let c = 0, w = 0;
    Object.values(attempts).forEach(a => {
      if (normCat(a.cat) === normCat(cat)) { c += a.correct; w += a.wrong; }
    });
    const total = c + w;
    return total ? Math.round(c / total * 100) : null;
  }

  /** Per-group accuracy */
  function groupAccuracy(group) {
    const cats = CAT_GROUPS[group] || [];
    const attempts = getAttempts();
    let c = 0, w = 0;
    Object.values(attempts).forEach(a => {
      if (cats.includes(normCat(a.cat))) { c += a.correct; w += a.wrong; }
    });
    const total = c + w;
    return total ? { pct: Math.round(c / total * 100), total } : null;
  }

  /** Categories the user has never answered */
  function getUntriedGroups() {
    const attempted = new Set(Object.values(getAttempts()).map(a => catToGroup[normCat(a.cat)]));
    return Object.keys(CAT_GROUPS).filter(g => !attempted.has(g));
  }

  /** Overall lifetime stats */
  function getLifetime() {
    const attempts = getAttempts();
    let c = 0, w = 0;
    Object.values(attempts).forEach(a => { c += a.correct; w += a.wrong; });
    const sessions = getSessions();
    const pcts     = sessions.map(s => s.pct);
    return {
      answered: c + w,
      correct:  c,
      wrong:    w,
      accuracy: (c + w) ? Math.round(c / (c + w) * 100) : 0,
      sessions: sessions.length,
      best:     pcts.length ? Math.max(...pcts) : null,
      avg:      pcts.length ? Math.round(pcts.reduce((a, b) => a + b, 0) / pcts.length) : null,
      passes:   sessions.filter(s => s.pass).length,
      streak:   getStreak(),
    };
  }

  /** Day streak from session dates */
  function getStreak() {
    const sessions = getSessions();
    if (!sessions.length) return 0;
    const days = new Set(sessions.map(s => new Date(s.ts).toDateString()));
    const arr   = [...days].sort((a, b) => new Date(b) - new Date(a));
    let streak  = 0;
    let cur     = new Date(); cur.setHours(0,0,0,0);
    for (const d of arr) {
      const sd = new Date(d); sd.setHours(0,0,0,0);
      const diff = Math.round((cur - sd) / 86400000);
      if (diff > 1) break;
      streak++;
      cur = sd;
    }
    return streak;
  }

  /** NTSA Readiness Score 0-100 */
  function getReadiness() {
    const lt = getLifetime();
    if (!lt.answered) return 0;
    const acc      = lt.accuracy / 100;                              // 0-1
    const breadth  = Math.min(Object.keys(CAT_GROUPS).length - getUntriedGroups().length, 7) / 7;
    const sessions = Math.min(lt.sessions, 20) / 20;
    return Math.round((acc * 0.6 + breadth * 0.2 + sessions * 0.2) * 100);
  }

  /** Last 7 calendar days with average score */
  function getLast7() {
    const sessions = getSessions();
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(Date.now() - (6 - i) * 86400000);
      d.setHours(0,0,0,0);
      const ds = d.toDateString();
      const day = sessions.filter(s => new Date(s.ts).toDateString() === ds);
      const avg = day.length
        ? Math.round(day.reduce((a, s) => a + s.pct, 0) / day.length) : null;
      return { label: d.toLocaleDateString('en-KE', { weekday: 'short' }).slice(0, 2), avg };
    });
  }

  /** Todays sessions */
  function getToday() {
    const today = new Date().toDateString();
    return getSessions().filter(s => new Date(s.ts).toDateString() === today);
  }

  /* ══════════════════════════════════════════════
     RECOMMENDATIONS ENGINE
  ══════════════════════════════════════════════ */

  function getRecommendations(maxCount = 3) {
    const recs  = [];
    const lt    = getLifetime();
    const untried = getUntriedGroups();

    /* 1. Weakest topic with attempts */
    const groupStats = Object.keys(CAT_GROUPS).map(g => ({ g, s: groupAccuracy(g) }))
      .filter(x => x.s && x.s.total >= 3)
      .sort((a, b) => a.s.pct - b.s.pct);

    if (groupStats.length && groupStats[0].s.pct < 75) {
      const w = groupStats[0];
      recs.push({
        type:  'weak',
        icon:  '🔴',
        title: `Weak area: ${w.g}`,
        body:  `Only ${w.s.pct}% accuracy on ${w.g} questions. ${
          w.s.pct < 50 ? 'Needs urgent practice.' :
          w.s.pct < 65 ? 'Just below the pass threshold.' : 'Almost there — one more session.'}`,
        action: () => {
          /* Find QUIZ category matching group, launch filtered quiz */
          const cats = CAT_GROUPS[w.g];
          if (window.quizSetMode && window.quizSetCat) {
            window.quizSetMode('category');
            const match = cats.find(c =>
              window.QUIZ?.some(q => normCat(q.cat) === normCat(c)));
            if (match) window.quizSetCat(match);
          }
          window.goTo?.('quiz');
        },
        actionLabel: `Practice ${w.g} →`,
      });
    }

    /* 2. Untried topic */
    if (untried.length && recs.length < maxCount) {
      const pick = untried[Math.floor(Math.random() * Math.min(untried.length, 3))];
      recs.push({
        type:  'untried',
        icon:  '📂',
        title: `Not tried yet: ${pick}`,
        body:  `You haven't answered any ${pick} questions yet. These appear in every real NTSA exam.`,
        action: () => {
          const cats = CAT_GROUPS[pick];
          if (window.quizSetMode && window.quizSetCat) {
            window.quizSetMode('category');
            const match = cats.find(c =>
              window.QUIZ?.some(q => normCat(q.cat) === normCat(c)));
            if (match) window.quizSetCat(match);
          }
          window.goTo?.('quiz');
        },
        actionLabel: `Try ${pick} →`,
      });
    }

    /* 3. Streak / consistency */
    if (recs.length < maxCount) {
      const streak = lt.streak;
      if (streak === 0) {
        recs.push({
          type: 'habit', icon: '🔥',
          title: 'Start your streak today',
          body:  'Studying daily is the single best predictor of passing the NTSA test. Even 5 minutes counts.',
          action: () => window.goTo?.('quiz'),
          actionLabel: 'Take a quick quiz →',
        });
      } else if (streak >= 3 && lt.avg < 70) {
        recs.push({
          type: 'habit', icon: '📈',
          title: `${streak}-day streak — now push the score`,
          body:  `Your average is ${lt.avg}%. With your consistency, focus on accuracy now — quality over quantity.`,
          action: () => window.goTo?.('quiz'),
          actionLabel: 'Go for a high score →',
        });
      } else if (streak >= 7) {
        recs.push({
          type: 'habit', icon: '🏆',
          title: `${streak}-day streak — outstanding`,
          body:  `You\'re on a ${streak}-day streak with ${lt.avg}% average. You may be ready to book the real test!`,
          action: () => {},
          actionLabel: null,
        });
      } else if (lt.sessions > 0) {
        const last = getSessions().at(-1);
        const daysSince = Math.floor((Date.now() - last.ts) / 86400000);
        if (daysSince >= 2) {
          recs.push({
            type: 'habit', icon: '⏰',
            title: `${daysSince} days since last session`,
            body:  'Consistency beats intensity. A short quiz now keeps the knowledge fresh.',
            action: () => window.goTo?.('quiz'),
            actionLabel: 'Resume studying →',
          });
        }
      }
    }

    /* 4. Near-pass encouragement */
    if (recs.length < maxCount && lt.avg !== null && lt.avg >= 60 && lt.avg < 70) {
      recs.push({
        type: 'near', icon: '🎯',
        title: `${lt.avg}% average — just 1 more push`,
        body:  'You need 70% to pass. Focus on your weakest topic for one session and you\'ll likely cross the line.',
        action: () => window.goTo?.('quiz'),
        actionLabel: 'Final push →',
      });
    }

    return recs.slice(0, maxCount);
  }

  /* ══════════════════════════════════════════════
     CSS — injected once
  ══════════════════════════════════════════════ */
  const CSS = `
  /* ── Progress dashboard on home page ── */
  #progressDash {
    margin: 0 0 20px;
    display: flex; flex-direction: column; gap: 10px;
  }

  /* Top row: readiness + streak + pass rate */
  .pd-top {
    display: grid; grid-template-columns: 100px 1fr 1fr;
    gap: 10px; align-items: center;
  }

  /* Readiness ring */
  .pd-ring-wrap { position: relative; width: 88px; height: 88px; }
  .pd-ring-wrap svg { width: 100%; height: 100%; transform: rotate(-90deg); }
  .pd-ring-bg   { fill: none; stroke: var(--border); stroke-width: 9; }
  .pd-ring-fill {
    fill: none; stroke-width: 9; stroke-linecap: round;
    transition: stroke-dashoffset 1.2s cubic-bezier(.16,1,.3,1);
  }
  .pd-ring-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column; align-items: center; justify-content: center;
  }
  .pd-ring-num  { font-family: var(--disp); font-size: .85rem; font-weight: 900; line-height: 1; }
  .pd-ring-lbl  { font-family: var(--mono); font-size: .3rem; color: var(--dim); letter-spacing: 1px; margin-top: 2px; }
  .pd-ring-sub  { font-family: var(--mono); font-size: .28rem; color: var(--dim); text-align: center; margin-top: 6px; letter-spacing: .5px; }

  /* Stat pills */
  .pd-stat {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; padding: 12px 14px;
    display: flex; flex-direction: column; gap: 2px;
  }
  .pd-stat-num  { font-family: var(--disp); font-size: .8rem; font-weight: 700; line-height: 1; }
  .pd-stat-lbl  { font-family: var(--mono); font-size: .36rem; color: var(--dim); letter-spacing: 1px; }
  .pd-stat-sub  { font-family: var(--mono); font-size: .32rem; color: var(--dim); }

  /* Sparkline row */
  .pd-spark {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 14px;
    display: flex; align-items: center; gap: 12px;
  }
  .pd-spark-label {
    font-family: var(--mono); font-size: .36rem; color: var(--dim); letter-spacing: 1px;
    flex-shrink: 0; writing-mode: horizontal-tb;
  }
  .pd-spark-bars {
    flex: 1; display: flex; align-items: flex-end; gap: 3px; height: 36px;
  }
  .pd-spark-col { flex: 1; display: flex; flex-direction: column; align-items: center; gap: 2px; }
  .pd-spark-bar { width: 100%; border-radius: 2px 2px 0 0; min-height: 2px; transition: height .5s ease; }
  .pd-spark-day { font-family: var(--mono); font-size: .28rem; color: var(--dim); }

  /* Today panel */
  .pd-today {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 14px;
    display: flex; align-items: center; gap: 12px;
  }
  .pd-today-icon { font-size: 1.2rem; flex-shrink: 0; }
  .pd-today-text { flex: 1; }
  .pd-today-title { font-family: var(--disp); font-size: .45rem; color: var(--text); letter-spacing: 1px; margin-bottom: 2px; }
  .pd-today-sub   { font-family: var(--mono); font-size: .38rem; color: var(--dim); letter-spacing: .5px; }
  .pd-today-btn {
    background: var(--gold); border: none; color: #000;
    padding: 7px 14px; border-radius: 4px;
    font-family: var(--disp); font-size: .42rem; font-weight: 700; letter-spacing: 1px;
    cursor: pointer; flex-shrink: 0;
    transition: background .15s, transform .1s;
    -webkit-tap-highlight-color: transparent;
  }
  .pd-today-btn:hover { background: #ffd740; transform: translateY(-1px); }

  /* Recommendations */
  .pd-recs { display: flex; flex-direction: column; gap: 6px; }
  .pd-rec {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 14px;
    display: flex; align-items: flex-start; gap: 10px;
    transition: border-color .2s;
  }
  .pd-rec:hover { border-color: var(--gold); }
  .pd-rec-icon { font-size: 1.1rem; flex-shrink: 0; margin-top: 1px; }
  .pd-rec-body { flex: 1; }
  .pd-rec-title { font-family: var(--disp); font-size: .44rem; color: var(--text); letter-spacing: 1px; margin-bottom: 3px; }
  .pd-rec-text  { font-family: var(--sans); font-size: .5rem; color: var(--dim); line-height: 1.6; }
  .pd-rec-btn {
    background: transparent; border: 1px solid var(--border);
    color: var(--gold); padding: 5px 10px; border-radius: 4px;
    font-family: var(--disp); font-size: .38rem; letter-spacing: 1px;
    cursor: pointer; flex-shrink: 0; align-self: center;
    transition: border-color .15s, background .15s;
    -webkit-tap-highlight-color: transparent;
  }
  .pd-rec-btn:hover { border-color: var(--gold); background: rgba(245,197,24,.06); }

  /* Section separator on home */
  .pd-section-title {
    font-family: var(--disp); font-size: .42rem; letter-spacing: 3px;
    color: var(--dim); margin: 4px 0 8px;
    display: flex; align-items: center; gap: 8px;
  }
  .pd-section-title::after { content: ''; flex: 1; height: 1px; background: var(--border); }

  /* ── Enhanced result overlay ── */
  #resEnhanced {
    margin-top: 12px;
    display: flex; flex-direction: column; gap: 8px;
    max-height: 280px; overflow-y: auto;
    padding-right: 2px;
  }
  #resEnhanced::-webkit-scrollbar { width: 3px; }
  #resEnhanced::-webkit-scrollbar-thumb { background: var(--border); border-radius: 2px; }

  /* Score comparison row */
  .res-compare {
    display: grid; grid-template-columns: 1fr 1fr 1fr;
    gap: 6px;
  }
  .res-comp-cell {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 6px; padding: 8px; text-align: center;
  }
  .res-comp-num { font-family: var(--disp); font-size: .62rem; font-weight: 700; line-height: 1; }
  .res-comp-lbl { font-family: var(--mono); font-size: .34rem; color: var(--dim); letter-spacing: 1px; margin-top: 3px; }

  /* Category table in result */
  .res-cat-row {
    display: flex; align-items: center; gap: 8px;
    padding: 6px 0; border-bottom: 1px solid rgba(26,37,53,.5);
  }
  .res-cat-row:last-child { border-bottom: none; }
  .res-cat-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
  }
  .res-cat-name {
    font-family: var(--mono); font-size: .42rem; color: var(--text);
    flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .res-cat-score {
    font-family: var(--disp); font-size: .46rem; font-weight: 700; flex-shrink: 0;
  }
  .res-cat-bar-wrap { width: 60px; height: 5px; background: var(--border); border-radius: 2px; flex-shrink: 0; overflow: hidden; }
  .res-cat-bar { height: 100%; border-radius: 2px; }

  /* Feedback box */
  .res-feedback {
    border-radius: 6px; padding: 8px 12px;
    font-family: var(--sans); font-size: .5rem; line-height: 1.6;
    display: flex; gap: 8px; align-items: flex-start;
  }
  .res-feedback.pass { background: rgba(0,230,118,.07); border: 1px solid rgba(0,230,118,.2); color: #69f0ae; }
  .res-feedback.fail { background: rgba(255,23,68,.07); border: 1px solid rgba(255,23,68,.2); color: #ff8a9b; }
  .res-feedback.near { background: rgba(245,197,24,.07); border: 1px solid rgba(245,197,24,.2); color: #ffd740; }

  /* Rec row in result */
  .res-rec-row {
    display: flex; align-items: center; gap: 8px;
    padding: 8px 10px; border-radius: 6px;
    background: rgba(245,197,24,.04); border: 1px solid rgba(245,197,24,.12);
  }
  .res-rec-icon { font-size: .9rem; flex-shrink: 0; }
  .res-rec-text { flex: 1; font-family: var(--sans); font-size: .48rem; color: var(--dim); line-height: 1.5; }
  .res-rec-btn {
    background: rgba(245,197,24,.1); border: 1px solid rgba(245,197,24,.25);
    color: var(--gold); padding: 4px 10px; border-radius: 4px;
    font-family: var(--disp); font-size: .36rem; letter-spacing: 1px;
    cursor: pointer; flex-shrink: 0; white-space: nowrap;
    -webkit-tap-highlight-color: transparent;
  }

  /* Empty state */
  .pd-empty {
    background: var(--panel2); border: 1px solid var(--border);
    border-radius: 8px; padding: 20px; text-align: center;
  }
  .pd-empty-icon { font-size: 1.8rem; margin-bottom: 8px; }
  .pd-empty-title { font-family: var(--disp); font-size: .52rem; color: var(--gold); letter-spacing: 2px; margin-bottom: 6px; }
  .pd-empty-sub   { font-family: var(--mono); font-size: .42rem; color: var(--dim); line-height: 1.7; }
  .pd-start-btn {
    margin-top: 14px; padding: 10px 24px;
    background: var(--gold); border: none; color: #000;
    font-family: var(--disp); font-size: .5rem; font-weight: 700; letter-spacing: 2px;
    border-radius: 4px; cursor: pointer;
    transition: background .15s, transform .1s;
    -webkit-tap-highlight-color: transparent;
  }
  .pd-start-btn:hover { background: #ffd740; transform: translateY(-1px); }

  @media(max-width:480px){
    .pd-top { grid-template-columns: 80px 1fr 1fr; }
    .pd-ring-wrap { width: 76px; height: 76px; }
    .res-compare { grid-template-columns: 1fr 1fr 1fr; }
    .res-cat-bar-wrap { width: 40px; }
  }
  `;

  function injectCSS() {
    const el = document.createElement('style');
    el.textContent = CSS;
    document.head.appendChild(el);
  }

  /* ══════════════════════════════════════════════
     HOME PROGRESS DASHBOARD
  ══════════════════════════════════════════════ */

  function buildHomeDash() {
    const lt        = getLifetime();
    const readiness = getReadiness();
    const today     = getToday();
    const last7     = getLast7();
    const recs      = getRecommendations(2);
    const sessions  = getSessions();

    /* Never started */
    if (!sessions.length) {
      return `
        <div class="pd-empty">
          <div class="pd-empty-icon">🎓</div>
          <div class="pd-empty-title">TRACK YOUR PROGRESS</div>
          <div class="pd-empty-sub">
            Complete your first quiz to see your readiness score,<br>
            accuracy by topic, and personalised study tips.
          </div>
          <button class="pd-start-btn" onclick="window.goTo('quiz')">START FIRST QUIZ →</button>
        </div>`;
    }

    /* Readiness ring */
    const R   = 36; const C = 2 * Math.PI * R;
    const off = C - (readiness / 100) * C;
    const col = readiness >= 70 ? 'var(--green)' : readiness >= 50 ? 'var(--gold)' : 'var(--red)';
    const lbl = readiness >= 80 ? 'Test-ready!' : readiness >= 60 ? 'Almost there' :
                readiness >= 40 ? 'Keep going'  : 'Just starting';

    /* Sparkline */
    const maxAvg = Math.max(...last7.map(d => d.avg || 0), 1);
    const sparkHtml = last7.map(d => {
      const h = d.avg !== null ? Math.round((d.avg / 100) * 32) : 0;
      const barCol = d.avg === null ? 'var(--border)'
        : d.avg >= 70 ? 'var(--green)' : d.avg >= 50 ? 'var(--gold)' : 'var(--red)';
      return `<div class="pd-spark-col">
        <div class="pd-spark-bar" style="height:${Math.max(h,2)}px;background:${barCol}"></div>
        <span class="pd-spark-day">${d.label}</span>
      </div>`;
    }).join('');

    /* Today message */
    const todayHtml = today.length
      ? `<div class="pd-today">
          <span class="pd-today-icon">✅</span>
          <div class="pd-today-text">
            <div class="pd-today-title">TODAY: ${today.length} SESSION${today.length !== 1 ? 'S' : ''}</div>
            <div class="pd-today-sub">Best: ${Math.max(...today.map(s => s.pct))}% · Avg: ${Math.round(today.reduce((a,s) => a+s.pct, 0)/today.length)}%</div>
          </div>
          <button class="pd-today-btn" onclick="window.goTo('quiz')">KEEP GOING</button>
        </div>`
      : `<div class="pd-today">
          <span class="pd-today-icon">📅</span>
          <div class="pd-today-text">
            <div class="pd-today-title">NO SESSION TODAY YET</div>
            <div class="pd-today-sub">Last: ${sessions.at(-1)?.date || '—'} · Score: ${sessions.at(-1)?.pct || '—'}%</div>
          </div>
          <button class="pd-today-btn" onclick="window.goTo('quiz')">STUDY NOW</button>
        </div>`;

    /* Recommendations */
    const recsHtml = recs.length
      ? `<div class="pd-section-title">TODAY'S RECOMMENDATIONS</div>
         <div class="pd-recs">
           ${recs.map((r, i) => `
             <div class="pd-rec">
               <span class="pd-rec-icon">${r.icon}</span>
               <div class="pd-rec-body">
                 <div class="pd-rec-title">${r.title}</div>
                 <div class="pd-rec-text">${r.body}</div>
               </div>
               ${r.actionLabel ? `<button class="pd-rec-btn" data-rec="${i}">${r.actionLabel}</button>` : ''}
             </div>`).join('')}
         </div>` : '';

    return `
      <div class="pd-section-title">YOUR PROGRESS</div>
      <div class="pd-top">
        <div>
          <div class="pd-ring-wrap">
            <svg viewBox="0 0 88 88">
              <circle class="pd-ring-bg"   cx="44" cy="44" r="${R}"/>
              <circle class="pd-ring-fill" cx="44" cy="44" r="${R}"
                stroke="${col}"
                stroke-dasharray="${C.toFixed(1)}"
                stroke-dashoffset="${off.toFixed(1)}"/>
            </svg>
            <div class="pd-ring-center">
              <span class="pd-ring-num" style="color:${col}">${readiness}</span>
              <span class="pd-ring-lbl">%</span>
            </div>
          </div>
          <div class="pd-ring-sub">NTSA READINESS<br>${lbl}</div>
        </div>

        <div class="pd-stat">
          <span class="pd-stat-num" style="color:var(--orange)">${lt.streak}🔥</span>
          <span class="pd-stat-lbl">DAY STREAK</span>
          <span class="pd-stat-sub">${lt.sessions} session${lt.sessions!==1?'s':''} total</span>
        </div>

        <div class="pd-stat">
          <span class="pd-stat-num" style="color:${lt.accuracy>=70?'var(--green)':lt.accuracy>=50?'var(--gold)':'var(--red)'}">${lt.accuracy}%</span>
          <span class="pd-stat-lbl">ACCURACY</span>
          <span class="pd-stat-sub">Best: ${lt.best !== null ? lt.best+'%' : '—'} · Avg: ${lt.avg !== null ? lt.avg+'%' : '—'}</span>
        </div>
      </div>

      <div class="pd-spark">
        <span class="pd-spark-label">7-DAY TREND</span>
        <div class="pd-spark-bars">${sparkHtml}</div>
      </div>

      ${todayHtml}
      ${recsHtml}
    `;
  }

  function injectHomeDash() {
    if (document.getElementById('progressDash')) return;

    const homeGrid = document.querySelector('#page-home .module-grid');
    if (!homeGrid) return;

    const dash = document.createElement('div');
    dash.id = 'progressDash';
    dash.innerHTML = buildHomeDash();

    /* Bind recommendation action buttons */
    const recs = getRecommendations(2);
    dash.querySelectorAll('[data-rec]').forEach(btn => {
      const idx = Number(btn.dataset.rec);
      btn.addEventListener('click', () => recs[idx]?.action?.());
    });

    homeGrid.parentElement.insertBefore(dash, homeGrid);
  }

  function refreshHomeDash() {
    const dash = document.getElementById('progressDash');
    if (!dash) { injectHomeDash(); return; }
    dash.innerHTML = buildHomeDash();
    const recs = getRecommendations(2);
    dash.querySelectorAll('[data-rec]').forEach(btn => {
      const idx = Number(btn.dataset.rec);
      btn.addEventListener('click', () => recs[idx]?.action?.());
    });
  }

  /* ══════════════════════════════════════════════
     ENHANCED RESULT OVERLAY
  ══════════════════════════════════════════════ */

  /** Build per-category breakdown for this quiz session */
  function buildSessionCatStats() {
    /* Read current quiz state from app globals */
    const quiz     = window.QUIZ;
    const order    = window.qOrder;
    const answers  = window.qAnswers;
    const selected = window.qSelected;
    if (!quiz || !order || !answers) return [];

    const cats = {};
    order.forEach((qi, idx) => {
      if (answers[idx] === null) return;     /* unanswered */
      const cat = normCat(quiz[qi]?.cat);
      if (!cats[cat]) cats[cat] = { correct: 0, wrong: 0 };
      if (answers[idx] === 'correct') cats[cat].correct++;
      else                             cats[cat].wrong++;
    });

    return Object.entries(cats).map(([cat, v]) => {
      const total = v.correct + v.wrong;
      return { cat, correct: v.correct, total, pct: Math.round(v.correct / total * 100) };
    }).sort((a, b) => a.pct - b.pct);   /* weakest first */
  }

  function buildEnhancedResult(pct, pass) {
    const lt       = getLifetime();
    const catStats = buildSessionCatStats();
    const recs     = getRecommendations(2);

    /* Comparison row */
    const prevBest = lt.best !== null ? lt.best : pct;
    const isNew    = lt.sessions <= 1;
    const isBest   = !isNew && pct >= prevBest;
    const avg      = lt.avg !== null ? lt.avg : pct;

    const compareHtml = `
      <div class="res-compare">
        <div class="res-comp-cell">
          <div class="res-comp-num" style="color:${pct>=70?'var(--green)':'var(--red)'}">${pct}%</div>
          <div class="res-comp-lbl">THIS SESSION</div>
        </div>
        <div class="res-comp-cell">
          <div class="res-comp-num" style="color:var(--gold)">${isNew?'—':prevBest+'%'}</div>
          <div class="res-comp-lbl">PERSONAL BEST${isBest?' 🆕':''}</div>
        </div>
        <div class="res-comp-cell">
          <div class="res-comp-num" style="color:var(--blue)">${isNew?'—':avg+'%'}</div>
          <div class="res-comp-lbl">YOUR AVERAGE</div>
        </div>
      </div>`;

    /* Category breakdown */
    const catHtml = catStats.length > 1
      ? `<div style="background:var(--panel2);border:1px solid var(--border);border-radius:6px;padding:10px 12px;">
          ${catStats.map(c => {
            const col = c.pct >= 70 ? 'var(--green)' : c.pct >= 50 ? 'var(--gold)' : 'var(--red)';
            return `<div class="res-cat-row">
              <span class="res-cat-dot" style="background:${col}"></span>
              <span class="res-cat-name">${c.cat}</span>
              <div class="res-cat-bar-wrap"><div class="res-cat-bar" style="width:${c.pct}%;background:${col}"></div></div>
              <span class="res-cat-score" style="color:${col}">${c.pct}%</span>
            </div>`;
          }).join('')}
        </div>` : '';

    /* Feedback message */
    const feedback = pass
      ? { cls: 'pass', icon: '✅', msg: pct >= 90
          ? 'Excellent! You\'re well above the pass mark. You\'re ready for the real test.'
          : pct >= 80
          ? 'Great work! Strong performance — keep this up and you\'ll pass first time.'
          : 'Passed! You\'re above 70%. Focus on any red topics below to build a bigger safety margin.' }
      : pct >= 60
      ? { cls: 'near', icon: '🎯', msg: `So close — ${70 - pct}% away from passing. Check the red topics below and retry.` }
      : { cls: 'fail', icon: '📚', msg: 'Below 70%. Don\'t worry — review the red topics below and try again. Most people improve significantly on the second attempt.' };

    const feedbackHtml = `<div class="res-feedback ${feedback.cls}">
      <span style="font-size:.9rem;flex-shrink:0">${feedback.icon}</span>
      <span>${feedback.msg}</span>
    </div>`;

    /* Recommendations */
    const recsHtml = recs.map((r, i) => r.actionLabel
      ? `<div class="res-rec-row">
          <span class="res-rec-icon">${r.icon}</span>
          <span class="res-rec-text"><strong>${r.title}</strong> — ${r.body}</span>
          <button class="res-rec-btn" data-res-rec="${i}">${r.actionLabel}</button>
        </div>` : '').filter(Boolean).join('');

    return { compareHtml, catHtml, feedbackHtml, recsHtml };
  }

  function patchQuizShowResult() {
    const _orig = window.quizShowResult;
    if (!_orig || window._progressPatched) return;
    window._progressPatched = true;

    window.quizShowResult = function () {
      _orig();

      /* Build enhanced content */
      const pct  = Math.round((window.qCorrect || 0) / (window.qOrder?.length || 1) * 100);
      const pass = pct >= 70;
      const { compareHtml, catHtml, feedbackHtml, recsHtml } = buildEnhancedResult(pct, pass);

      /* Remove any old enhanced block */
      document.getElementById('resEnhanced')?.remove();

      const container = document.createElement('div');
      container.id = 'resEnhanced';
      container.innerHTML = compareHtml + feedbackHtml + catHtml + (recsHtml ? `<div style="display:flex;flex-direction:column;gap:6px">${recsHtml}</div>` : '');

      /* Bind rec buttons */
      const recs = getRecommendations(2);
      container.querySelectorAll('[data-res-rec]').forEach(btn => {
        const idx = Number(btn.dataset.resRec);
        btn.addEventListener('click', () => {
          recs[idx]?.action?.();
          document.getElementById('quizResult')?.classList.remove('show');
        });
      });

      /* Inject after resDetail */
      const resDetail = document.getElementById('resDetail');
      resDetail?.after(container);

      /* Refresh home dash in background */
      setTimeout(refreshHomeDash, 300);
    };
  }

  /* ══════════════════════════════════════════════
     HOOK goTo — refresh dash on home visits
  ══════════════════════════════════════════════ */
  function patchGoTo() {
    const _orig = window.goTo;
    if (!_orig || window._progressGoToPatched) return;
    window._progressGoToPatched = true;

    window.goTo = function (page) {
      _orig(page);
      if (page === 'home') setTimeout(refreshHomeDash, 80);
    };
  }

  /* ══════════════════════════════════════════════
     BOOTSTRAP
  ══════════════════════════════════════════════ */
  function init() {
    injectCSS();

    /* Wait for app JS to finish loading before patching */
    const ready = () => {
      injectHomeDash();
      patchQuizShowResult();
      patchGoTo();
    };

    /* If QUIZ is already defined, run now; otherwise wait */
    if (window.QUIZ) {
      ready();
    } else {
      const t = setInterval(() => {
        if (window.QUIZ) { clearInterval(t); ready(); }
      }, 100);
      /* Fallback — run after 2 s regardless */
      setTimeout(() => { clearInterval(t); ready(); }, 2000);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
