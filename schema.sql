-- ============================================================
--  Campus Maintenance Management System – MySQL Schema
-- ============================================================

CREATE DATABASE IF NOT EXISTS campus_maintenance
  CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE campus_maintenance;

-- ── 1. Users ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id         INT           AUTO_INCREMENT PRIMARY KEY,
  username   VARCHAR(50)   UNIQUE NOT NULL,
  password   VARCHAR(255)  NOT NULL,
  name       VARCHAR(100)  NOT NULL,
  role       ENUM('admin','student','faculty','maintenance') NOT NULL,
  email      VARCHAR(120)  DEFAULT NULL
);

-- ── 2. Maintenance Requests ─────────────────────────────────
CREATE TABLE IF NOT EXISTS requests (
  id          INT           AUTO_INCREMENT PRIMARY KEY,
  title       VARCHAR(200)  NOT NULL,
  description TEXT,
  location    VARCHAR(200),
  category    VARCHAR(100),
  priority    ENUM('Low','Medium','High') DEFAULT 'Medium',
  status      ENUM('Open','In Progress','Closed') DEFAULT 'Open',
  requester   VARCHAR(50),
  assigned_to VARCHAR(50)   DEFAULT NULL,
  image_url   VARCHAR(500)  DEFAULT NULL,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME      DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (requester)   REFERENCES users(username) ON DELETE SET NULL,
  FOREIGN KEY (assigned_to) REFERENCES users(username) ON DELETE SET NULL
);

-- ── 3. Notifications ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          BIGINT        PRIMARY KEY,
  recipient   VARCHAR(50),
  title       VARCHAR(200),
  message     TEXT,
  request_id  INT           DEFAULT NULL,
  type        VARCHAR(50),
  is_read     TINYINT(1)    DEFAULT 0,
  created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (recipient)   REFERENCES users(username)  ON DELETE CASCADE,
  FOREIGN KEY (request_id)  REFERENCES requests(id)     ON DELETE SET NULL
);

-- ── 4. Email Logs ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_logs (
  id             BIGINT        AUTO_INCREMENT PRIMARY KEY,
  recipient      VARCHAR(120)  NOT NULL,
  recipient_user VARCHAR(50)   DEFAULT NULL,
  subject        VARCHAR(255)  NOT NULL,
  body           LONGTEXT      NOT NULL,
  event_type     VARCHAR(50)   NOT NULL,
  request_id     INT           DEFAULT NULL,
  status         ENUM('Sent','Simulated','Failed') DEFAULT 'Sent',
  created_at     DATETIME      DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (request_id)     REFERENCES requests(id) ON DELETE SET NULL
);

-- ── Seed: Users ──────────────────────────────────────────────
INSERT IGNORE INTO users (id, username, password, name, role, email) VALUES
  (1, 'admin',    'adminpass', 'Campus Administrator', 'admin',       'admin@campus.edu'),
  (2, 'student1', 'pass',      'Aarav Sharma',         'student',     'student1@campus.edu'),
  (3, 'faculty1', 'pass',      'Dr. Meera Iyer',       'faculty',     'faculty1@campus.edu'),
  (4, 'maint1',   'pass',      'Ravi Kumar',            'maintenance', 'maint1@campus.edu'),
  (5, 'maint2',   'pass',      'Priya Das',             'maintenance', 'maint2@campus.edu')
ON DUPLICATE KEY UPDATE email=VALUES(email);

-- ── Seed: Requests ───────────────────────────────────────────
INSERT IGNORE INTO requests (id, title, description, location, category, priority, status, requester, assigned_to, image_url, created_at, updated_at) VALUES
  (1, 'Leaking tap in washroom',    'Continuous leak on 2nd floor.',   'Science Block - Floor 2',    'Plumbing',   'High',   'In Progress', 'student1', 'maint1', NULL, '2026-09-10 09:15:00', NULL),
  (2, 'Projector not powering on',  'No power light visible.',         'Academic Block - Room 204',  'Electrical', 'Medium', 'Open',        'faculty1', NULL,     NULL, '2026-09-11 07:45:00', NULL),
  (3, 'Broken study desk',          'Wobbly desk leg needs repair.',   'Library - Study Area',       'Furniture',  'Low',    'Closed',      'student1', 'maint2', NULL, '2026-09-09 12:00:00', NULL),
  (4, 'Flickering fluorescent lamp','Light is buzzing and flickering', 'Lab 101',                    'Electrical', 'Medium', 'In Progress', 'student1', 'maint1', NULL, '2026-09-12 06:48:02', '2026-09-12 06:48:02'),
  (5, 'Window latch broken',        'Window rattling in wind',         'Block C - Room 302',         'Furniture',  'Medium', 'Open',        'student1', NULL,     NULL, '2026-09-12 07:03:39', NULL);

-- ── Seed: Notifications ──────────────────────────────────────
INSERT IGNORE INTO notifications (id, recipient, title, message, request_id, type, is_read, created_at) VALUES
  (1, 'student1', 'Complaint Resolved',
   'Your maintenance request #3 ("Broken study desk") at Library - Study Area has been marked as resolved.',
   3, 'resolved', 1, '2026-09-10 14:30:00');

-- ── Seed: Email Logs ────────────────────────────────────────
INSERT IGNORE INTO email_logs (id, recipient, recipient_user, subject, body, event_type, request_id, status, created_at) VALUES
  (1, 'student1@campus.edu', 'student1', 'Ticket #3 Logged: Broken study desk',
   '<p>Your ticket #3 has been registered in the campus maintenance system.</p>', 'ticket_created', 3, 'Sent', '2026-09-09 12:01:00'),
  (2, 'maint2@campus.edu', 'maint2', '[Work Order Assigned] Ticket #3: Broken study desk',
   '<p>You have been assigned to repair a broken study desk in Library - Study Area.</p>', 'ticket_assigned', 3, 'Sent', '2026-09-09 12:05:00'),
  (3, 'student1@campus.edu', 'student1', '[Resolved] Ticket #3: Broken study desk is now Closed',
   '<p>Your maintenance request #3 has been resolved by Priya Das.</p>', 'ticket_resolved', 3, 'Sent', '2026-09-10 14:30:00');
