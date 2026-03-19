/* ═══════════════════════════════════════════════════════════
   SpendWise — app.js
   Full frontend logic: auth, data, charts, PDF, UI
═══════════════════════════════════════════════════════════ */

const API = '';   // empty → same origin (FastAPI serves frontend)

// ─── CATEGORY MAP ────────────────────────────────────────
const CATS = {
  income: [
    { id:'Salary',       emoji:'💼', label:'Salary'       },
    { id:'Freelance',    emoji:'💻', label:'Freelance'     },
    { id:'Investment',   emoji:'📊', label:'Investment'    },
    { id:'Business',     emoji:'🏪', label:'Business'      },
    { id:'Gift',         emoji:'🎁', label:'Gift'          },
    { id:'Other Income', emoji:'💰', label:'Other Income'  },
  ],
  expense: [
    { id:'Food',           emoji:'🛒', label:'Food'          },
    { id:'Transportation', emoji:'🚌', label:'Transport'      },
    { id:'Bills',          emoji:'📃', label:'Bills'          },
    { id:'Rent',           emoji:'🏠', label:'Rent'           },
    { id:'Entertainment',  emoji:'🎬', label:'Entertainment'  },
    { id:'Healthcare',     emoji:'🏥', label:'Healthcare'     },
    { id:'Education',      emoji:'📚', label:'Education'      },
    { id:'Shopping',       emoji:'🛍️', label:'Shopping'       },
    { id:'Fuel',           emoji:'⛽', label:'Fuel'           },
    { id:'Groceries',      emoji:'🥦', label:'Groceries'      },
    { id:'EMI',            emoji:'💳', label:'EMI'            },
    { id:'Travel',         emoji:'✈️', label:'Travel'         },
    { id:'Other',          emoji:'📦', label:'Other'          },
  ],
  recurring: [
    { id:'Subscription',  emoji:'📺', label:'Subscription'  },
    { id:'Rent',          emoji:'🏠', label:'Rent'           },
    { id:'Insurance',     emoji:'🛡️', label:'Insurance'      },
    { id:'EMI',           emoji:'💳', label:'EMI'            },
    { id:'SIP',           emoji:'📈', label:'SIP'            },
    { id:'Utilities',     emoji:'💡', label:'Utilities'      },
    { id:'Other',         emoji:'🔄', label:'Other'          },
  ]
};

const CAT_COLORS = [
  '#00e5a0','#4c9eff','#ff4b6e','#ffb930','#a78bfa',
  '#f97316','#06b6d4','#84cc16','#f43f5e','#8b5cf6',
  '#14b8a6','#eab308','#ec4899'
];

// ─── STATE ───────────────────────────────────────────────
let USER         = null;
let TRANSACTIONS = [];
let BUDGETS      = {};
let GOALS        = [];

let chartTrend   = null;
let chartDonut   = null;
let chartGauge   = null;
let chartReport  = null;
let chartCatBar  = null;

let histTypeFilter  = 'all';
let histMonthFilter = 'all';

// ─── HELPERS ─────────────────────────────────────────────
const $  = id => document.getElementById(id);
const q  = sel => document.querySelector(sel);
const qq = sel => document.querySelectorAll(sel);

function setHTML(id, html) { $(id).innerHTML = html; }
function setTxt(id, txt)   { $(id).textContent = txt; }
function val(id)            { return $(id).value; }

function fmt(amount) {
  const sym = USER?.currency || '₹';
  return sym + Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
}

function todayStr() {
  return new Date().toISOString().split('T')[0];
}

function monthKey(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
}

function monthLabel(key) {
  const [y, m] = key.split('-');
  const d = new Date(parseInt(y), parseInt(m)-1, 1);
  return d.toLocaleDateString('en-IN', { month:'short', year:'numeric' });
}

function catInfo(mode, catId) {
  const list = CATS[mode] || CATS.expense;
  return list.find(c => c.id === catId) || { emoji:'📦', label: catId };
}

// ─── TOAST ───────────────────────────────────────────────
let _toastTimer = null;
function showToast(msg, type='success', duration=2800) {
  const icons = { success:'✓', error:'✕', info:'ℹ' };
  const el = $('toast');
  el.className = `toast ${type}`;
  setHTML('toast-icon', icons[type]);
  setTxt('toast-msg', msg);
  el.classList.add('show');
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => el.classList.remove('show'), duration);
}

// ─── SCREENS ─────────────────────────────────────────────
function showScreen(name) {
  $$('screen-login', 'screen-signup').forEach(el => el.classList.add('hidden'));
  $('bottom-nav').style.display = 'none';
  qq('.page').forEach(p => p.classList.remove('active'));
  if (name === 'login')  { $('screen-login').classList.remove('hidden'); }
  if (name === 'signup') { $('screen-signup').classList.remove('hidden'); }
}

function $$(a, b) { return [$(a), $(b)]; }  // tiny util

function launchApp() {
  $('screen-login').classList.add('hidden');
  $('screen-signup').classList.add('hidden');
  $('bottom-nav').style.display = '';
  gotoPage('dashboard');
}

// ─── PAGES ───────────────────────────────────────────────
function gotoPage(name, navEl) {
  qq('.page').forEach(p => p.classList.remove('active'));
  $(`page-${name}`).classList.add('active');

  // update nav
  qq('.nav-item').forEach(n => n.classList.remove('active'));
  if (navEl) {
    navEl.classList.add('active');
  } else {
    // find matching nav item
    const navItems = qq('.nav-item');
    const pages = ['dashboard','history','budget','goals','reports','settings'];
    const idx = pages.indexOf(name);
    if (idx >= 0) navItems[idx]?.classList.add('active');
  }

  // render page-specific content
  if (name === 'dashboard') renderDashboard();
  if (name === 'history')   renderHistory();
  if (name === 'budget')    renderBudget();
  if (name === 'goals')     renderGoals();
  if (name === 'reports')   renderReports();
  if (name === 'settings')  renderSettings();
}

