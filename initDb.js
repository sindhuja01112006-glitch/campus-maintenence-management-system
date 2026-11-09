// initDb.js – Automated Database Initializer for Cloud & Local Deployments
// Run with: npm run db:init
require('dotenv').config();
const pool = require('./db');

async function init() {
  console.log('🚀 Initializing database tables and seed data...');
  const conn = await pool.getConnection();

  try {
    // 1. Users Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id         INT           AUTO_INCREMENT PRIMARY KEY,
        username   VARCHAR(50)   UNIQUE NOT NULL,
        password   VARCHAR(255)  NOT NULL,
        name       VARCHAR(100)  NOT NULL,
        role       ENUM('admin','student','faculty','maintenance') NOT NULL,
        email      VARCHAR(120)  DEFAULT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Requests Table
    await conn.query(`
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
        INDEX idx_req_user (requester),
        INDEX idx_req_assigned (assigned_to),
        CONSTRAINT fk_req_user FOREIGN KEY (requester) REFERENCES users(username) ON DELETE SET NULL,
        CONSTRAINT fk_req_assigned FOREIGN KEY (assigned_to) REFERENCES users(username) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Notifications Table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id          BIGINT        PRIMARY KEY,
        recipient   VARCHAR(50),
        title       VARCHAR(200),
        message     TEXT,
        request_id  INT           DEFAULT NULL,
        type        VARCHAR(50),
        is_read     TINYINT(1)    DEFAULT 0,
        created_at  DATETIME      DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_notif_recipient (recipient),
        INDEX idx_notif_req (request_id),
        CONSTRAINT fk_notif_user FOREIGN KEY (recipient) REFERENCES users(username) ON DELETE CASCADE,
        CONSTRAINT fk_notif_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Email Logs Table
    await conn.query(`
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
        INDEX idx_log_req (request_id),
        CONSTRAINT fk_log_req FOREIGN KEY (request_id) REFERENCES requests(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    console.log('✅ Tables created or verified.');

    // 5. Seed Users
    await conn.query(`
      INSERT INTO users (id, username, password, name, role, email) VALUES
        (1, 'admin',    'adminpass', 'Campus Administrator', 'admin',       'admin@campus.edu'),
        (2, 'student1', 'pass',      'Aarav Sharma',         'student',     'student1@campus.edu'),
        (3, 'faculty1', 'pass',      'Dr. Meera Iyer',       'faculty',     'faculty1@campus.edu'),
        (4, 'maint1',   'pass',      'Ravi Kumar',            'maintenance', 'maint1@campus.edu'),
        (5, 'maint2',   'pass',      'Priya Das',             'maintenance', 'maint2@campus.edu')
      ON DUPLICATE KEY UPDATE email=VALUES(email);
    `);

    // 6. Seed Requests if table is empty
    const [existingReqs] = await conn.query('SELECT COUNT(*) as count FROM requests');
    if (existingReqs[0].count === 0) {
      await conn.query(`
        INSERT INTO requests (id, title, description, location, category, priority, status, requester, assigned_to, image_url, created_at, updated_at) VALUES
          (1, 'Leaking tap in washroom',    'Continuous leak on 2nd floor.',   'Science Block - Floor 2',    'Plumbing',   'High',   'In Progress', 'student1', 'maint1', NULL, '2026-09-10 09:15:00', NULL),
          (2, 'Projector not powering on',  'No power light visible.',         'Academic Block - Room 204',  'Electrical', 'Medium', 'Open',        'faculty1', NULL,     NULL, '2026-09-11 07:45:00', NULL),
          (3, 'Broken study desk',          'Wobbly desk leg needs repair.',   'Library - Study Area',       'Furniture',  'Low',    'Closed',      'student1', 'maint2', NULL, '2026-09-09 12:00:00', NULL),
          (4, 'Flickering fluorescent lamp','Light is buzzing and flickering', 'Lab 101',                    'Electrical', 'Medium', 'In Progress', 'student1', 'maint1', NULL, '2026-09-12 06:48:02', '2026-09-12 06:48:02'),
          (5, 'Window latch broken',        'Window rattling in wind',         'Block C - Room 302',         'Furniture',  'Medium', 'Open',        'student1', NULL,     NULL, '2026-09-12 07:03:39', NULL);
      `);
      console.log('✅ Sample maintenance requests seeded.');
    }

    console.log('🎉 Database initialization complete!');
  } catch (err) {
    console.error('❌ Error initializing database:', err.message);
    process.exit(1);
  } finally {
    conn.release();
    process.exit(0);
  }
}

init();

