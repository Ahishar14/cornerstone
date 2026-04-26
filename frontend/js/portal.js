/* ================================================================
   CORNERSTONE SCHOOLS — Parent Portal Script
   ================================================================ */
'use strict';

let portalToken = null;
let portalUser  = null;

const loginWrap  = document.getElementById('portal-login-wrap');
const dashboard  = document.getElementById('portal-dashboard');
const loginForm  = document.getElementById('portal-login-form');
const loginError = document.getElementById('p-login-error');

/* ── Auth ────────────────────────────────────────────────────── */
async function portalLogin(email, password) {
  const res  = await fetch('http://localhost:5000/api/portal/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (res.ok && data.token) {
    portalToken = data.token;
    portalUser  = data.user;
    sessionStorage.setItem('cs_portal_token', portalToken);
    sessionStorage.setItem('cs_portal_user',  JSON.stringify(portalUser));
    showPortalDashboard();
  } else {
    loginError.textContent = data.message || 'Invalid email or password.';
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const btn = loginForm.querySelector('[type="submit"]');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Signing in…';
  portalLogin(
    document.getElementById('p-email').value.trim(),
    document.getElementById('p-password').value
  ).catch(() => { loginError.textContent = 'Network error. Please try again.'; })
   .finally(() => { btn.disabled = false; btn.textContent = orig; });
});

document.getElementById('portal-logout').addEventListener('click', () => {
  sessionStorage.removeItem('cs_portal_token');
  sessionStorage.removeItem('cs_portal_user');
  portalToken = null; portalUser = null;
  dashboard.style.display = 'none';
  loginWrap.style.display = 'flex';
});

function checkStoredPortalAuth() {
  const t = sessionStorage.getItem('cs_portal_token');
  const u = sessionStorage.getItem('cs_portal_user');
  if (t) { portalToken = t; portalUser = u ? JSON.parse(u) : null; showPortalDashboard(); }
}

function showPortalDashboard() {
  loginWrap.style.display = 'none';
  dashboard.style.display = 'block';
  const firstName = portalUser?.name?.split(' ')[0] || 'Parent';
  document.getElementById('portal-greeting-name').textContent = firstName;
  document.getElementById('portal-parent-name').textContent   = portalUser?.name || '—';
  loadPortalData();
}

/* ── API helper ──────────────────────────────────────────────── */
async function portalFetch(path) {
  const res = await fetch(`/api/portal${path}`, {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${portalToken}`,
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('cs_portal_token');
    loginWrap.style.display = 'flex';
    dashboard.style.display = 'none';
    throw new Error('Session expired');
  }
  return res.json();
}

/* ── Load all portal data ────────────────────────────────────── */
async function loadPortalData() {
  await Promise.allSettled([
    loadAnnouncements(),
    loadNotices(),
    loadFees(),
    loadCalendar(),
    loadChildren(),
  ]);
}

/* ── Children ────────────────────────────────────────────────── */
async function loadChildren() {
  try {
    const data  = await portalFetch('/children');
    const wrap  = document.getElementById('portal-child-pills');
    if (!data.children?.length) return;
    wrap.innerHTML = data.children.map(c => `
      <div class="child-pill">
        <span>${c.name}</span>
        <span class="child-pill__class">${c.class_level?.replace(/_/g,' ')}</span>
      </div>`).join('');
  } catch {}
}

/* ── Announcements ───────────────────────────────────────────── */
async function loadAnnouncements() {
  const el = document.getElementById('portal-announcements');
  try {
    const data = await portalFetch('/announcements');
    const items = data.items || [];
    document.getElementById('annc-badge').textContent = items.length;
    if (!items.length) { el.innerHTML = '<div class="portal-loading">No announcements at this time.</div>'; return; }
    el.innerHTML = items.map(a => `
      <div class="annc-item">
        <p class="annc-date">${fmtDate(a.date)}${a.priority === 'high' ? '<span class="annc-priority">Important</span>' : ''}</p>
        <p class="annc-title">${esc(a.title)}</p>
        <p class="annc-body">${esc(a.body)}</p>
      </div>`).join('');
  } catch { el.innerHTML = '<div class="portal-loading">Could not load announcements.</div>'; }
}

/* ── Notices ─────────────────────────────────────────────────── */
async function loadNotices() {
  const el = document.getElementById('portal-notices');
  try {
    const data  = await portalFetch('/notices');
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<div class="portal-loading">No notices.</div>'; return; }
    el.innerHTML = items.map(n => `
      <div class="notice-item">
        <div class="notice-dot" aria-hidden="true"></div>
        <div>
          <p class="notice-text">${esc(n.text)}</p>
          <p class="notice-date">${fmtDate(n.date)}</p>
        </div>
      </div>`).join('');
  } catch { el.innerHTML = '<div class="portal-loading">Could not load notices.</div>'; }
}

/* ── Fees ────────────────────────────────────────────────────── */
async function loadFees() {
  const el = document.getElementById('portal-fees');
  try {
    const data  = await portalFetch('/fees');
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<div class="portal-loading">No fee records.</div>'; return; }
    el.innerHTML = items.map(f => `
      <div class="fee-row">
        <div>
          <p class="fee-child">${esc(f.child_name)}</p>
          <p style="font-size:0.75rem;color:var(--text-muted);margin-top:0.15rem;">${esc(f.term)} · ${esc(f.year)}</p>
        </div>
        <div style="text-align:right;">
          <p class="fee-amount">UGX ${fmtNum(f.amount)}</p>
          <p class="fee-status-${f.status}">${f.status.toUpperCase()}</p>
        </div>
      </div>`).join('');
  } catch { el.innerHTML = '<div class="portal-loading">Could not load fee information.</div>'; }
}

/* ── Calendar ────────────────────────────────────────────────── */
async function loadCalendar() {
  const el = document.getElementById('portal-calendar');
  try {
    const data  = await portalFetch('/calendar');
    const items = data.items || [];
    if (!items.length) { el.innerHTML = '<div class="portal-loading">No upcoming dates.</div>'; return; }
    el.innerHTML = items.map(e => {
      const d = new Date(e.date);
      return `
        <div class="cal-row">
          <div class="cal-date">
            <p class="cal-day">${d.getDate()}</p>
            <p class="cal-month">${d.toLocaleString('en-GB',{month:'short'})}</p>
          </div>
          <div>
            <p class="cal-event">${esc(e.event)}</p>
            <p class="cal-sub">${esc(e.note || '')}</p>
          </div>
        </div>`;
    }).join('');
  } catch { el.innerHTML = '<div class="portal-loading">Could not load calendar.</div>'; }
}

/* --- PASSWORD VISIBILITY TOGGLE --- */
document.addEventListener('DOMContentLoaded', () => {
  const toggleBtn = document.getElementById('toggle-password');
  const passwordInput = document.getElementById('login-password');

  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      // Switch type between password and text
      const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
      passwordInput.setAttribute('type', type);
      
      // Update button text
      toggleBtn.textContent = type === 'password' ? 'Show' : 'Hide';
    });
  }
});

/* ── Utilities ───────────────────────────────────────────────── */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});
}
function fmtNum(n) { return new Intl.NumberFormat('en-UG').format(Number(n)); }

/* ── Boot ────────────────────────────────────────────────────── */
checkStoredPortalAuth();