// ─── SHEETS ──────────────────────────────────────────────
function openSheet(name) {
  $(`sheet-${name}`).classList.add('show');
  document.body.style.overflow = 'hidden';
}
function closeSheet(name) {
  $(`sheet-${name}`).classList.remove('show');
  document.body.style.overflow = '';
}
function handleOverlayClick(e, sheetId) {
  if (e.target === $(sheetId)) closeSheet(sheetId.replace('sheet-',''));
}

// ─── DATA FETCH ───────────────────────────────────────────
async function loadAll() {
  try {
    const [txRes, budRes, goalRes] = await Promise.all([
      fetch(`${API}/transactions?username=${USER.username}`),
      fetch(`${API}/budgets?username=${USER.username}`),
      fetch(`${API}/goals?username=${USER.username}`)
    ]);
    TRANSACTIONS = await txRes.json();
    BUDGETS      = await budRes.json();
    GOALS        = await goalRes.json();
  } catch(e) {
    showToast('Could not load data. Is the server running?', 'error', 4000);
  }
}

// ═══════════════════════════════════════════════════════════
// AUTH
// ═══════════════════════════════════════════════════════════

function validateUsername(inp) {
  const v = inp.value.trim();
  const badge = $('uname-badge');
  if (!v) { badge.innerHTML=''; inp.classList.remove('valid','invalid'); return; }
  if (/^[a-zA-Z0-9_]{3,20}$/.test(v)) {
    badge.className='uname-badge ok'; badge.innerHTML='✓ Looks good';
    inp.classList.add('valid'); inp.classList.remove('invalid');
  } else {
    badge.className='uname-badge bad'; badge.innerHTML='✕ Use 3–20 letters, numbers or _';
    inp.classList.add('invalid'); inp.classList.remove('valid');
  }
}

async function doSignup() {
  const name  = val('signup-name').trim();
  const user  = val('signup-user').trim();
  const pass  = val('signup-pass');
  const pass2 = val('signup-pass2');
  const cur   = val('signup-cur');
  const errEl = $('signup-error');

  errEl.classList.remove('show');
  if (!name || !user || !pass) { showErr(errEl, 'Please fill in all fields.'); return; }
  if (pass.length < 6)         { showErr(errEl, 'Password must be at least 6 characters.'); return; }
  if (pass !== pass2)          { showErr(errEl, 'Passwords do not match.'); return; }
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(user)) { showErr(errEl, 'Invalid username format.'); return; }

  setBtnLoading('btn-signup', true);
  try {
    const res  = await fetch(`${API}/signup`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:user, password:pass, name, currency:cur })
    });
    const data = await res.json();
    if (data.status === 'success') {
      showToast('Account created! Please sign in.', 'success');
      showScreen('login');
      $('login-user').value = user;
    } else {
      showErr(errEl, data.msg || 'Signup failed.');
    }
  } catch { showErr(errEl, 'Server not reachable.'); }
  setBtnLoading('btn-signup', false);
}

async function doLogin() {
  const user  = val('login-user').trim();
  const pass  = val('login-pass');
  const errEl = $('login-error');
  errEl.classList.remove('show');

  if (!user || !pass) { showErr(errEl, 'Enter username and password.'); return; }

  setBtnLoading('btn-login', true);
  try {
    const res  = await fetch(`${API}/login`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:user, password:pass })
    });
    const data = await res.json();
    if (data.status === 'success') {
      USER = data.user;
      sessionStorage.setItem('sw_user', JSON.stringify(USER));
      await loadAll();
      launchApp();
      updateUserUI();
      initTxSheet();
    } else {
      showErr(errEl, data.msg || 'Invalid credentials.');
    }
  } catch { showErr(errEl, 'Server not reachable.'); }
  setBtnLoading('btn-login', false);
}

function doLogout() {
  USER = null; TRANSACTIONS=[]; BUDGETS={}; GOALS=[];
  sessionStorage.removeItem('sw_user');
  destroyCharts();
  showScreen('login');
  showToast('Signed out successfully.', 'info');
}

function showErr(el, msg) {
  el.textContent = msg; el.classList.add('show');
}

function setBtnLoading(id, loading) {
  const btn = $(id);
  if (!btn) return;
  if (loading) {
    btn._origText = btn.innerHTML;
    btn.innerHTML = '<span class="spinner"></span>';
    btn.disabled = true;
  } else {
    btn.innerHTML = btn._origText || 'Submit';
    btn.disabled = false;
  }
}

function updateUserUI() {
  if (!USER) return;
  const init = (USER.name || USER.username)[0].toUpperCase();
  setTxt('dash-avatar', init);
  setTxt('dash-name', USER.name || USER.username);
  setTxt('set-avatar', init);
  setTxt('set-display-name', USER.name || USER.username);
  setTxt('set-display-user', '@' + USER.username);
  $('amt-currency-sym').textContent = USER.currency || '₹';
  $('bud-cur-sym').textContent = USER.currency || '₹';
  $('goal-update-sym').textContent = USER.currency || '₹';
  if ($('set-name'))     $('set-name').value = USER.name || '';
  if ($('set-currency')) $('set-currency').value = USER.currency || '₹';
}

// ═══════════════════════════════════════════════════════════
// ADD TRANSACTION SHEET
// ═══════════════════════════════════════════════════════════

