// server.js – Campus Maintenance Management System
// Backend: Node.js + Express  |  Database: MySQL (via mysql2/promise)
// Enhanced with Email Notification Service & Multi-Account Dashboards
require('dotenv').config();

const express      = require('express');
const fs           = require('fs');
const path         = require('path');
const db           = require('./db');           // MySQL pool
const emailService = require('./emailService'); // Notification Email Engine

const app        = express();
const PORT       = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// ── Database Auto-Migration & Schema Verification ─────────────
async function initDatabaseSchema() {
  try {
    // 1. Ensure email column exists on users table
    try {
      await db.query("ALTER TABLE users ADD COLUMN email VARCHAR(120) DEFAULT NULL");
    } catch (e) {
      // Column likely already exists
    }

    // 2. Set default emails if empty
    await db.query(`
      UPDATE users SET email = CASE
        WHEN username = 'admin'    THEN 'admin@campus.edu'
        WHEN username = 'student1' THEN 'student1@campus.edu'
        WHEN username = 'faculty1' THEN 'faculty1@campus.edu'
        WHEN username = 'maint1'   THEN 'maint1@campus.edu'
        WHEN username = 'maint2'   THEN 'maint2@campus.edu'
        ELSE CONCAT(username, '@campus.edu')
      END
      WHERE email IS NULL OR email = ''
    `);

    // 3. Ensure email_logs table exists
    await db.query(`
      CREATE TABLE IF NOT EXISTS email_logs (
        id             BIGINT AUTO_INCREMENT PRIMARY KEY,
        recipient      VARCHAR(120) NOT NULL,
        recipient_user VARCHAR(50)  DEFAULT NULL,
        subject        VARCHAR(255) NOT NULL,
        body           LONGTEXT     NOT NULL,
        event_type     VARCHAR(50)  NOT NULL,
        request_id     INT          DEFAULT NULL,
        status         ENUM('Sent','Simulated','Failed') DEFAULT 'Sent',
        created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_rec_user (recipient_user),
        INDEX idx_req_id (request_id)
      )
    `);

    console.log('✅ Database schema verified: email notifications & audit logs active.');
  } catch (err) {
    console.warn('⚠️  Database schema check warning (ensure MySQL is running):', err.message);
  }
}
initDatabaseSchema();

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

