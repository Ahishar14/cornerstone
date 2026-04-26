/* ================================================================
  CORNERSTONE SCHOOLS — Admin Dashboard Script
   ================================================================ */
'use strict';

// const API = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
//   ? '/api/admin'
//   : '/api/admin';
  const API = '/api/admin';

// const API = '/api/admin';
let authToken  = null;
let adminUser  = null;
let currentAdmissionId = null;

// ── Page-size constant ────────────────────────────────────────
const PAGE_SIZE = 20;

/* ================================================================
  AUTH
   ================================================================ */
const loginOverlay = document.getElementById('login-overlay');
const loginForm    = document.getElementById('login-form');
const loginError   = document.getElementById('login-error');

async function tryLogin(email, password) {
  try {
    const res  = await fetch('/api/admin/login', {
    // const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();

    if (res.ok && data.token) {
      authToken = data.token;
      adminUser = data.user;
      sessionStorage.setItem('cs_admin_token', authToken);
      sessionStorage.setItem('cs_admin_user',  JSON.stringify(adminUser));
      showDashboard();
    } else {
      loginError.textContent = data.message || 'Invalid credentials.';
    }
  } catch {
    loginError.textContent = 'Network error. Please try again.';
  }
}

loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  loginError.textContent = '';
  const btn  = loginForm.querySelector('[type="submit"]');
  const orig = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Signing in…';
  tryLogin(
    document.getElementById('login-email').value.trim(),
    document.getElementById('login-password').value
  ).finally(() => {
    btn.disabled = false;
    btn.textContent = orig;
  });
});

function checkStoredAuth() {
  const stored      = sessionStorage.getItem('cs_admin_token');
  const storedUser  = sessionStorage.getItem('cs_admin_user');
  if (stored) {
    authToken = stored;
    adminUser = storedUser ? JSON.parse(storedUser) : null;
    showDashboard();
  }
}

function showDashboard() {
  loginOverlay.style.display  = 'none';
  document.getElementById('topbar-user').textContent = adminUser?.email || 'Admin';
  loadDashboard();
}

document.getElementById('admin-logout').addEventListener('click', () => {
  sessionStorage.removeItem('cs_admin_token');
  sessionStorage.removeItem('cs_admin_user');
  authToken = null;
  adminUser = null;
  loginOverlay.style.display = 'flex';
  document.getElementById('login-email').value = '';
  document.getElementById('login-password').value = '';
});

/* ================================================================
  NAVIGATION
   ================================================================ */
const navItems = document.querySelectorAll('.admin-nav__item[data-panel]');
const panels   = document.querySelectorAll('.admin-panel');
const panelTitle = document.getElementById('panel-title');
const titleMap = {
  dashboard: 'Dashboard', admissions: 'Admissions Enquiries',
  contacts: 'Contact Messages', donations: 'Donations', sms: 'Send SMS',
};

navItems.forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    const panelId = item.dataset.panel;
    navItems.forEach(n => n.classList.remove('active'));
    panels.forEach(p => p.classList.remove('active'));
    item.classList.add('active');
    document.getElementById(`panel-${panelId}`).classList.add('active');
    panelTitle.textContent = titleMap[panelId] || panelId;

    if (panelId === 'admissions') loadAdmissions();
    if (panelId === 'contacts')   loadContacts();
    if (panelId === 'donations')  loadDonations();
    if (panelId === 'dashboard')  loadDashboard();

    // Close sidebar on mobile after nav
    if (window.innerWidth < 900) {
      document.getElementById('admin-sidebar').classList.remove('open');
    }
  });
});

// Sidebar mobile toggle
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('admin-sidebar').classList.toggle('open');
});

/* ================================================================
  API HELPER
   ================================================================ */
async function apiFetch(path, opts = {}) {
  const res = await fetch(`/api/admin${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authToken}`,
      ...opts.headers,
    },
  });
  if (res.status === 401) {
    sessionStorage.removeItem('cs_admin_token');
    loginOverlay.style.display = 'flex';
    throw new Error('Session expired');
  }
  return res.json();
}

/* ================================================================
  DASHBOARD
   ================================================================ */
