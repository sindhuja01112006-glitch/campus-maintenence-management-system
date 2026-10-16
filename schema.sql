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
  role       ENUM('admin','student','faculty','maintenance') NOT NULL
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

-- ── Seed: Users ──────────────────────────────────────────────
INSERT IGNORE INTO users (id, username, password, name, role) VALUES
  (1, 'admin',    'adminpass', 'Campus Administrator', 'admin'),
  (2, 'student1', 'pass',      'Aarav Sharma',         'student'),
  (3, 'faculty1', 'pass',      'Dr. Meera Iyer',       'faculty'),
  (4, 'maint1',   'pass',      'Ravi Kumar',            'maintenance'),
  (5, 'maint2',   'pass',      'Priya Das',             'maintenance');

-- ── Seed: Requests ───────────────────────────────────────────
INSERT IGNORE INTO requests (id, title, description, location, category, priority, status, requester, assigned_to, image_url, created_at, updated_at) VALUES
  (1, 'Leaking tap in washroom',    'Continuous leak on 2nd floor.',   'Science Block - Floor 2',    'Plumbing',   'High',   'In Progress', 'student1', 'maint1', NULL, '2026-09-10 09:15:00', NULL),
  (2, 'Projector not powering on',  'No power light visible.',         'Academic Block - Room 204',  'Electrical', 'Medium', 'Open',        'faculty1', NULL,     NULL, '2026-09-11 07:45:00', NULL),
  (3, 'Broken study desk',          'Wobbly desk leg needs repair.',   'Library - Study Area',       'Furniture',  'Low',    'Closed',      'student1', 'maint2', NULL, '2026-09-09 12:00:00', NULL),
  (4, 'Flickering fluorescent lamp','Light is buzzing and flickering', 'Lab 101',                    'Electrical', 'Medium', 'In Progress', 'student1', 'maint1', NULL, '2026-09-12 06:48:02', '2026-09-12 06:48:02'),
  (5, 'window broken',              'rainfalling',                     '701',                        'Furniture',  'Medium', 'Open',        'student1', NULL,     NULL, '2026-09-12 07:03:39', NULL),
  (6, 'Broken window latch',        'Glass pane loose and rattling',   'Block C - Room 302',         'Furniture',  'High',   'Closed',      'student1', NULL, '/uploads/issue_6_1789197423761.png', '2026-09-12 07:17:03', '2026-09-12 07:17:03');

-- ── Seed: Notifications ──────────────────────────────────────
INSERT IGNORE INTO notifications (id, recipient, title, message, request_id, type, is_read, created_at) VALUES
  (1, 'student1', 'Complaint Resolved',
   'Your maintenance request #3 ("Broken study desk") at Library - Study Area has been marked as resolved.',
   3, 'resolved', 1, '2026-09-10 14:30:00'),
  (1789197423786, 'student1', 'Complaint Resolved',
   'Your maintenance request #6 ("Broken window latch") at Block C - Room 302 has been marked as resolved.',
   6, 'resolved', 1, '2026-09-12 07:17:03');