function initTxSheet() {
  // Set today's date default
  const today = todayStr();
  $('tx-date').value = today;
  $('tx-date-display').textContent = 'Today';
  buildCatPanel('expense');
}

function setTxMode(mode) {
  const cfg = {
    income:    { title:'Add Income',    btn:'Save Income',    cls:'income'    },
    expense:   { title:'Add Expense',   btn:'Add Expense',    cls:'expense'   },
    recurring: { title:'Recurring',     btn:'Add Recurring',  cls:'recurring' }
  };
  const c = cfg[mode];

  // Update titles
  setTxt('tx-sheet-title', c.title);
  setTxt('tx-cta-label',   c.btn);

  // Segmented tab highlight
  ['income','expense','recurring'].forEach(m => {
    $(`ts-${m}`).classList.toggle('sel', m===mode);
  });

  // Amount field color
  $('amt-wrap').querySelector('.amt-label').className = `amt-label ${mode}`;
  $('amt-box').className = `amt-box ${mode}`;

  // CTA color
  $('tx-cta-btn').className = `tx-cta ${mode}`;

  // Show/hide recurring toggle
  const isRec = mode === 'recurring';
  $('rec-toggle-row').style.display = isRec ? 'none' : '';
  $('repeat-wrap').style.display    = isRec ? '' : 'none';
  if (!isRec) {
    $('tx-rec-toggle').classList.remove('on');
    $('tx-is-rec').value = '0';
  } else {
    $('tx-is-rec').value = '1';
  }

  $('tx-mode').value = mode;
  buildCatPanel(mode);
}

function buildCatPanel(mode) {
  const cats = CATS[mode] || CATS.expense;
  const panel = $('cat-panel');
  const selClass = mode === 'expense' ? 'sel-expense' : mode === 'recurring' ? 'sel-recurring' : '';
  const currentCat = $('tx-category').value;

  panel.innerHTML = cats.map(c => `
    <div class="cat-opt ${selClass} ${c.id===currentCat?'selected':''}"
         onclick="selectCat('${c.id}','${c.emoji}','${c.label}','${selClass}')">
      <span class="co-emoji">${c.emoji}</span>
      <span class="co-name">${c.label}</span>
    </div>
  `).join('');

  // default to first
  if (!cats.find(c=>c.id===currentCat)) {
    selectCat(cats[0].id, cats[0].emoji, cats[0].label, selClass, false);
  }
}

function toggleCatPanel() {
  const panel = $('cat-panel');
  const chevron = $('cat-chevron');
  panel.classList.toggle('open');
  chevron.classList.toggle('open');
}

function selectCat(id, emoji, label, selClass, closePanel=true) {
  $('tx-category').value = id;
  $('cat-emoji').textContent = emoji;
  $('cat-name').textContent  = label;

  // update selected state in panel
  qq('.cat-opt').forEach(o => {
    o.classList.remove('selected');
    if (o.textContent.includes(label)) o.classList.add('selected');
  });

  if (closePanel) {
    $('cat-panel').classList.remove('open');
    $('cat-chevron').classList.remove('open');
  }
}

function onDateChange(dateStr) {
  if (!dateStr) return;
  const today = todayStr();
  $('tx-date-display').textContent = dateStr === today ? 'Today' : fmtDate(dateStr);
}

function toggleRecurring() {
  const tog = $('tx-rec-toggle');
  tog.classList.toggle('on');
  const on = tog.classList.contains('on');
  $('tx-is-rec').value = on ? '1' : '0';
  $('repeat-wrap').style.display = on ? '' : 'none';
}

function selectRepeat(el) {
  qq('.repeat-opt').forEach(o => o.classList.remove('active'));
  el.classList.add('active');
  $('tx-period').value = el.dataset.val;
}