async function loadDashboard() {
  try {
    const data = await apiFetch('/stats');
    document.getElementById('stat-admissions').textContent    = data.new_admissions  ?? '—';
    document.getElementById('stat-contacts').textContent      = data.total_contacts  ?? '—';
    document.getElementById('stat-donations').textContent     = data.completed_donations ?? '—';
    document.getElementById('stat-donation-total').textContent =
      data.donation_total_ugx ? formatUGX(data.donation_total_ugx) : '—';

    // Badges
    setBadge('badge-admissions', data.new_admissions);
    setBadge('badge-contacts',   data.total_contacts);

    // Recent tables
    renderAdmissionsRows(document.getElementById('dash-admissions-body'), data.recent_admissions || [], true);
    renderDonationRows(document.getElementById('dash-donations-body'), data.recent_donations || [], true);
  } catch { /* handled by apiFetch */ }
}

function setBadge(id, count) {
  const el = document.getElementById(id);
  if (!el) return;
  if (count > 0) { el.textContent = count; el.classList.add('visible'); }
  else el.classList.remove('visible');
}

function formatUGX(n) {
  return new Intl.NumberFormat('en-UG').format(Math.round(n));
}

function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

/* ================================================================
   ADMISSIONS
   ================================================================ */
let admissionsPage   = 1;
let admissionsSearch = '';
let admissionsStatus = '';

async function loadAdmissions(page = 1) {
  admissionsPage = page;
  const tbody = document.getElementById('admissions-body');
  tbody.innerHTML = `<tr><td colspan="10" class="admin-table-empty">Loading…</td></tr>`;
  try {
    const params = new URLSearchParams({ page, limit: PAGE_SIZE, search: admissionsSearch, status: admissionsStatus });
    const data = await apiFetch(`/admissions?${params}`);
    renderAdmissionsRows(tbody, data.rows || [], false);
    renderPagination('admissions-pagination', data.total || 0, page, loadAdmissions);
  } catch { tbody.innerHTML = `<tr><td colspan="10" class="admin-table-empty">Error loading data.</td></tr>`; }
}

function renderAdmissionsRows(tbody, rows, compact) {
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${compact ? 6 : 10}" class="admin-table-empty">No enquiries found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      <td>${esc(r.child_first_name)} ${esc(r.child_last_name)}</td>
      ${!compact ? `<td>${esc(r.child_dob)}</td>` : ''}
      <td>${esc(r.applying_class?.replace(/_/g,' '))}</td>
      <td>${esc(r.parent_first_name)} ${esc(r.parent_last_name)}</td>
      <td>${esc(r.email)}</td>
      ${!compact ? `<td>${esc(r.phone)}</td><td>${esc(r.intake || '—')}</td>` : ''}
      <td>${fmtDate(r.created_at)}</td>
      <td><span class="status-chip status-${r.status}">${r.status}</span></td>
      ${!compact ? `<td><button class="admin-action-link" onclick="openModal(${r.id})">View</button></td>` : ''}
    </tr>`).join('');
}

// Debounced search
let admissionSearchTimer;
document.getElementById('admissions-search').addEventListener('input', (e) => {
  clearTimeout(admissionSearchTimer);
  admissionsSearch = e.target.value;
  admissionSearchTimer = setTimeout(() => loadAdmissions(1), 350);
});
document.getElementById('admissions-status-filter').addEventListener('change', (e) => {
  admissionsStatus = e.target.value;
  loadAdmissions(1);
});

/* ================================================================
   CONTACTS
   ================================================================ */
let contactsPage   = 1;
let contactsSearch = '';

async function loadContacts(page = 1) {
  contactsPage = page;
  const tbody = document.getElementById('contacts-body');
  tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">Loading…</td></tr>`;
  try {
    const params = new URLSearchParams({ page, limit: PAGE_SIZE, search: contactsSearch });
    const data = await apiFetch(`/contacts?${params}`);
    if (!data.rows?.length) {
      tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">No messages found.</td></tr>`;
      return;
    }
    tbody.innerHTML = data.rows.map(r => `
      <tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.email)}</td>
        <td>${esc(r.phone || '—')}</td>
        <td>${esc(r.subject)}</td>
        <td title="${esc(r.message)}">${esc(r.message.substring(0,60))}${r.message.length > 60 ? '…' : ''}</td>
        <td>${fmtDate(r.created_at)}</td>
      </tr>`).join('');
    renderPagination('contacts-pagination', data.total || 0, page, loadContacts);
  } catch { tbody.innerHTML = `<tr><td colspan="6" class="admin-table-empty">Error loading data.</td></tr>`; }
}

let contactSearchTimer;
document.getElementById('contacts-search').addEventListener('input', (e) => {
  clearTimeout(contactSearchTimer);
  contactsSearch = e.target.value;
  contactSearchTimer = setTimeout(() => loadContacts(1), 350);
});

