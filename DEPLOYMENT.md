# Campus Maintenance Management System – Cloud Deployment Guide

This guide walks you through deploying the application and MySQL database to the cloud.

---

## 🚀 Option 1: Railway (Recommended — Fastest Setup)

Railway runs the **Node.js application** and a managed **MySQL database** in one project.

### Step 1: Create a Railway project and MySQL database
1. Log in to [railway.app](https://railway.app) using GitHub.
2. Create a new project and add a **MySQL** service.
3. Railway generates database connection variables, including `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT`, and `MYSQL_URL`.

### Step 2: Deploy the Node.js service
1. In the same Railway project, add a **GitHub Repo** service.
2. Select `sindhuja01112006-glitch/campus-maintenence-management-system`.
3. Railway detects Node.js and uses the `npm start` script (`node server.js`).

### Step 3: Connect the app to MySQL
In the app service's **Variables** tab, add a reference to the MySQL service's `MYSQL_URL` as `DATABASE_URL` (for example, `${{MySQL.MYSQL_URL}}`). The app also supports the individual `MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, and `MYSQLPORT` variables.

### Step 4: Initialize the database once
After the MySQL service is running and its variables are available to the app service, run this command once in the app service's shell/terminal:

```bash
npm run db:init
```

This creates the tables and inserts demo users and sample requests. The server's startup migration only adjusts a few columns/tables; it does **not** create the entire database schema, so this initialization step is required for a fresh database.

### Step 5: Generate a public domain
In the app service, go to **Settings → Networking** and generate a domain. Railway provides the public HTTPS URL.

### Step 6: Optional email configuration
Email delivery is simulated and logged to MySQL when SMTP settings are not configured. To enable SMTP, add `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, and `SMTP_FROM` to the app service variables.

---

## 🌐 Option 2: Render + TiDB Cloud / Aiven

### Step 1: Create a cloud MySQL database
1. Sign up for [TiDB Cloud Serverless](https://tidbcloud.com/) or [Aiven MySQL](https://aiven.io/).
2. Create a MySQL cluster and copy its connection string:
   `mysql://username:password@host:port/database`

### Step 2: Deploy the web service on Render
1. Sign up on [render.com](https://render.com).
2. Create a **Web Service** and connect the GitHub repository.
3. Set the build command to `npm install` and the start command to `npm start`.
4. Add `DATABASE_URL` with the MySQL connection string. Add `DB_SSL=true` if required by your provider.
5. Deploy the service, then run `npm run db:init` once from the service shell to create and seed the database.

---

## 🐳 Option 3: Docker Deployment

A `Dockerfile` is provided in the repository root.

```bash
docker build -t campus-maintenance .
docker run -p 3000:3000 \
  -e DB_HOST=your-mysql-host \
  -e DB_USER=your-user \
  -e DB_PASSWORD=your-password \
  -e DB_NAME=campus_maintenance \
  campus-maintenance
```

Initialize the database separately with `npm run db:init` after the database is available.

---

## 🔑 Demo Login Credentials

These credentials are for local/demo use only. Change or remove them before making a public production deployment.

| Role | Username | Password | Email |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `adminpass` | `admin@campus.edu` |
| **Student** | `student1` | `pass` | `student1@campus.edu` |
| **Faculty** | `faculty1` | `pass` | `faculty1@campus.edu` |
| **Maintenance** | `maint1` | `pass` | `maint1@campus.edu` |
| **Maintenance** | `maint2` | `pass` | `maint2@campus.edu` |