async function submitTransaction() {
  const amount = parseFloat(val('tx-amount'));
  if (!amount || amount <= 0) { showToast('Enter a valid amount.', 'error'); return; }

  const tx = {
    username:  USER.username,
    type:      val('tx-mode'),
    amount,
    category:  val('tx-category'),
    description: val('tx-note'),
    date:      val('tx-date') || todayStr(),
    recurring: val('tx-is-rec') === '1',
    period:    val('tx-period')
  };

  try {
    const res  = await fetch(`${API}/transactions`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify(tx)
    });
    const data = await res.json();
    if (data.status === 'success') {
      TRANSACTIONS.push(data.tx);
      closeSheet('tx');
      showToast(`${tx.type === 'income' ? 'Income' : 'Expense'} added!`, 'success');
      // reset form
      $('tx-amount').value = '';
      $('tx-note').value   = '';
      // re-render current page
      const activePage = q('.page.active')?.id?.replace('page-','');
      if (activePage) gotoPage(activePage);
    } else {
      showToast(data.msg || 'Failed to add.', 'error');
    }
  } catch { showToast('Server error.', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════

function renderDashboard() {
  const now    = new Date();
  const curKey = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;

  const userTx = TRANSACTIONS.filter(t => t.username === USER.username);
  const monthTx = userTx.filter(t => monthKey(t.date) === curKey);

  const totalIncome  = userTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExpense = userTx.filter(t=>t.type!=='income').reduce((s,t)=>s+t.amount,0);
  const mIncome      = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const mExpense     = monthTx.filter(t=>t.type!=='income').reduce((s,t)=>s+t.amount,0);
  const balance      = totalIncome - totalExpense;
  const netSaved     = mIncome - mExpense;

  setTxt('d-balance', fmt(balance));
  setTxt('d-income',  fmt(mIncome));
  setTxt('d-expense', fmt(mExpense));
  setTxt('d-saved',   fmt(netSaved));

  // Trend chart
  renderTrendChart(userTx);

  // Donut
  renderDonutChart(userTx.filter(t=>t.type==='expense'));

  // Recent txs
  const recent = [...userTx].sort((a,b)=>new Date(b.date)-new Date(a.date)).slice(0,5);
  setHTML('dash-recent', recent.length
    ? recent.map(t => txHTML(t)).join('')
    : emptyHTML('No transactions yet', 'Add your first income or expense above.')
  );

  // Budget preview
  const budgets = BUDGETS;
  if (Object.keys(budgets).length === 0) {
    setHTML('dash-budget', emptyHTML('No budgets set', 'Set limits on the Budget page.'));
  } else {
    setHTML('dash-budget', Object.entries(budgets).map(([cat, limit]) => {
      const spent = monthTx.filter(t=>t.category===cat&&t.type==='expense').reduce((s,t)=>s+t.amount,0);
      const pct   = Math.min(100, Math.round((spent/limit)*100));
      const color = pct >= 90 ? 'var(--rd)' : pct >= 70 ? 'var(--am)' : 'var(--gr)';
      return `
        <div class="budget-row">
          <div class="budget-row-header">
            <div class="budget-row-left">
              <span class="budget-row-emoji">${getCatEmoji('expense', cat)}</span>
              <span class="budget-row-name">${cat}</span>
              <span class="badge ${pct>=90?'red':pct>=70?'amber':'green'}" style="margin-left:6px;">${pct}%</span>
            </div>
            <div class="budget-row-amounts">${fmt(spent)} / ${fmt(limit)}</div>
          </div>
          <div class="progress-bar">
            <div class="progress-fill" style="width:${pct}%;background:${color};"></div>
          </div>
        </div>`;
    }).join(''));
  }
}

function getCatEmoji(mode, catId) {
  return catInfo(mode, catId).emoji;
}

function txHTML(t, showDel=true) {
  const isIncome = t.type === 'income';
  const isRec    = t.type === 'recurring';
  const clsType  = isIncome ? 'income' : isRec ? 'recurring' : 'expense';
  const sign     = isIncome ? '+' : '−';
  const emoji    = catInfo(t.type, t.category).emoji;
  const delBtn   = showDel
    ? `<div class="tx-del-btn" onclick="deleteTx(${t.id})" title="Delete">✕</div>`
    : '';
  return `
    <div class="tx-item">
      <div class="tx-icon ${clsType}">${emoji}</div>
      <div class="tx-info">
        <div class="tx-title">${t.category}${t.description ? ' — '+escHtml(t.description) : ''}</div>
        <div class="tx-meta">${t.type.charAt(0).toUpperCase()+t.type.slice(1)}${t.recurring?' · 🔄':''}</div>
      </div>
      <div class="tx-right">
        <div class="tx-amount ${clsType}">${sign}${fmt(t.amount)}</div>
        <div class="tx-date">${fmtDate(t.date)}</div>
      </div>
      ${delBtn}
    </div>`;
}

function emptyHTML(title, desc) {
  return `<div class="empty-state">
    <div class="empty-icon">📭</div>
    <div class="empty-text"><strong>${title}</strong><br>${desc}</div>
  </div>`;
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ─── TREND CHART ──────────────────────────────────────────
function renderTrendChart(txList) {
  const ctx = $('chart-trend').getContext('2d');
  if (chartTrend) chartTrend.destroy();

  // Build last 6 months
  const months = [];
  const now = new Date();
  for (let i=5; i>=0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const incData = months.map(m =>
    txList.filter(t=>t.type==='income' && monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0)
  );
  const expData = months.map(m =>
    txList.filter(t=>t.type!=='income' && monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0)
  );
  const labels = months.map(m => monthLabel(m).split(' ')[0]);

  chartTrend = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [
        { label:'Income', data:incData, borderColor:'#00e5a0', backgroundColor:'rgba(0,229,160,.08)',
          tension:.4, fill:true, pointBackgroundColor:'#00e5a0', pointRadius:4 },
        { label:'Expense', data:expData, borderColor:'#ff4b6e', backgroundColor:'rgba(255,75,110,.08)',
          tension:.4, fill:true, pointBackgroundColor:'#ff4b6e', pointRadius:4 }
      ]
    },
    options: {
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#55556a', font:{family:'DM Sans',size:11} } },
        y:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#55556a', font:{family:'DM Sans',size:11} },
            beginAtZero:true }
      }
    }
  });
}

// ─── DONUT CHART ──────────────────────────────────────────
function renderDonutChart(expenses) {
  const ctx = $('chart-donut').getContext('2d');
  if (chartDonut) chartDonut.destroy();

  const catMap = {};
  expenses.forEach(t => { catMap[t.category] = (catMap[t.category]||0) + t.amount; });
  const sorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,7);
  const total  = sorted.reduce((s,[,v])=>s+v,0);

  if (sorted.length === 0) {
    setHTML('donut-legend', '<div style="color:var(--tx3);font-size:13px;">No expense data yet.</div>');
    chartDonut = new Chart(ctx, {
      type:'doughnut',
      data:{ labels:['None'], datasets:[{ data:[1], backgroundColor:['#1f1f32'], borderWidth:0 }] },
      options:{ responsive:false, cutout:'70%', plugins:{ legend:{ display:false }, tooltip:{ enabled:false } } }
    });
    return;
  }

  chartDonut = new Chart(ctx, {
    type:'doughnut',
    data:{
      labels: sorted.map(([k])=>k),
      datasets:[{
        data:   sorted.map(([,v])=>v),
        backgroundColor: sorted.map((_,i)=>CAT_COLORS[i % CAT_COLORS.length]),
        borderWidth: 2,
        borderColor: '#0e0e1a',
        hoverOffset: 6
      }]
    },
    options:{
      responsive:false, cutout:'68%',
      plugins:{
        legend:{ display:false },
        tooltip:{ callbacks:{ label: ctx => ` ${ctx.label}: ${fmt(ctx.parsed)}` } }
      }
    }
  });

  setHTML('donut-legend', sorted.map(([cat, amt], i) => `
    <div class="donut-legend-row">
      <div class="donut-dot" style="background:${CAT_COLORS[i%CAT_COLORS.length]};"></div>
      <div class="donut-name">${cat}</div>
      <div class="donut-pct" style="color:${CAT_COLORS[i%CAT_COLORS.length]};">
        ${Math.round((amt/total)*100)}%
      </div>
    </div>
  `).join(''));
}