/* ================================================================
   DONATIONS
   ================================================================ */
let donationsPage   = 1;
let donationsSearch = '';
let donationsStatus = '';

async function loadDonations(page = 1) {
  donationsPage = page;
  const tbody = document.getElementById('donations-body');
  tbody.innerHTML = `<tr><td colspan="10" class="admin-table-empty">Loading…</td></tr>`;
  try {
    const params = new URLSearchParams({ page, limit: PAGE_SIZE, search: donationsSearch, status: donationsStatus });
    const data = await apiFetch(`/donations?${params}`);
    renderDonationRows(tbody, data.rows || [], false);
    renderPagination('donations-pagination', data.total || 0, page, loadDonations);
  } catch { tbody.innerHTML = `<tr><td colspan="10" class="admin-table-empty">Error loading data.</td></tr>`; }
}

function renderDonationRows(tbody, rows, compact) {
  if (!rows.length) {
    tbody.innerHTML = `<tr><td colspan="${compact ? 7 : 10}" class="admin-table-empty">No donations found.</td></tr>`;
    return;
  }
  tbody.innerHTML = rows.map(r => `
    <tr>
      ${!compact ? `<td style="font-size:0.75rem;">${esc(r.tx_ref)}</td>` : ''}
      <td>${r.anonymous ? '<em style="color:var(--text-muted)">Anonymous</em>' : `${esc(r.first_name)} ${esc(r.last_name)}`}</td>
      ${!compact ? `<td>${r.anonymous ? '—' : esc(r.email)}</td>` : ''}
      <td><strong>${esc(r.currency)} ${formatUGX(r.amount)}</strong></td>
      <td>${esc(r.currency)}</td>
      <td>${esc(r.designation)}</td>
      ${!compact ? `<td>${esc(r.payment_method?.replace(/_/g,' '))}</td>` : ''}
      ${!compact ? `<td>${r.anonymous ? '✓' : '—'}</td>` : ''}
      <td>${fmtDate(r.created_at)}</td>
      <td><span class="status-chip status-${r.status}">${r.status}</span></td>
    </tr>`).join('');
}

let donationSearchTimer;
document.getElementById('donations-search').addEventListener('input', (e) => {
  clearTimeout(donationSearchTimer);
  donationsSearch = e.target.value;
  donationSearchTimer = setTimeout(() => loadDonations(1), 350);
});
document.getElementById('donations-status-filter').addEventListener('change', (e) => {
  donationsStatus = e.target.value;
  loadDonations(1);
});

/* ================================================================
   PAGINATION
   ================================================================ */
function renderPagination(containerId, total, currentPage, loadFn) {
  const container  = document.getElementById(containerId);
  const totalPages = Math.ceil(total / PAGE_SIZE);
  if (totalPages <= 1) { container.innerHTML = ''; return; }

  let html = '';
  if (currentPage > 1) html += `<button class="admin-page-btn" onclick="${loadFn.name}(${currentPage-1})">‹</button>`;
  for (let p = 1; p <= totalPages; p++) {
    if (p === 1 || p === totalPages || Math.abs(p - currentPage) <= 2) {
      html += `<button class="admin-page-btn${p===currentPage?' active':''}" onclick="${loadFn.name}(${p})">${p}</button>`;
    } else if (Math.abs(p - currentPage) === 3) {
      html += `<span style="padding:0.4rem 0.5rem;color:var(--text-muted);">…</span>`;
    }
  }
  if (currentPage < totalPages) html += `<button class="admin-page-btn" onclick="${loadFn.name}(${currentPage+1})">›</button>`;
  container.innerHTML = html;
}

/* ================================================================
   MODAL — Admission detail + status update
   ================================================================ */
const modalOverlay = document.getElementById('modal-overlay');
const modalBody    = document.getElementById('modal-body');
const modalClose   = document.getElementById('modal-close');
const modalMsg     = document.getElementById('modal-status-msg');

