// server.js – Campus Maintenance Management System
// Backend: Node.js + Express  |  Database: MySQL (via mysql2/promise)
require('dotenv').config();

const express = require('express');
const fs      = require('fs');
const path    = require('path');
const db      = require('./db');           // MySQL pool

const app       = express();
const PORT      = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Middleware ────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.static(PUBLIC_DIR));

// ── Uploads directory ─────────────────────────────────────────
const UPLOADS_DIR = path.join(PUBLIC_DIR, 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────
function getToken(req) {
  return (req.headers.authorization || '').replace('Bearer token-', '').trim();
}

const normalizeStatus = s =>
  !s ? 'Open'
     : s.toLowerCase().replace(/[_\s-]+/g, '') === 'inprogress' ? 'In Progress'
     : s.toLowerCase() === 'closed' ? 'Closed'
     : 'Open';

function saveImageBase64(base64Str, reqId) {
  if (!base64Str || typeof base64Str !== 'string') return null;
  if (!base64Str.startsWith('data:image/'))
    return (base64Str.startsWith('http') || base64Str.startsWith('/')) ? base64Str : null;
  try {
    const matches = base64Str.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!matches) return null;
    const ext      = matches[1] === 'jpeg' ? 'jpg' : matches[1].replace(/[^a-zA-Z0-9]/g, '');
    const buf      = Buffer.from(matches[2], 'base64');
    const filename = `issue_${reqId}_${Date.now()}.${ext || 'jpg'}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, filename), buf);
    return `/uploads/${filename}`;
  } catch (e) {
    console.error('Failed to save image:', e);
    return null;
  }
}

// Format a DB row's date fields to ISO strings
function fmtRequest(row) {
  if (!row) return row;
  return {
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
    image_url:  row.image_url || null
  };
}
function fmtNotif(row) {
  if (!row) return row;
  return {
    ...row,
    read:       !!row.is_read,     // alias for front-end compatibility
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

// ── 1. Authentication ─────────────────────────────────────────
app.post(['/login', '/api/login'], async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const [rows] = await db.query(
      'SELECT id, username, name, role FROM users WHERE username=? AND password=?',
      [username, password]
    );
    if (!rows.length) return res.status(401).json({ error: 'Invalid username or password' });
    const u = rows[0];
    res.json({ ...u, user: u, token: `token-${u.username}` });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 2. Current user & staff list ──────────────────────────────
app.get('/api/me', async (req, res) => {
  try {
    const token  = getToken(req) || 'admin';
    const [rows] = await db.query(
      'SELECT id, username, name, role FROM users WHERE username=?', [token]
    );
    const user   = rows[0] || { id: 1, username: 'admin', name: 'Campus Administrator', role: 'admin' };
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/logout', (req, res) => res.json({ ok: true }));

app.get('/api/staff', async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT username, name FROM users WHERE role='maintenance'"
    );
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 3. Requests: List & Filter ────────────────────────────────
app.get(['/requests', '/api/requests'], async (req, res) => {
  try {
    let { role, username } = req.query;
    if (!role && !username) {
      const token  = getToken(req);
      const [rows] = await db.query('SELECT role, username FROM users WHERE username=?', [token]);
      if (rows.length) { role = rows[0].role; username = rows[0].username; }
      else              { role = 'admin'; username = 'admin'; }
    }

    let sql    = 'SELECT * FROM requests';
    let params = [];
    if (role === 'student' || role === 'faculty') {
      sql += ' WHERE requester=?'; params = [username];
    } else if (role === 'maintenance') {
      sql += ' WHERE (assigned_to=? OR assigned_to IS NULL OR status="Open")'; params = [username];
    }
    sql += ' ORDER BY created_at DESC';

    const [rows] = await db.query(sql, params);
    res.json(rows.map(fmtRequest));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 4. Requests: Create ───────────────────────────────────────
app.post(['/requests', '/api/requests'], async (req, res) => {
  try {
    const requester = req.body.requester || getToken(req) || 'student1';

    // get next id first (for image filename)
    const [[{ nextId }]] = await db.query('SELECT COALESCE(MAX(id),0)+1 AS nextId FROM requests');
    let imageUrl = null;
    if (req.body.image)      imageUrl = saveImageBase64(req.body.image, nextId);
    else if (req.body.image_url) imageUrl = req.body.image_url;

    const [result] = await db.query(
      `INSERT INTO requests (title, description, location, category, priority, status, requester, assigned_to, image_url)
       VALUES (?, ?, ?, ?, ?, 'Open', ?, NULL, ?)`,
      [
        req.body.title       || 'Untitled Issue',
        req.body.description || '',
        req.body.location    || 'Campus',
        req.body.category    || 'General',
        req.body.priority    || 'Medium',
        requester,
        imageUrl
      ]
    );
    const [[newRow]] = await db.query('SELECT * FROM requests WHERE id=?', [result.insertId]);
    res.status(201).json(fmtRequest(newRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 5. Requests: Update (status / assignee / photo) ──────────
const updateHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[item]] = await db.query('SELECT * FROM requests WHERE id=?', [id]);
    if (!item) return res.status(404).json({ error: 'Request not found' });

    const oldStatus  = item.status;
    const oldAssignee = item.assigned_to;

    const newStatus   = req.body.status     !== undefined ? normalizeStatus(req.body.status) : item.status;
    const newAssignee = req.body.assigned_to !== undefined ? (req.body.assigned_to || null)  : item.assigned_to;

    let newImage = item.image_url;
    if (req.body.image) {
      const saved = saveImageBase64(req.body.image, id);
      if (saved) newImage = saved;
    }

    await db.query(
      'UPDATE requests SET status=?, assigned_to=?, image_url=?, updated_at=NOW() WHERE id=?',
      [newStatus, newAssignee, newImage, id]
    );

    // ── Notification: resolved ────────────────────────────────
    if (newStatus === 'Closed' && oldStatus !== 'Closed') {
      await db.query(
        `INSERT INTO notifications (id, recipient, title, message, request_id, type, is_read)
         VALUES (?, ?, 'Complaint Resolved', ?, ?, 'resolved', 0)`,
        [
          Date.now(),
          item.requester,
          `Your maintenance request #${id} ("${item.title}") at ${item.location} has been marked as resolved.`,
          id
        ]
      );
    }

    // ── Notification: assigned ────────────────────────────────
    if (newAssignee && newAssignee !== oldAssignee) {
      await db.query(
        `INSERT INTO notifications (id, recipient, title, message, request_id, type, is_read)
         VALUES (?, ?, 'New Work Order Assigned', ?, ?, 'assigned', 0)`,
        [
          Date.now() + 1,
          newAssignee,
          `You have been assigned to maintenance ticket #${id}: "${item.title}" at ${item.location}.`,
          id
        ]
      );
    }

    const [[updated]] = await db.query('SELECT * FROM requests WHERE id=?', [id]);
    res.json({ ok: true, request: fmtRequest(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
app.put('/requests/:id/status', updateHandler);
app.put('/requests/:id',        updateHandler);
app.patch('/api/requests/:id',  updateHandler);

// ── 6. Notifications ──────────────────────────────────────────
app.get('/api/notifications', async (req, res) => {
  try {
    let username = req.query.username;
    if (!username) {
      const token  = getToken(req);
      const [rows] = await db.query('SELECT username FROM users WHERE username=?', [token]);
      username = rows.length ? rows[0].username : (token || 'admin');
    }
    const [rows] = await db.query(
      "SELECT * FROM notifications WHERE recipient=? OR recipient='all' ORDER BY created_at DESC",
      [username]
    );
    const list        = rows.map(fmtNotif);
    const unreadCount = list.filter(n => !n.read).length;
    res.json({ notifications: list, unreadCount });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    await db.query('UPDATE notifications SET is_read=1 WHERE id=?', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/notifications/read-all', async (req, res) => {
  try {
    const token    = getToken(req);
    const username = req.body.username || token || 'student1';
    await db.query(
      "UPDATE notifications SET is_read=1 WHERE recipient=? OR recipient='all'",
      [username]
    );
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 7. Statistics ─────────────────────────────────────────────
app.get(['/stats', '/api/stats'], async (req, res) => {
  try {
    const [[counts]] = await db.query(`
      SELECT
        COUNT(*)                                              AS total,
        SUM(status = 'Open')                                  AS \`open\`,
        SUM(status = 'In Progress')                           AS in_progress,
        SUM(status = 'Closed')                                AS closed
      FROM requests
    `);
    const [catRows] = await db.query(`
      SELECT category, COUNT(*) AS count FROM requests GROUP BY category
    `);
    res.json({
      total:       counts.total,
      open:        counts.open,
      in_progress: counts.in_progress,
      closed:      counts.closed,
      categories:  catRows
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── Start ─────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🏫 Campus Maintenance backend running at http://localhost:${PORT}`);
  console.log('   Portals:');
  console.log(`   - Admin:       http://localhost:${PORT}/admin.html`);
  console.log(`   - Student:     http://localhost:${PORT}/student.html`);
  console.log(`   - Faculty:     http://localhost:${PORT}/faculty.html`);
  console.log(`   - Maintenance: http://localhost:${PORT}/maintenance.html`);
});