// ═══════════════════════════════════════════════════════════
// HISTORY
// ═══════════════════════════════════════════════════════════

function setHistFilter(el, type) {
  qq('#hist-type-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  histTypeFilter = type;
  renderHistory();
}

function renderHistory() {
  const userTx = TRANSACTIONS.filter(t => t.username === USER.username);

  // Build month chips
  const months = [...new Set(userTx.map(t=>monthKey(t.date)).filter(Boolean))].sort().reverse();
  const monthContainer = $('hist-month-chips');
  if (monthContainer && monthContainer.dataset.built !== 'yes') {
    monthContainer.innerHTML = [
      `<div class="chip active" onclick="setHistMonthFilter(this,'all')">All Months</div>`,
      ...months.map(m => `<div class="chip" onclick="setHistMonthFilter(this,'${m}')">${monthLabel(m)}</div>`)
    ].join('');
    monthContainer.dataset.built = 'yes';
  }

  const search  = val('hist-search').toLowerCase();
  const selMode = histTypeFilter;
  const selMon  = histMonthFilter;

  let filtered = userTx.filter(t => {
    if (selMode !== 'all' && t.type !== selMode) return false;
    if (selMon  !== 'all' && monthKey(t.date) !== selMon) return false;
    if (search) {
      const hay = `${t.category} ${t.description||''} ${t.amount}`.toLowerCase();
      if (!hay.includes(search)) return false;
    }
    return true;
  }).sort((a,b)=>new Date(b.date)-new Date(a.date));

  const total = filtered.reduce((s,t) => t.type==='income' ? s+t.amount : s-t.amount, 0);
  setTxt('hist-info', `${filtered.length} transaction${filtered.length!==1?'s':''} · Net: ${fmt(total)}`);
  setHTML('hist-list', filtered.length
    ? `<div class="card">${filtered.map(t => txHTML(t)).join('')}</div>`
    : emptyHTML('No transactions found', 'Try a different filter or search term.')
  );
}

function setHistMonthFilter(el, month) {
  qq('#hist-month-chips .chip').forEach(c => c.classList.remove('active'));
  el.classList.add('active');
  histMonthFilter = month;
  renderHistory();
}

async function deleteTx(id) {
  try {
    await fetch(`${API}/transactions/${id}?username=${USER.username}`, { method:'DELETE' });
    TRANSACTIONS = TRANSACTIONS.filter(t => t.id !== id);
    showToast('Transaction deleted.', 'info');
    const activePage = q('.page.active')?.id?.replace('page-','');
    if (activePage) gotoPage(activePage);
  } catch { showToast('Could not delete.', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// BUDGET
// ═══════════════════════════════════════════════════════════

function initBudgetMonths() {
  const sel = $('budget-month');
  if (!sel) return;
  const now = new Date();
  const options = [];
  for (let i=0; i<6; i++) {
    const d   = new Date(now.getFullYear(), now.getMonth()-i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
    const lbl = d.toLocaleDateString('en-IN', { month:'long', year:'numeric' });
    options.push(`<option value="${key}">${lbl}</option>`);
  }
  sel.innerHTML = options.join('');
}

function renderBudget() {
  if (!$('budget-month').innerHTML) initBudgetMonths();
  const selMon  = val('budget-month') || monthKey(todayStr());
  const userTx  = TRANSACTIONS.filter(t => t.username === USER.username);
  const monthTx = userTx.filter(t => monthKey(t.date) === selMon);
  const budgets = BUDGETS;

  const mIncome  = monthTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const budTotal = Object.values(budgets).reduce((s,v)=>s+v,0);
  const mExpense = monthTx.filter(t=>t.type!=='income').reduce((s,t)=>s+t.amount,0);

  setTxt('bud-income',    fmt(mIncome));
  setTxt('bud-total',     fmt(budTotal));
  setTxt('bud-remaining', fmt(budTotal - mExpense));

  // Gauge chart
  renderGaugeChart(budTotal > 0 ? Math.min(100, (mExpense/budTotal)*100) : 0);

  // Category rows
  if (Object.keys(budgets).length === 0) {
    setHTML('budget-cats', emptyHTML('No budgets set','Tap + to add limits by category.'));
    return;
  }

  setHTML('budget-cats', Object.entries(budgets).map(([cat, limit]) => {
    const spent = monthTx.filter(t=>t.category===cat&&t.type!=='income').reduce((s,t)=>s+t.amount,0);
    const pct   = Math.min(100, Math.round((spent/limit)*100));
    const clr   = pct >= 90 ? 'var(--rd)' : pct >= 70 ? 'var(--am)' : 'var(--gr)';
    const emoji = getCatEmoji('expense', cat);
    return `
      <div class="budget-row">
        <div class="budget-row-header">
          <div class="budget-row-left">
            <span class="budget-row-emoji">${emoji}</span>
            <span class="budget-row-name" style="font-size:14px;font-weight:700;">${cat}</span>
            <span class="badge ${pct>=90?'red':pct>=70?'amber':'green'}" style="margin-left:6px;">${pct}%</span>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            <div class="budget-row-amounts">${fmt(spent)} / ${fmt(limit)}</div>
            <div class="tx-del-btn" onclick="deleteBudget('${cat}')" title="Remove">✕</div>
          </div>
        </div>
        <div class="progress-bar">
          <div class="progress-fill" style="width:${pct}%;background:${clr};"></div>
        </div>
      </div>`;
  }).join(''));
}

function renderGaugeChart(pct) {
  const ctx = $('chart-gauge').getContext('2d');
  if (chartGauge) chartGauge.destroy();
  const color = pct >= 90 ? '#ff4b6e' : pct >= 70 ? '#ffb930' : '#00e5a0';
  chartGauge = new Chart(ctx, {
    type: 'doughnut',
    data: {
      datasets:[{
        data: [pct, 100-pct],
        backgroundColor: [color, '#1f1f32'],
        borderWidth: 0, circumference: 270, rotation: 225
      }]
    },
    options: {
      cutout:'75%', responsive:false,
      plugins:{
        legend:{ display:false },
        tooltip:{ enabled:false }
      }
    },
    plugins:[{
      id:'gaugeLabel',
      afterDraw(chart) {
        const { ctx:c, width:w, height:h } = chart;
        c.save();
        c.font = `800 28px Sora, sans-serif`;
        c.fillStyle = color;
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText(`${Math.round(pct)}%`, w/2, h/2 + 10);
        c.font = `500 12px DM Sans, sans-serif`;
        c.fillStyle = '#55556a';
        c.fillText('Budget Used', w/2, h/2 + 34);
        c.restore();
      }
    }]
  });
}

async function submitBudget() {
  const cat   = val('bud-category');
  const limit = parseFloat(val('bud-limit'));
  if (!cat || !limit || limit <= 0) { showToast('Enter a valid limit.', 'error'); return; }

  try {
    const res  = await fetch(`${API}/budgets`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:USER.username, category:cat, limit })
    });
    const data = await res.json();
    if (data.status === 'saved') {
      BUDGETS[cat] = limit;
      closeSheet('budget');
      $('bud-limit').value = '';
      showToast(`Budget set for ${cat}!`, 'success');
      renderBudget();
    }
  } catch { showToast('Server error.', 'error'); }
}

async function deleteBudget(cat) {
  try {
    await fetch(`${API}/budgets/${encodeURIComponent(cat)}?username=${USER.username}`, { method:'DELETE' });
    delete BUDGETS[cat];
    showToast(`${cat} budget removed.`, 'info');
    renderBudget();
  } catch { showToast('Could not delete.', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// GOALS
// ═══════════════════════════════════════════════════════════

function renderGoals() {
  const userGoals = GOALS.filter(g => g.username === USER.username);
  if (userGoals.length === 0) {
    setHTML('goals-list', emptyHTML('No goals yet','Set your first savings goal!'));
    return;
  }
  setHTML('goals-list', userGoals.map(g => {
    const pct = Math.min(100, Math.round((g.current/g.target)*100));
    const daysLeft = g.deadline
      ? Math.max(0, Math.ceil((new Date(g.deadline)-new Date())/86400000))
      : null;
    return `
      <div class="goal-card">
        <div class="goal-header">
          <div style="display:flex;align-items:center;gap:10px;">
            <div style="width:12px;height:12px;border-radius:50%;background:${g.color||'#00e5a0'};flex-shrink:0;"></div>
            <div class="goal-name">${escHtml(g.name)}</div>
            ${pct >= 100 ? '<span class="badge green">🎉 Achieved!</span>' : ''}
          </div>
          <div style="display:flex;gap:8px;">
            <div class="icon-btn" onclick="openGoalUpdate(${g.id},${g.current})" title="Update">✏️</div>
            <div class="tx-del-btn" onclick="deleteGoal(${g.id})" title="Delete">✕</div>
          </div>
        </div>
        <div class="progress-bar" style="height:8px;margin-bottom:8px;">
          <div class="progress-fill" style="width:${pct}%;background:${g.color||'#00e5a0'};"></div>
        </div>
        <div class="goal-amounts">
          <span>${fmt(g.current)} saved</span>
          <span style="font-weight:700;color:${g.color||'#00e5a0'};">${pct}%</span>
          <span>Target: ${fmt(g.target)}</span>
        </div>
        ${daysLeft !== null ? `
          <div style="font-size:12px;color:var(--tx3);margin-top:6px;">
            ${daysLeft === 0 ? '⚠️ Deadline today!' : `📅 ${daysLeft} days left · ${fmtDate(g.deadline)}`}
          </div>` : ''}
      </div>`;
  }).join(''));
}

function openGoalUpdate(id, current) {
  $('goal-update-id').value     = id;
  $('goal-update-amount').value = current;
  openSheet('goal-update');
}

async function submitGoal() {
  const name    = val('goal-name').trim();
  const target  = parseFloat(val('goal-target'));
  const current = parseFloat(val('goal-current')||0);
  const deadline= val('goal-deadline');
  const color   = val('goal-color');

  if (!name || !target || target <= 0) {
    showToast('Enter goal name and target amount.', 'error'); return;
  }

  try {
    const res  = await fetch(`${API}/goals`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:USER.username, name, target, current, deadline, color })
    });
    const data = await res.json();
    if (data.status === 'success') {
      GOALS.push(data.goal);
      closeSheet('goal');
      $('goal-name').value=''; $('goal-target').value='';
      $('goal-current').value=''; $('goal-deadline').value='';
      showToast(`Goal "${name}" created!`, 'success');
      renderGoals();
    }
  } catch { showToast('Server error.', 'error'); }
}

async function submitGoalUpdate() {
  const id      = parseInt(val('goal-update-id'));
  const current = parseFloat(val('goal-update-amount'));
  if (isNaN(current) || current < 0) { showToast('Enter valid amount.', 'error'); return; }

  try {
    const res  = await fetch(`${API}/goals/${id}`, {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ current })
    });
    const data = await res.json();
    if (data.status === 'updated') {
      const idx = GOALS.findIndex(g=>g.id===id);
      if (idx>=0) GOALS[idx] = data.goal;
      closeSheet('goal-update');
      showToast('Goal progress updated!', 'success');
      renderGoals();
    }
  } catch { showToast('Server error.', 'error'); }
}