function openModal(id) {
  currentAdmissionId = id;
  modalMsg.textContent = '';
  modalBody.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:2rem;">Loading…</p>';
  modalOverlay.classList.add('open');
  modalOverlay.setAttribute('aria-hidden', 'false');

  apiFetch(`/admissions/${id}`).then(data => {
    if (!data) return;
    const r = data;
    modalBody.innerHTML = `
      <div class="modal-field"><span class="modal-field__label">Child</span><span>${esc(r.child_first_name)} ${esc(r.child_last_name)}</span></div>
      <div class="modal-field"><span class="modal-field__label">Date of Birth</span><span>${esc(r.child_dob)}</span></div>
      <div class="modal-field"><span class="modal-field__label">Applying For</span><span>${esc(r.applying_class?.replace(/_/g,' '))}</span></div>
      <div class="modal-field"><span class="modal-field__label">Preferred Intake</span><span>${esc(r.intake || '—')}</span></div>
      <div class="modal-field"><span class="modal-field__label">Parent</span><span>${esc(r.parent_first_name)} ${esc(r.parent_last_name)}</span></div>
      <div class="modal-field"><span class="modal-field__label">Email</span><span>${esc(r.email)}</span></div>
      <div class="modal-field"><span class="modal-field__label">Phone</span><span>${esc(r.phone)}</span></div>
      <div class="modal-field"><span class="modal-field__label">Status</span><span><span class="status-chip status-${r.status}">${r.status}</span></span></div>
      <div class="modal-field"><span class="modal-field__label">Submitted</span><span>${fmtDate(r.created_at)}</span></div>
      ${r.message ? `<div class="modal-field"><span class="modal-field__label">Notes</span><span>${esc(r.message)}</span></div>` : ''}
    `;
  }).catch(() => { modalBody.innerHTML = '<p style="color:#991b1b;">Could not load details.</p>'; });
}

modalClose.addEventListener('click', () => {
  modalOverlay.classList.remove('open');
  modalOverlay.setAttribute('aria-hidden', 'true');
});
modalOverlay.addEventListener('click', (e) => {
  if (e.target === modalOverlay) { modalOverlay.classList.remove('open'); modalOverlay.setAttribute('aria-hidden', 'true'); }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && modalOverlay.classList.contains('open')) { modalOverlay.classList.remove('open'); }
});