async function getUserByUsername(username) {
  if (!username) return null;
  try {
    const [rows] = await db.query('SELECT id, username, name, role, email FROM users WHERE username=?', [username]);
    if (rows.length) return rows[0];
  } catch (e) {
    console.error('Failed to query user:', e.message);
  }
  return { id: 0, username, name: username, role: 'student', email: `${username}@campus.edu` };
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
    read:       !!row.is_read,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

function fmtEmailLog(row) {
  if (!row) return row;
  return {
    ...row,
    created_at: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at
  };
}

// ── 1. Authentication ─────────────────────────────────────────
app.post(['/login', '/api/login'], async (req, res) => {
  try {
    const { username, password } = req.body || {};
    const [rows] = await db.query(
      'SELECT id, username, name, role, email FROM users WHERE username=? AND password=?',
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
      'SELECT id, username, name, role, email FROM users WHERE username=?', [token]
    );
    const user   = rows[0] || { id: 1, username: 'admin', name: 'Campus Administrator', role: 'admin', email: 'admin@campus.edu' };
    res.json({ user });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

app.patch('/api/me/email', async (req, res) => {
  try {
    const token = getToken(req) || 'admin';
    const email = (req.body.email || '').trim();
    if (!email || !email.includes('@')) {
      return res.status(400).json({ error: 'Please provide a valid email address' });
    }
    await db.query('UPDATE users SET email=? WHERE username=?', [email, token]);
    const user = await getUserByUsername(token);
    res.json({ ok: true, user, message: 'Email address updated successfully' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to update email' });
  }
});

app.post('/api/logout', (req, res) => res.json({ ok: true }));

app.get('/api/staff', async (req, res) => {
  try {
    const [rows] = await db.query(
      "SELECT username, name, email FROM users WHERE role='maintenance'"
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

// ── 4. Requests: Create (Triggers Email Service) ──────────────
app.post(['/requests', '/api/requests'], async (req, res) => {
  try {
    const requester = req.body.requester || getToken(req) || 'student1';

    // get next id first (for image filename)
    const [[{ nextId }]] = await db.query('SELECT COALESCE(MAX(id),0)+1 AS nextId FROM requests');
    let imageUrl = null;
    if (req.body.image)          imageUrl = saveImageBase64(req.body.image, nextId);
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

    // ── Email Trigger: Ticket Created ─────────────────────────
    (async () => {
      try {
        const reqUser = await getUserByUsername(requester);
        await emailService.sendTicketCreatedEmail(newRow, reqUser);
      } catch (emErr) {
        console.error('Failed to send ticket created email:', emErr);
      }
    })();

    res.status(201).json(fmtRequest(newRow));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
});

// ── 5. Requests: Update (Status / Assignee / Photo / Emails) ──
const updateHandler = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const [[item]] = await db.query('SELECT * FROM requests WHERE id=?', [id]);
    if (!item) return res.status(404).json({ error: 'Request not found' });

    const oldStatus   = item.status;
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

    const [[updated]] = await db.query('SELECT * FROM requests WHERE id=?', [id]);

    // ── 5a. Event: Ticket Resolved (Status changed to Closed) ─
    if (newStatus === 'Closed' && oldStatus !== 'Closed') {
      // In-App Notification
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

      // Email Notification
      (async () => {
        try {
          const reqUser = await getUserByUsername(item.requester);
          await emailService.sendTicketResolvedEmail(updated, reqUser);
        } catch (e) {
          console.error('Failed to send resolution email:', e.message);
        }
      })();
    }

    // ── 5b. Event: Work Order Assigned to Technician ──────────
    if (newAssignee && newAssignee !== oldAssignee) {
      // In-App Notification
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

      // Email Notification
      (async () => {
        try {
          const staffUser = await getUserByUsername(newAssignee);
          await emailService.sendTicketAssignedEmail(updated, staffUser);
        } catch (e) {
          console.error('Failed to send assignment email:', e.message);
        }
      })();
    }

    res.json({ ok: true, request: fmtRequest(updated) });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Server error' });
  }
};
app.put('/requests/:id/status', updateHandler);
app.put('/requests/:id',        updateHandler);
app.patch('/api/requests/:id',  updateHandler);

// ── 6. In-App Notifications ───────────────────────────────────
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

// ── 7. Email Notification Logs & Test Service ─────────────────
app.get('/api/email-logs', async (req, res) => {
  try {
    const token = getToken(req) || 'admin';
    const [userRows] = await db.query('SELECT username, role, email FROM users WHERE username=?', [token]);
    const user = userRows[0] || { username: token, role: 'admin', email: 'admin@campus.edu' };

    let sql    = 'SELECT * FROM email_logs';
    let params = [];

    // Admins see all emails; other roles only see emails sent to them
    if (user.role !== 'admin') {
      sql += ' WHERE recipient_user=? OR recipient=?';
      params = [user.username, user.email || `${user.username}@campus.edu`];
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';

    const [rows] = await db.query(sql, params);
    res.json({
      emails: rows.map(fmtEmailLog),
      total: rows.length,
      user
    });
  } catch (err) {
    console.error('Failed to get email logs:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

app.post('/api/send-test-email', async (req, res) => {
  try {
    const token    = getToken(req) || req.body.username || 'admin';
    const user     = await getUserByUsername(token);
    const result   = await emailService.sendTestEmail(user);
    res.json({ ok: true, result, user });
  } catch (err) {
    console.error('Failed to send test email:', err.message);
    res.status(500).json({ error: 'Failed to send test email' });
  }
});

// ── 8. Personalized Dashboard Summary For Each Account ────────
app.get('/api/dashboard-summary', async (req, res) => {
  try {
    const token = getToken(req) || 'admin';
    const user  = await getUserByUsername(token);

    // 1. Complaint stats based on role
    let reqCounts = { total: 0, open: 0, in_progress: 0, closed: 0 };
    let catRows   = [];

    if (user.role === 'admin') {
      const [[counts]] = await db.query(`
        SELECT
          COUNT(*)                    AS total,
          SUM(status = 'Open')        AS \`open\`,
          SUM(status = 'In Progress') AS in_progress,
          SUM(status = 'Closed')      AS closed
        FROM requests
      `);
      reqCounts = {
        total:       counts.total || 0,
        open:        counts.open || 0,
        in_progress: counts.in_progress || 0,
        closed:      counts.closed || 0
      };

      const [cRows] = await db.query(`SELECT category, COUNT(*) AS count FROM requests GROUP BY category`);
      catRows = cRows;
    } else if (user.role === 'maintenance') {
      const [[counts]] = await db.query(`
        SELECT
          COUNT(*)                    AS total,
          SUM(status = 'Open')        AS \`open\`,
          SUM(status = 'In Progress') AS in_progress,
          SUM(status = 'Closed')      AS closed
        FROM requests
        WHERE (assigned_to=? OR assigned_to IS NULL OR status='Open')
      `, [user.username]);
      reqCounts = {
        total:       counts.total || 0,
        open:        counts.open || 0,
        in_progress: counts.in_progress || 0,
        closed:      counts.closed || 0
      };
    } else {
      // Student or Faculty
      const [[counts]] = await db.query(`
        SELECT
          COUNT(*)                    AS total,
          SUM(status = 'Open')        AS \`open\`,
          SUM(status = 'In Progress') AS in_progress,
          SUM(status = 'Closed')      AS closed
        FROM requests
        WHERE requester=?
      `, [user.username]);
      reqCounts = {
        total:       counts.total || 0,
        open:        counts.open || 0,
        in_progress: counts.in_progress || 0,
        closed:      counts.closed || 0
      };
    }

    // 2. Unread In-App Notifications count
    const [[notifCount]] = await db.query(`
      SELECT COUNT(*) AS unread FROM notifications
      WHERE (recipient=? OR recipient='all') AND is_read=0
    `, [user.username]);

    // 3. Email Logs count
    let emailCountQuery = "SELECT COUNT(*) AS total_emails FROM email_logs";
    let emailParams = [];
    if (user.role !== 'admin') {
      emailCountQuery += " WHERE recipient_user=? OR recipient=?";
      emailParams = [user.username, user.email || `${user.username}@campus.edu`];
    }
    const [[emailCount]] = await db.query(emailCountQuery, emailParams);

    res.json({
      user,
      stats: reqCounts,
      categories: catRows,
      unreadNotifications: notifCount.unread || 0,
      totalEmails: emailCount.total_emails || 0,
      emailStatus: process.env.SMTP_HOST ? 'SMTP Online' : 'Simulation Engine Active'
    });
  } catch (err) {
    console.error('Failed to get dashboard summary:', err.message);
    res.status(500).json({ error: 'Server error' });
  }
});

// Legacy /stats endpoint
app.get(['/stats', '/api/stats'], async (req, res) => {
  try {
    const [[counts]] = await db.query(`
      SELECT
        COUNT(*)                    AS total,
        SUM(status = 'Open')        AS \`open\`,
        SUM(status = 'In Progress') AS in_progress,
        SUM(status = 'Closed')      AS closed
      FROM requests
    `);
    const [catRows] = await db.query(`
      SELECT category, COUNT(*) AS count FROM requests GROUP BY category
    `);
    const [[emailCount]] = await db.query(`SELECT COUNT(*) AS total_emails FROM email_logs`);

    res.json({
      total:        counts.total || 0,
      open:         counts.open || 0,
      in_progress:  counts.in_progress || 0,
      closed:       counts.closed || 0,
      total_emails: emailCount.total_emails || 0,
      categories:   catRows
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
  console.log('   Email Service:');
  console.log(`   - Status:      ${process.env.SMTP_HOST ? 'Connected to ' + process.env.SMTP_HOST : 'Simulation Mode (Logged to Database & UI)'}\n`);
});