async function deleteGoal(id) {
  try {
    await fetch(`${API}/goals/${id}?username=${USER.username}`, { method:'DELETE' });
    GOALS = GOALS.filter(g=>g.id!==id);
    showToast('Goal removed.', 'info');
    renderGoals();
  } catch { showToast('Could not delete.', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════

function pickPeriod(el) {
  qq('#report-period .radio-item').forEach(r=>r.classList.remove('selected'));
  el.classList.add('selected');
  renderReports();
}

function renderReports() {
  const userTx = TRANSACTIONS.filter(t=>t.username===USER.username);
  const months = [];
  const now    = new Date();
  for (let i=5;i>=0;i--) {
    const d = new Date(now.getFullYear(), now.getMonth()-i, 1);
    months.push(`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`);
  }

  const incData = months.map(m=>userTx.filter(t=>t.type==='income'&&monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0));
  const expData = months.map(m=>userTx.filter(t=>t.type!=='income'&&monthKey(t.date)===m).reduce((s,t)=>s+t.amount,0));
  const labels  = months.map(m=>monthLabel(m));

  // bar chart
  const ctx = $('chart-report').getContext('2d');
  if (chartReport) chartReport.destroy();
  chartReport = new Chart(ctx, {
    type:'bar',
    data:{
      labels,
      datasets:[
        { label:'Income',  data:incData, backgroundColor:'rgba(0,229,160,.7)',  borderRadius:6 },
        { label:'Expense', data:expData, backgroundColor:'rgba(255,75,110,.7)', borderRadius:6 }
      ]
    },
    options:{
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ labels:{ color:'#9090b0', font:{family:'DM Sans'} } } },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#55556a', font:{family:'DM Sans',size:10} } },
        y:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#55556a', font:{family:'DM Sans',size:10} }, beginAtZero:true }
      }
    }
  });

  // category bar
  const catMap = {};
  userTx.filter(t=>t.type==='expense').forEach(t=>{ catMap[t.category]=(catMap[t.category]||0)+t.amount; });
  const catSorted = Object.entries(catMap).sort((a,b)=>b[1]-a[1]).slice(0,8);
  const ctx2 = $('chart-cat-bar').getContext('2d');
  if (chartCatBar) chartCatBar.destroy();
  chartCatBar = new Chart(ctx2, {
    type:'bar',
    data:{
      labels: catSorted.map(([k])=>k),
      datasets:[{
        label:'Spending',
        data:  catSorted.map(([,v])=>v),
        backgroundColor: catSorted.map((_,i)=>CAT_COLORS[i%CAT_COLORS.length]+'bb'),
        borderRadius: 6
      }]
    },
    options:{
      indexAxis:'y',
      responsive:true, maintainAspectRatio:false,
      plugins:{ legend:{ display:false } },
      scales:{
        x:{ grid:{ color:'rgba(255,255,255,.04)' }, ticks:{ color:'#55556a', font:{family:'DM Sans',size:10} } },
        y:{ grid:{ display:false }, ticks:{ color:'#9090b0', font:{family:'DM Sans',size:11} } }
      }
    }
  });
}