// Status update buttons
document.querySelectorAll('.admin-status-btn').forEach(btn => {
  btn.addEventListener('click', async () => {
    if (!currentAdmissionId) return;
    try {
      const data = await apiFetch(`/admissions/${currentAdmissionId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: btn.dataset.status }),
      });
      if (data.success) {
        modalMsg.textContent = `Status updated to "${btn.dataset.status}"`;
        modalMsg.style.color = '#166534';
        if (admissionsPage) loadAdmissions(admissionsPage);
        loadDashboard();
      } else {
        modalMsg.textContent = data.message || 'Update failed.';
        modalMsg.style.color = '#991b1b';
      }
    } catch { modalMsg.textContent = 'Network error.'; }
  });
});

/* ================================================================
   SMS
   ================================================================ */
const smsMsg       = document.getElementById('sms-message');
const smsCharCount = document.getElementById('sms-char-count');
const smsPreview   = document.getElementById('sms-preview');
const smsPreviewTxt = document.getElementById('sms-preview-text');
const smsResult    = document.getElementById('sms-result');

smsMsg.addEventListener('input', () => {
  const len = smsMsg.value.length;
  smsCharCount.textContent = `${len} / 160${len > 160 ? ` (${Math.ceil(len/160)} parts)` : ''}`;
  smsCharCount.style.color = len > 160 ? '#c2410c' : '';
});

document.getElementById('sms-recipient-group').addEventListener('change', (e) => {
  document.getElementById('sms-custom-wrap').style.display = e.target.value === 'custom' ? 'flex' : 'none';
});

document.getElementById('sms-preview-btn').addEventListener('click', () => {
  if (!smsMsg.value.trim()) return;
  smsPreviewTxt.textContent = smsMsg.value;
  smsPreview.style.display  = 'block';
});

document.getElementById('sms-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn  = document.getElementById('sms-send-btn');
  const orig = btn.textContent;
  btn.disabled = true; btn.textContent = 'Sending…';
  smsResult.textContent = '';

  const payload = {
    recipient_group: document.getElementById('sms-recipient-group').value,
    custom_numbers:  document.getElementById('sms-custom-numbers').value,
    message:         smsMsg.value.trim(),
    sender_id:       document.querySelector('[name="sender_id"]').value,
  };

  try {
    const data = await apiFetch('/sms/send', { method: 'POST', body: JSON.stringify(payload) });
    if (data.success) {
      smsResult.innerHTML = `<p style="color:#166534;font-size:0.88rem;margin-top:0.5rem;">✓ SMS sent to ${data.sent} recipients. ${data.failed > 0 ? `${data.failed} failed.` : ''}</p>`;
      smsMsg.value = ''; smsCharCount.textContent = '0 / 160';
      smsPreview.style.display = 'none';
      loadSmsLog();
    } else {
      smsResult.innerHTML = `<p style="color:#991b1b;font-size:0.88rem;margin-top:0.5rem;">${data.message || 'SMS send failed.'}</p>`;
    }
  } catch {
    smsResult.innerHTML = `<p style="color:#991b1b;font-size:0.88rem;margin-top:0.5rem;">Network error. Please try again.</p>`;
  } finally {
    btn.disabled = false; btn.textContent = orig;
  }
});

async function loadSmsLog() {
  const log = document.getElementById('sms-log');
  try {
    const data = await apiFetch('/sms/log');
    if (!data.rows?.length) { log.textContent = 'No logs yet.'; return; }
    log.innerHTML = data.rows.map(r => `
      <div style="padding:0.6rem 0;border-bottom:1px solid var(--border);font-size:0.8rem;">
        <span style="color:var(--text-muted);">${fmtDate(r.sent_at)}</span>
        &nbsp;·&nbsp; <strong>${r.recipient_count} recipients</strong>
        &nbsp;·&nbsp; ${esc(r.message.substring(0,60))}${r.message.length>60?'…':''}
      </div>`).join('');
  } catch { log.textContent = 'Could not load log.'; }
}

/* ================================================================
   CSV EXPORT
   ================================================================ */
function downloadCSV(filename, headers, rows) {
  const escape = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv    = [headers.map(escape).join(','), ...rows.map(r => r.map(escape).join(','))].join('\n');
  const blob   = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url    = URL.createObjectURL(blob);
  const a      = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

document.getElementById('export-admissions').addEventListener('click', async () => {
  const data = await apiFetch('/admissions?limit=10000');
  downloadCSV('admissions.csv',
    ['Child First','Child Last','DOB','Class','Parent First','Parent Last','Email','Phone','Intake','Status','Date'],
    (data.rows||[]).map(r => [r.child_first_name,r.child_last_name,r.child_dob,r.applying_class,r.parent_first_name,r.parent_last_name,r.email,r.phone,r.intake,r.status,r.created_at])
  );
});

document.getElementById('export-contacts').addEventListener('click', async () => {
  const data = await apiFetch('/contacts?limit=10000');
  downloadCSV('contacts.csv',
    ['Name','Email','Phone','Subject','Message','Date'],
    (data.rows||[]).map(r => [r.name,r.email,r.phone,r.subject,r.message,r.created_at])
  );
});

document.getElementById('export-donations').addEventListener('click', async () => {
  const data = await apiFetch('/donations?limit=10000');
  downloadCSV('donations.csv',
    ['Reference','First Name','Last Name','Email','Amount','Currency','Designation','Method','Anonymous','Status','Date'],
    (data.rows||[]).map(r => [r.tx_ref,r.first_name,r.last_name,r.email,r.amount,r.currency,r.designation,r.payment_method,r.anonymous?'Yes':'No',r.status,r.created_at])
  );
});

/* ================================================================
   UTILITY
   ================================================================ */
function esc(str) {
  return String(str ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/* ================================================================
   BOOT
   ================================================================ */
checkStoredAuth();

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

/* ================================================================
  PASSWORD CHANGE LOGIC
   ================================================================ */
const passwordForm = document.getElementById('password-change-form');
const passwordMsg  = document.getElementById('password-message');

if (passwordForm) {
  passwordForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    passwordMsg.textContent = '';
    
    const currentPassword = document.getElementById('current-password').value;
    const newPassword     = document.getElementById('new-password').value;
    const confirmPassword = document.getElementById('confirm-password').value;

    if (newPassword !== confirmPassword) {
      passwordMsg.innerHTML = '<span style="color:red;">New passwords do not match.</span>';
      return;
    }

    try {
      // Using the apiFetch helper we updated earlier
      const res = await fetch('/api/admin/update-password', {
        method: 'PATCH',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}` 
        },
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      const data = await res.json();

      if (res.ok) {
        passwordMsg.innerHTML = '<span style="color:green;">Password updated successfully!</span>';
        passwordForm.reset();
      } else {
        passwordMsg.innerHTML = `<span style="color:red;">${data.message || 'Update failed.'}</span>`;
      }
    } catch (err) {
      passwordMsg.innerHTML = '<span style="color:red;">Server connection error.</span>';
    }
  });
}
