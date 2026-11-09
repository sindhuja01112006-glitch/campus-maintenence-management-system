const app = document.querySelector('#app');

let state = {
  token: localStorage.token || '',
  user: null,
  requests: [],
  notifications: [],
  unreadCount: 0,
  showNotifs: false,
  notifTimer: null,
  // Filters & search
  statusFilter: 'all',
  categoryFilter: 'all',
  searchQuery: ''
};

const api = async (url, options = {}) => {
  const res = await fetch('/api' + url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: 'Bearer ' + state.token } : {}),
      ...(options.headers || {})
    }
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
};

const esc = s => String(s || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function showToast(msg, type = 'success') {
  let container = document.querySelector('.toast-container');
  if (!container) {
    container = document.createElement('div');
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.innerHTML = `<span>${type === 'success' ? '✅' : 'ℹ️'}</span> <span>${esc(msg)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    toast.style.transition = 'all 0.2s';
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

const categoryIcons = {
  Electrical: '⚡',
  Plumbing: '🚰',
  Furniture: '🪑',
  HVAC: '❄️',
  Cleaning: '🧹',
  General: '📌',
  Other: '🔧'
};

function timeAgo(dateStr) {
  if (!dateStr) return '';
  const seconds = Math.floor((new Date() - new Date(dateStr)) / 1000);
  if (seconds < 60) return 'Just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(dateStr).toLocaleDateString();
}

async function loadNotifications() {
  if (!state.user) return;
  try {
    const data = await api('/notifications');
    const prevUnread = state.unreadCount;
    state.notifications = data.notifications || [];
    state.unreadCount = data.unreadCount || 0;
    
    // Play alert toast if new unread notification arrived
    if (state.unreadCount > prevUnread && prevUnread !== 0) {
      showToast('New resolution alert received!', 'info');
    }
    
    updateNotifBadge();
    if (state.showNotifs) renderNotifDrawer();
  } catch (err) {
    console.warn('Notification poll:', err.message);
  }
}

function updateNotifBadge() {
  const badgeEl = document.querySelector('#notif-badge');
  if (!badgeEl) return;
  if (state.unreadCount > 0) {
    badgeEl.textContent = state.unreadCount;
    badgeEl.style.display = 'grid';
  } else {
    badgeEl.style.display = 'none';
  }
}

function renderNotifDrawer() {
  const container = document.querySelector('#notif-container');
  if (!container) return;
  if (!state.showNotifs) {
    container.innerHTML = '';
    return;
  }

  container.innerHTML = `
    <div class="notif-drawer">
      <div class="notif-head">
        <h3>Resolution Alerts</h3>
        ${state.unreadCount > 0 ? '<button onclick="markAllNotificationsRead()">Mark all as read</button>' : ''}
      </div>
      <div class="notif-list">
        ${
          state.notifications.length === 0
            ? '<div class="notif-empty">No new notifications. You are all caught up!</div>'
            : state.notifications.map(n => `
                <div class="notif-item ${n.read ? '' : 'unread'}" onclick="handleNotifClick(${n.id}, ${n.request_id || 'null'})">
                  <div class="notif-icon">${n.type === 'resolved' ? '✅' : n.type === 'assigned' ? '🛠️' : '🔔'}</div>
                  <div class="notif-content">
                    <div class="notif-title">${esc(n.title)}</div>
                    <div class="notif-msg">${esc(n.message)}</div>
                    <div class="notif-time">${timeAgo(n.created_at)}</div>
                  </div>
                </div>
              `).join('')
        }
      </div>
    </div>
  `;
}

window.toggleNotifs = e => {
  if (e) e.stopPropagation();
  state.showNotifs = !state.showNotifs;
  renderNotifDrawer();
};

window.markAllNotificationsRead = async () => {
  try {
    await api('/notifications/read-all', { method: 'POST', body: JSON.stringify({ username: state.user.username }) });
    state.unreadCount = 0;
    state.notifications.forEach(n => { n.read = true; });
    updateNotifBadge();
    renderNotifDrawer();
    showToast('All notifications marked as read');
  } catch (e) {
    console.error(e);
  }
};

window.handleNotifClick = async (notifId, requestId) => {
  try {
    await api(`/notifications/${notifId}/read`, { method: 'POST' });
    const n = state.notifications.find(x => x.id === notifId);
    if (n && !n.read) {
      n.read = true;
      state.unreadCount = Math.max(0, state.unreadCount - 1);
      updateNotifBadge();
      renderNotifDrawer();
    }
  } catch (e) {
    console.error(e);
  }
};

document.addEventListener('click', e => {
  if (state.showNotifs && !e.target.closest('#notif-widget')) {
    state.showNotifs = false;
    renderNotifDrawer();
  }
});

// QUICK LOGIN DEMO HELPER
window.quickLogin = (username, password) => {
  document.querySelector('#username_input').value = username;
  document.querySelector('#password_input').value = password;
  document.querySelector('#loginform').dispatchEvent(new Event('submit'));
};

function loginView(error = '') {
  if (state.notifTimer) clearInterval(state.notifTimer);
  app.innerHTML = `
    <section class="login">
      <div class="hero">
        <div class="brand">
          Fix<span>Point</span>
          <span class="brand-badge">Campus Ops</span>
        </div>
        <div class="hero-content">
          <h1>Effortless campus maintenance, <span>resolved in clicks.</span></h1>
          <p>Instant complaint tracking, camera photo attachments, automated repair assignments, and real-time resolution alerts for students and staff.</p>
          <div class="facts">
            <div class="fact-item">
              <b>100%</b>
              <small>Digital workflow</small>
            </div>
            <div class="fact-item">
              <b>Live</b>
              <small>Resolution alerts</small>
            </div>
            <div class="fact-item">
              <b>4 Roles</b>
              <small>Unified ecosystem</small>
            </div>
          </div>
        </div>
        <div style="font-size: 13px; color: #94a3b8">
          Campus Maintenance Management System &copy; 2026
        </div>
      </div>
      
      <div class="signbox-wrap">
        <div class="signbox">
          <h2>Welcome back</h2>
          <p class="sub">Sign in to manage and report maintenance issues.</p>
          
          <form id="loginform">
            <div class="field">
              <label>Username</label>
              <input id="username_input" name="username" required placeholder="Enter username (e.g. student1, admin)">
            </div>
            <div class="field">
              <label>Password</label>
              <input id="password_input" name="password" type="password" required placeholder="Enter password">
            </div>
            ${error ? `<p style="color:#ef4444; font-size:13px; font-weight:600; margin-bottom:12px">⚠️ ${esc(error)}</p>` : ''}
            <button class="primary" id="login_btn">Sign in to Portal →</button>
          </form>

          <div class="demo-title">Quick 1-Click Demo Accounts</div>
          <div class="quick-roles">
            <button type="button" class="role-chip" onclick="quickLogin('student1', 'pass')">
              <span>👨‍🎓</span> <b>Student</b>
            </button>
            <button type="button" class="role-chip" onclick="quickLogin('faculty1', 'pass')">
              <span>👩‍🏫</span> <b>Faculty</b>
            </button>
            <button type="button" class="role-chip" onclick="quickLogin('maint1', 'pass')">
              <span>🛠️</span> <b>Staff: Ravi</b>
            </button>
            <button type="button" class="role-chip" onclick="quickLogin('maint2', 'pass')">
              <span>🔧</span> <b>Staff: Priya</b>
            </button>
            <button type="button" class="role-chip" onclick="quickLogin('admin', 'adminpass')">
              <span>⚡</span> <b>Admin</b>
            </button>
          </div>
        </div>
      </div>
    </section>
  `;

  document.querySelector('#loginform').onsubmit = async e => {
    e.preventDefault();
    const btn = document.querySelector('#login_btn');
    btn.innerHTML = 'Signing in...';
    btn.disabled = true;
    const f = new FormData(e.target);
    try {
      const d = await api('/login', { method: 'POST', body: JSON.stringify(Object.fromEntries(f)) });
      localStorage.token = d.token;
      localStorage.userRole = d.user.role;

      // Redirect each role to their dedicated portal
      const rolePortal = {
        admin: '/admin.html',
        student: '/student.html',
        faculty: '/faculty.html',
        maintenance: '/maintenance.html'
      };
      const dest = rolePortal[d.user.role] || '/';
      window.location.href = dest;
    } catch (err) {
      loginView(err.message);
    }
  };
}

function shell(body) {
  const role = state.user.role;
  app.innerHTML = `
    <div class="shell">
      <aside class="side">
        <div class="brand">
          Fix<span>Point</span>
        </div>
        
        <div class="side-label">Navigation</div>
        <button class="navitem active" onclick="resetFilters()">📊 Dashboard</button>
        ${['student', 'faculty'].includes(role) ? '<button class="navitem" id="newnav">➕ Report Issue</button>' : ''}
        
        <button class="logout" id="logout">🚪 Sign out</button>
      </aside>
      
      <main class="content">
        <div class="top">
          <div>
            <h1>Good day, ${esc(state.user.name.split(' ')[0])} 👋</h1>
            <p>${
              role === 'admin'
                ? 'Campus maintenance operations control center.'
                : role === 'maintenance'
                ? 'Your active work orders and inspection queue.'
                : 'Report campus issues, attach photos, and track resolution status.'
            }</p>
          </div>
          
          <div class="user-controls" id="notif-widget">
            <button class="notif-btn" onclick="toggleNotifs(event)" title="Notifications">
              🔔
              <span class="notif-badge" id="notif-badge" style="display:${state.unreadCount > 0 ? 'grid' : 'none'}">${state.unreadCount}</span>
            </button>
            <div id="notif-container"></div>
            
            <div class="avatar-badge">
              <div class="avatar">${esc(state.user.name.split(' ').map(x => x[0]).join('').slice(0, 2))}</div>
              <div class="avatar-info">
                <span class="avatar-name">${esc(state.user.name)}</span>
                <span class="avatar-role">${role}</span>
              </div>
            </div>
          </div>
        </div>
        ${body}
      </main>
    </div>
  `;

  document.querySelector('#logout').onclick = async () => {
    try { await api('/logout', { method: 'POST' }); }
    finally {
      if (state.notifTimer) clearInterval(state.notifTimer);
      localStorage.removeItem('token');
      state = { token: '', user: null, requests: [], notifications: [], unreadCount: 0, showNotifs: false, notifTimer: null, statusFilter: 'all', categoryFilter: 'all', searchQuery: '' };
      loginView();
    }
  };

  document.querySelector('#newnav')?.addEventListener('click', requestModal);
}

function cards(rows) {
  const openCount = rows.filter(r => r.status === 'Open').length;
  const inProgCount = rows.filter(r => r.status === 'In Progress').length;
  const closedCount = rows.filter(r => r.status === 'Closed').length;

  return `
    <section class="cards">
      <div class="card card-total ${state.statusFilter === 'all' ? 'active' : ''}" onclick="setStatusFilter('all')">
        <div class="card-head">
          <span class="label">Total Complaints</span>
          <span class="icon-chip">📋</span>
        </div>
        <div class="num">${rows.length}</div>
        <div class="hint">Click to show all</div>
      </div>
      
      <div class="card card-open ${state.statusFilter === 'Open' ? 'active' : ''}" onclick="setStatusFilter('Open')">
        <div class="card-head">
          <span class="label">Open / Pending</span>
          <span class="icon-chip">⏳</span>
        </div>
        <div class="num">${openCount}</div>
        <div class="hint">Click to filter open</div>
      </div>
      
      <div class="card card-prog ${state.statusFilter === 'In Progress' ? 'active' : ''}" onclick="setStatusFilter('In Progress')">
        <div class="card-head">
          <span class="label">In Progress</span>
          <span class="icon-chip">⚡</span>
        </div>
        <div class="num">${inProgCount}</div>
        <div class="hint">Click to filter active</div>
      </div>
      
      <div class="card card-closed ${state.statusFilter === 'Closed' ? 'active' : ''}" onclick="setStatusFilter('Closed')">
        <div class="card-head">
          <span class="label">Resolved & Closed</span>
          <span class="icon-chip">✅</span>
        </div>
        <div class="num">${closedCount}</div>
        <div class="hint">Click to filter resolved</div>
      </div>
    </section>
  `;
}

function filterRows(rows) {
  return rows.filter(r => {
    // Status filter
    if (state.statusFilter !== 'all' && r.status !== state.statusFilter) return false;
    // Category filter
    if (state.categoryFilter !== 'all' && r.category !== state.categoryFilter) return false;
    // Search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase();
      const matchTitle = (r.title || '').toLowerCase().includes(q);
      const matchLoc = (r.location || '').toLowerCase().includes(q);
      const matchReq = (r.requester || '').toLowerCase().includes(q);
      const matchDesc = (r.description || '').toLowerCase().includes(q);
      if (!matchTitle && !matchLoc && !matchReq && !matchDesc) return false;
    }
    return true;
  });
}

function table(rows) {
  const filtered = filterRows(rows);

  return `
    <div class="filter-bar">
      <div class="search-box">
        <span>🔍</span>
        <input id="search_input" placeholder="Search by title, location, requester..." value="${esc(state.searchQuery)}" oninput="handleSearch(this.value)">
      </div>
      
      <div class="filter-chips">
        <button class="chip-btn ${state.statusFilter === 'all' ? 'active' : ''}" onclick="setStatusFilter('all')">All Status</button>
        <button class="chip-btn ${state.statusFilter === 'Open' ? 'active' : ''}" onclick="setStatusFilter('Open')">Open</button>
        <button class="chip-btn ${state.statusFilter === 'In Progress' ? 'active' : ''}" onclick="setStatusFilter('In Progress')">In Progress</button>
        <button class="chip-btn ${state.statusFilter === 'Closed' ? 'active' : ''}" onclick="setStatusFilter('Closed')">Resolved</button>
        
        <select class="category-filter" onchange="handleCategoryFilter(this.value)">
          <option value="all">All Categories</option>
          ${['Electrical', 'Plumbing', 'Furniture', 'HVAC', 'Cleaning', 'General'].map(c => `
            <option value="${c}" ${state.categoryFilter === c ? 'selected' : ''}>${categoryIcons[c] || '📌'} ${c}</option>
          `).join('')}
        </select>
      </div>
    </div>

    <div class="tablewrap">
      ${
        filtered.length === 0
          ? `<div class="empty">
              <div style="font-size:36px; margin-bottom:10px">🔍</div>
              <b>No matching maintenance requests found.</b>
              <p style="color:var(--text-muted); font-size:13px; margin-top:4px">Try changing your search term or filters.</p>
              ${state.statusFilter !== 'all' || state.categoryFilter !== 'all' || state.searchQuery ? '<button class="action" onclick="resetFilters()" style="margin-top:14px">Reset Filters</button>' : ''}
            </div>`
          : `<table>
              <thead>
                <tr>
                  <th>Request & Category</th>
                  <th>Location</th>
                  <th>Priority</th>
                  <th>Status</th>
                  <th>Assigned Technician</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${filtered.map(r => `
                  <tr>
                    <td>
                      <div class="title">#${r.id} · ${esc(r.title)}</div>
                      <div class="tiny">
                        <span>${categoryIcons[r.category] || '📌'} ${esc(r.category)}</span>
                        <span>•</span>
                        <span>By <b>${esc(r.requester)}</b></span>
                        <span>•</span>
                        <span>${timeAgo(r.created_at)}</span>
                      </div>
                      ${r.image_url ? `<button class="photo-btn" onclick="openLightbox('${esc(r.image_url)}', '#${r.id}: ${esc(r.title)}')">📷 View Photo</button>` : ''}
                    </td>
                    <td>
                      <div style="font-weight:600; display:flex; align-items:center; gap:5px">
                        <span>📍</span> ${esc(r.location)}
                      </div>
                    </td>
                    <td><span class="badge ${esc(r.priority)}">${esc(r.priority)}</span></td>
                    <td><span class="badge ${esc(r.status)}">${esc(r.status)}</span></td>
                    <td>
                      <div style="display:flex; align-items:center; gap:6px">
                        <span>👤</span>
                        <b>${esc(r.assigned_to || 'Unassigned')}</b>
                      </div>
                    </td>
                    <td>${actions(r)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>`
      }
    </div>
  `;
}

function actions(r) {
  if (state.user.role === 'admin') {
    return `
      <div class="actions">
        <button class="action" onclick="editRequest(${r.id})">⚙️ Manage</button>
      </div>
    `;
  }
  if (state.user.role === 'maintenance') {
    if (r.status === 'Closed') return '<span style="color:#059669; font-weight:700">✅ Completed</span>';
    return `
      <div class="actions">
        <button class="action" onclick="takeRequest(${r.id})">${r.assigned_to ? 'Update Status' : 'Take Task'}</button>
      </div>
    `;
  }
  if (['student', 'faculty'].includes(state.user.role)) {
    if (r.status === 'Closed') return '<span style="color:#059669; font-weight:700">Resolved ✅</span>';
    return '<span style="color:var(--text-muted); font-size:12px">In Review</span>';
  }
  return '—';
}

window.setStatusFilter = status => {
  state.statusFilter = status;
  renderView();
};

window.handleCategoryFilter = cat => {
  state.categoryFilter = cat;
  renderView();
};

window.handleSearch = query => {
  state.searchQuery = query;
  renderView();
};

window.resetFilters = () => {
  state.statusFilter = 'all';
  state.categoryFilter = 'all';
  state.searchQuery = '';
  renderView();
};

function renderView() {
  const filtered = filterRows(state.requests);
  const panel = document.querySelector('#main-panel');
  if (panel) {
    panel.innerHTML = `
      <div class="panelhead">
        <h2>
          <span>${state.user.role === 'admin' ? 'Campus Maintenance Tickets' : state.user.role === 'maintenance' ? 'Your Maintenance Work Queue' : 'My Reported Requests'}</span>
          <span class="panel-count">${filtered.length} of ${state.requests.length}</span>
        </h2>
        ${['student', 'faculty'].includes(state.user.role) ? '<button class="add" id="newrequest">➕ Report New Issue</button>' : ''}
      </div>
      ${table(state.requests)}
    `;
    document.querySelector('#newrequest')?.addEventListener('click', requestModal);
  }

  // Update card active highlights
  const cardsWrap = document.querySelector('#cards-wrap');
  if (cardsWrap) cardsWrap.innerHTML = cards(state.requests);
}

async function dashboard() {
  try {
    const rows = await api('/requests');
    state.requests = rows;

    await loadNotifications();
    if (!state.notifTimer) {
      state.notifTimer = setInterval(loadNotifications, 12000);
    }

    let extra = '';
    if (state.user.role === 'admin') {
      const s = await api('/stats');
      extra = `
        <div class="panel" style="margin-top:28px">
          <div class="panelhead">
            <h2>Category Analytics & Distribution</h2>
            <span class="panel-count">${s.total} total logged</span>
          </div>
          <div style="padding:22px">
            ${
              s.categories.map(x => {
                const pct = s.total > 0 ? Math.round((x.count / s.total) * 100) : 0;
                return `
                  <div style="margin-bottom:16px">
                    <div style="display:flex; justify-content:space-between; font-size:13px; font-weight:700; margin-bottom:6px">
                      <span>${categoryIcons[x.category] || '📌'} ${esc(x.category)}</span>
                      <span>${x.count} requests (${pct}%)</span>
                    </div>
                    <div style="background:#f1f5f9; height:10px; border-radius:10px; overflow:hidden">
                      <div style="background:var(--primary); height:100%; width:${pct}%; border-radius:10px; transition:width 0.6s ease"></div>
                    </div>
                  </div>
                `;
              }).join('') || '<div class="empty">No category analytics recorded yet.</div>'
            }
          </div>
        </div>
      `;
    }

    shell(`
      <div id="cards-wrap">${cards(rows)}</div>
      <section class="panel" id="main-panel">
        <div class="panelhead">
          <h2>
            <span>${state.user.role === 'admin' ? 'Campus Maintenance Tickets' : state.user.role === 'maintenance' ? 'Your Maintenance Work Queue' : 'My Reported Requests'}</span>
            <span class="panel-count">${rows.length} tickets</span>
          </h2>
          ${['student', 'faculty'].includes(state.user.role) ? '<button class="add" id="newrequest">➕ Report New Issue</button>' : ''}
        </div>
        ${table(rows)}
      </section>
      ${extra}
    `);

    document.querySelector('#newrequest')?.addEventListener('click', requestModal);
  } catch (e) {
    localStorage.removeItem('token');
    state.token = '';
    loginView('Your session ended. Please sign in again.');
  }
}

function requestModal() {
  let photoDataUrl = null;

  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="modalback" id="modal">
      <form class="modal" id="requestform">
        <h2>Report Campus Issue</h2>
        
        <div class="field">
          <label>Issue Title *</label>
          <input name="title" required maxlength="100" placeholder="e.g. Broken window latch, Water leakage in washroom">
        </div>
        
        <div class="grid2">
          <div class="field">
            <label>Location *</label>
            <input name="location" required placeholder="Building · Floor · Room">
          </div>
          <div class="field">
            <label>Category *</label>
            <select name="category">
              <option>Electrical</option>
              <option>Plumbing</option>
              <option>Furniture</option>
              <option>HVAC</option>
              <option>Cleaning</option>
              <option>Other</option>
            </select>
          </div>
        </div>
        
        <div class="grid2">
          <div class="field">
            <label>Priority Level</label>
            <select name="priority">
              <option>Low</option>
              <option selected>Medium</option>
              <option>High</option>
            </select>
          </div>
        </div>
        
        <div class="field">
          <label>Attach Problem Photo (Optional)</label>
          <div class="file-dropzone" id="dropzone">
            <span>📷 Click or tap to upload photo from camera or files</span>
            <input type="file" id="photo_file" accept="image/*" capture="environment">
          </div>
          <div id="preview_area" style="display:none"></div>
        </div>
        
        <div class="field">
          <label>Detailed Description *</label>
          <textarea name="description" required placeholder="Describe what is damaged, when you noticed it, or any safety precautions needed."></textarea>
        </div>
        
        <p class="notice" style="color:#ef4444; font-size:13px"></p>
        
        <div class="modalfoot">
          <button type="button" class="cancel" onclick="closeModal()">Cancel</button>
          <button class="primary" id="submit_complaint_btn">Submit Complaint →</button>
        </div>
      </form>
    </div>
  `
  );

  const dropzone = document.querySelector('#dropzone');
  const fileInput = document.querySelector('#photo_file');
  const previewArea = document.querySelector('#preview_area');

  dropzone.onclick = () => fileInput.click();

  fileInput.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      photoDataUrl = ev.target.result;
      previewArea.style.display = 'block';
      previewArea.innerHTML = `
        <div class="preview-wrap">
          <img src="${photoDataUrl}" alt="Preview">
          <div class="info"><b>Attached:</b> ${esc(file.name)} (${(file.size / 1024).toFixed(0)} KB)</div>
          <button type="button" class="remove-photo" id="remove_photo">Remove</button>
        </div>
      `;
      document.querySelector('#remove_photo').onclick = () => {
        photoDataUrl = null;
        fileInput.value = '';
        previewArea.innerHTML = '';
        previewArea.style.display = 'none';
      };
    };
    reader.readAsDataURL(file);
  };

  document.querySelector('#requestform').onsubmit = async e => {
    e.preventDefault();
    const btn = document.querySelector('#submit_complaint_btn');
    btn.disabled = true;
    btn.textContent = 'Submitting...';
    
    const payload = Object.fromEntries(new FormData(e.target));
    if (photoDataUrl) payload.image = photoDataUrl;
    
    try {
      const created = await api('/requests', { method: 'POST', body: JSON.stringify(payload) });
      closeModal();
      showToast(`Complaint #${created.id} submitted successfully!`);
      dashboard();
    } catch (err) {
      btn.disabled = false;
      btn.textContent = 'Submit Complaint →';
      e.target.querySelector('.notice').textContent = err.message;
    }
  };
}

window.closeModal = () => document.querySelector('#modal')?.remove();

window.takeRequest = async id => {
  const r = state.requests.find(x => x.id === id);
  const nextStatus = r.status === 'Open' ? 'In Progress' : 'Closed';
  try {
    await api('/requests/' + id, { method: 'PATCH', body: JSON.stringify({ status: nextStatus }) });
    showToast(`Request #${id} marked as ${nextStatus}!`);
    dashboard();
  } catch (e) {
    alert(e.message);
  }
};

window.editRequest = async id => {
  const r = state.requests.find(x => x.id === id);
  const staff = await api('/staff');
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="modalback" id="modal">
      <form class="modal" id="editform">
        <h2>Manage Ticket #${id}</h2>
        <p class="sub">${esc(r.title)} · 📍 ${esc(r.location)}</p>
        
        ${r.image_url ? `<p style="margin-bottom:14px"><button type="button" class="photo-btn" onclick="openLightbox('${esc(r.image_url)}', '${esc(r.title)}')">📷 Inspect Attached Problem Photo</button></p>` : ''}
        
        <div class="grid2">
          <div class="field">
            <label>Update Status</label>
            <select name="status">
              ${['Open', 'In Progress', 'Closed'].map(x => `<option ${x === r.status ? 'selected' : ''}>${x}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label>Assign Technician</label>
            <select name="assigned_to">
              <option value="">Unassigned</option>
              ${staff.map(x => `<option value="${esc(x.username)}" ${x.username === r.assigned_to ? 'selected' : ''}>${esc(x.name)} (${esc(x.username)})</option>`).join('')}
            </select>
          </div>
        </div>
        
        <div class="modalfoot">
          <button type="button" class="cancel" onclick="closeModal()">Cancel</button>
          <button class="primary">Save Changes →</button>
        </div>
      </form>
    </div>
  `
  );

  document.querySelector('#editform').onsubmit = async e => {
    e.preventDefault();
    try {
      await api('/requests/' + id, { method: 'PATCH', body: JSON.stringify(Object.fromEntries(new FormData(e.target))) });
      closeModal();
      showToast(`Changes saved for Ticket #${id}!`);
      dashboard();
    } catch (err) {
      alert(err.message);
    }
  };
};

window.openLightbox = (url, title) => {
  document.querySelector('#lightbox')?.remove();
  document.body.insertAdjacentHTML(
    'beforeend',
    `
    <div class="modalback" id="lightbox" onclick="if(event.target===this)closeLightbox()">
      <div class="lightbox-box">
        <img src="${esc(url)}" class="lightbox-img" alt="Problem photo">
        <div class="lightbox-caption">
          <span>${esc(title)}</span>
          <button class="cancel" onclick="closeLightbox()" style="padding:6px 14px">✕ Close</button>
        </div>
      </div>
    </div>
  `
  );
};

window.closeLightbox = () => document.querySelector('#lightbox')?.remove();

// Initialization
(async () => {
  if (state.token) {
    try {
      state.user = (await api('/me')).user;
      return dashboard();
    } catch {
      localStorage.removeItem('token');
    }
  }
  loginView();
})();
