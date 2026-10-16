// db.js – MySQL connection pool (uses mysql2/promise for async/await)
require('dotenv').config();
const mysql = require('mysql2/promise');

const pool = mysql.createPool({
  host:               process.env.DB_HOST     || 'localhost',
  port:               parseInt(process.env.DB_PORT || '3306', 10),
  user:               process.env.DB_USER     || 'root',
  password:           process.env.DB_PASSWORD || '',
  database:           process.env.DB_NAME     || 'campus_maintenance',
  waitForConnections: true,
  connectionLimit:    10,
  queueLimit:         0,
  charset:            'utf8mb4',
  timezone:           '+00:00',   // store/retrieve dates in UTC
  dateStrings:        false,      // return JS Date objects
  decimalNumbers:     true
});

// Verify connection on startup
pool.getConnection()
  .then(conn => {
    console.log('✅ MySQL connected →', `${process.env.DB_HOST || 'localhost'}:${process.env.DB_PORT || 3306}/${process.env.DB_NAME || 'campus_maintenance'}`);
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    console.error('   Make sure MySQL is running and .env credentials are correct.');
  });

module.exports = pool;
