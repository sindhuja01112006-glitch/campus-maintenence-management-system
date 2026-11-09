// db.js – MySQL connection pool (uses mysql2/promise for async/await)
require('dotenv').config();
const mysql = require('mysql2/promise');

const connectionUri = process.env.DATABASE_URL || process.env.MYSQL_URL;

const config = connectionUri
  ? {
      uri: connectionUri,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      charset: 'utf8mb4',
      timezone: '+00:00',
      dateStrings: false,
      decimalNumbers: true,
      ssl: process.env.DB_SSL === 'true' || process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    }
  : {
      host:               process.env.DB_HOST || process.env.MYSQLHOST || 'localhost',
      port:               parseInt(process.env.DB_PORT || process.env.MYSQLPORT || '3306', 10),
      user:               process.env.DB_USER || process.env.MYSQLUSER || 'root',
      password:           process.env.DB_PASSWORD !== undefined ? process.env.DB_PASSWORD : (process.env.MYSQLPASSWORD || ''),
      database:           process.env.DB_NAME || process.env.MYSQLDATABASE || 'campus_maintenance',
      waitForConnections: true,
      connectionLimit:    10,
      queueLimit:         0,
      charset:            'utf8mb4',
      timezone:           '+00:00',   // store/retrieve dates in UTC
      dateStrings:        false,      // return JS Date objects
      decimalNumbers:     true,
      ssl: process.env.DB_SSL === 'true' || process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined
    };

const pool = mysql.createPool(config);

// Verify connection on startup
pool.getConnection()
  .then(conn => {
    const target = connectionUri ? 'Cloud Database' : `${config.host}:${config.port}/${config.database}`;
    console.log('✅ MySQL connected →', target);
    conn.release();
  })
  .catch(err => {
    console.error('❌ MySQL connection failed:', err.message);
    console.error('   Make sure MySQL is running and .env credentials are correct.');
  });

module.exports = pool;