// ─── PDF GENERATION ───────────────────────────────────────
function generatePDF() {
  const { jsPDF } = window.jspdf;
  const doc  = new jsPDF({ orientation:'p', unit:'mm', format:'a4' });
  const incOn = $('rep-inc').classList.contains('on');
  const expOn = $('rep-exp').classList.contains('on');
  const months = parseInt(q('#report-period .radio-item.selected')?.dataset?.months || '1');

  const now    = new Date();
  const cutoff = new Date(now.getFullYear(), now.getMonth() - months + 1, 1);
  const userTx = TRANSACTIONS
    .filter(t=>t.username===USER.username)
    .filter(t=>new Date(t.date+'T00:00:00') >= cutoff)
    .filter(t=>(t.type==='income'&&incOn)||(t.type!=='income'&&expOn));

  const totalInc = userTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExp = userTx.filter(t=>t.type!=='income').reduce((s,t)=>s+t.amount,0);
  const sym = USER.currency || '₹';

  // Header
  doc.setFillColor(8,8,16); doc.rect(0,0,210,297,'F');
  doc.setFillColor(0,229,160); doc.rect(0,0,210,28,'F');
  doc.setTextColor(0,0,0);
  doc.setFont('helvetica','bold'); doc.setFontSize(18);
  doc.text('SpendWise — Financial Report', 14, 18);

  doc.setTextColor(180,180,180); doc.setFont('helvetica','normal'); doc.setFontSize(10);
  doc.text(`${USER.name || USER.username}  ·  Generated: ${now.toLocaleDateString('en-IN')}  ·  Period: Last ${months} month${months>1?'s':''}`, 14, 36);

  // Summary box
  doc.setFillColor(17,17,32); doc.roundedRect(14, 42, 182, 28, 4, 4, 'F');
  doc.setFontSize(11); doc.setFont('helvetica','bold');
  doc.setTextColor(0,229,160); doc.text(`Income: ${sym}${totalInc.toLocaleString()}`, 22, 53);
  doc.setTextColor(255,75,110); doc.text(`Expenses: ${sym}${totalExp.toLocaleString()}`, 90, 53);
  doc.setTextColor(76,158,255); doc.text(`Net: ${sym}${(totalInc-totalExp).toLocaleString()}`, 158, 53);
  doc.setTextColor(150,150,180); doc.setFont('helvetica','normal'); doc.setFontSize(9);
  doc.text(`${userTx.length} transactions`, 22, 63);

  // Table
  let y = 80;
  const colW = [24,32,46,34,46,16];
  const headers = ['Date','Type','Category','Amount','Note','Rec'];
  doc.setFillColor(30,30,50);
  doc.rect(14, y-5, 182, 9, 'F');
  doc.setTextColor(0,229,160); doc.setFont('helvetica','bold'); doc.setFontSize(8);
  let x = 16;
  headers.forEach((h,i) => { doc.text(h, x, y); x += colW[i]; });
  y += 4;

  doc.setFont('helvetica','normal'); doc.setFontSize(8);
  userTx.sort((a,b)=>new Date(b.date)-new Date(a.date)).forEach((t,i) => {
    if (y > 268) { doc.addPage(); y=20; }
    if (i%2===0) { doc.setFillColor(17,17,32); doc.rect(14,y-4,182,8,'F'); }
    const isInc = t.type==='income';
    doc.setTextColor(isInc ? 0 : 255, isInc ? 229 : 75, isInc ? 160 : 110);
    let x2=16;
    const row = [
      (t.date||'').slice(0,10),
      t.type,
      t.category,
      `${sym}${Number(t.amount).toLocaleString()}`,
      (t.description||'').slice(0,20),
      t.recurring?'✓':''
    ];
    row.forEach((v,i2) => { doc.text(String(v), x2, y); x2+=colW[i2]; });
    y += 8;
  });

  doc.save(`SpendWise_Report_${now.getFullYear()}-${now.getMonth()+1}.pdf`);
  showToast('PDF downloaded!', 'success');
}

// ═══════════════════════════════════════════════════════════
// SETTINGS
// ═══════════════════════════════════════════════════════════

function renderSettings() {
  if (!USER) return;
  $('set-name').value     = USER.name || '';
  $('set-currency').value = USER.currency || '₹';

  const userTx   = TRANSACTIONS.filter(t=>t.username===USER.username);
  const totalInc = userTx.filter(t=>t.type==='income').reduce((s,t)=>s+t.amount,0);
  const totalExp = userTx.filter(t=>t.type!=='income').reduce((s,t)=>s+t.amount,0);

  setHTML('set-stats', `
    <div class="card">
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;text-align:center;">
        <div>
          <div style="font-family:'Sora',sans-serif;font-size:18px;font-weight:800;color:var(--gr);">${fmt(totalInc)}</div>
          <div style="font-size:11px;color:var(--tx3);">Total Income</div>
        </div>
        <div>
          <div style="font-family:'Sora',sans-serif;font-size:18px;font-weight:800;color:var(--rd);">${fmt(totalExp)}</div>
          <div style="font-size:11px;color:var(--tx3);">Total Spent</div>
        </div>
        <div>
          <div style="font-family:'Sora',sans-serif;font-size:18px;font-weight:800;color:var(--bl);">${userTx.length}</div>
          <div style="font-size:11px;color:var(--tx3);">Transactions</div>
        </div>
      </div>
    </div>
  `);
}

async function saveSettings() {
  const name = val('set-name').trim();
  const cur  = val('set-currency');
  if (!name) { showToast('Enter your name.', 'error'); return; }

  try {
    const res  = await fetch(`${API}/user/update`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ username:USER.username, name, currency:cur })
    });
    const data = await res.json();
    if (data.status === 'updated') {
      USER = { ...USER, ...data.user };
      sessionStorage.setItem('sw_user', JSON.stringify(USER));
      updateUserUI();
      showToast('Settings saved!', 'success');
      renderSettings();
    }
  } catch { showToast('Server error.', 'error'); }
}

// ═══════════════════════════════════════════════════════════
// CHART CLEANUP
// ═══════════════════════════════════════════════════════════
function destroyCharts() {
  [chartTrend, chartDonut, chartGauge, chartReport, chartCatBar].forEach(c => {
    if (c) { try { c.destroy(); } catch{} }
  });
  chartTrend=chartDonut=chartGauge=chartReport=chartCatBar=null;
}

// ═══════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', async () => {
  // Hide bottom nav initially
  $('bottom-nav').style.display = 'none';

  // Restore session
  const saved = sessionStorage.getItem('sw_user');
  if (saved) {
    try {
      USER = JSON.parse(saved);
      await loadAll();
      updateUserUI();
      initTxSheet();
      launchApp();
    } catch { showScreen('login'); }
  } else {
    showScreen('login');
  }

  // Init budget month selector lazily
  initBudgetMonths();

  // Keyboard: Enter to login/signup
  $('login-pass').addEventListener('keydown', e => { if(e.key==='Enter') doLogin(); });
  $('signup-pass2').addEventListener('keydown', e => { if(e.key==='Enter') doSignup(); });
});