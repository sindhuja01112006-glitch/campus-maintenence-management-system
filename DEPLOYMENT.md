# Campus Maintenance Management System – Cloud Deployment Guide

This guide walks you through deploying the application and MySQL database to the cloud.

---

## 🚀 Option 1: Railway (Recommended — Fastest 1-Click Setup)

Railway allows you to run both the **Node.js application** and a managed **MySQL database** within the same project.

### Step 1: Push Project to GitHub
1. Create a new repository on [GitHub](https://github.com).
2. Push your project code (the `.gitignore` automatically excludes `node_modules` and `.env`).

### Step 2: Create a Railway Project
1. Log in to [railway.app](https://railway.app) using GitHub.
2. Click **+ New Project** → **Provision MySQL**.
   - Railway will instantly spin up a managed MySQL database and generate connection variables (`MYSQLHOST`, `MYSQLUSER`, `MYSQLPASSWORD`, `MYSQLDATABASE`, `MYSQLPORT`, `MYSQL_URL`).

### Step 3: Deploy the Node.js Service
1. In the same Railway project canvas, click **+ Create** → **GitHub Repo**.
2. Select your repository.
3. Railway automatically detects Node.js and starts building.

### Step 4: Connect Database to the App
1. Click on your deployed web service in Railway.
2. Go to the **Variables** tab.
3. Click **Add Reference** and select the MySQL service variables (or add `DATABASE_URL` referencing `${{MySQL.MYSQL_URL}}`).
4. Under **Settings** → **Networking**, click **Generate Domain** to get your public HTTPS URL (e.g. `https://campus-maintenance.up.railway.app`).

### Step 5: Seed the Database
In Railway, open your web service → **Deployments** → **View Logs** or click the **Command Palette (Ctrl+K) / Terminal** tab:
```bash
npm run db:init
```
This automatically creates all tables and populates default accounts (`admin`, `student1`, `faculty1`, etc.).

---

## 🌐 Option 2: Render + TiDB Cloud / Aiven (Free Tier)

### Step 1: Create Free Cloud MySQL
1. Sign up for [TiDB Cloud Serverless](https://tidbcloud.com/) or [Aiven MySQL](https://aiven.io/) (free tiers).
2. Create a MySQL cluster and copy the connection string:
   `mysql://username:password@host:port/database`

### Step 2: Deploy Web Service on Render
1. Sign up on [render.com](https://render.com).
2. Click **New +** → **Web Service**.
3. Connect your GitHub repository.
4. Set:
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `node initDb.js && node server.js`
5. In **Environment Variables**, add:
   - `DATABASE_URL`: `mysql://username:password@host:port/database`
   - `DB_SSL`: `true`
   - `PORT`: `3000`
6. Click **Deploy Web Service**.

---

## 🐳 Option 3: Docker Deployment

A `Dockerfile` is already provided in the repository root.

```bash
# Build Docker image
docker build -t campus-maintenance .

# Run Docker container
docker run -p 3000:3000 \
  -e DB_HOST=your-mysql-host \
  -e DB_USER=your-user \
  -e DB_PASSWORD=your-password \
  -e DB_NAME=campus_maintenance \
  campus-maintenance
```

---

## 🔑 Default Login Credentials

| Role | Username | Password | Email |
| :--- | :--- | :--- | :--- |
| **Admin** | `admin` | `adminpass` | `admin@campus.edu` |
| **Student** | `student1` | `pass` | `student1@campus.edu` |
| **Faculty** | `faculty1` | `pass` | `faculty1@campus.edu` |
| **Maintenance** | `maint1` | `pass` | `maint1@campus.edu` |
| **Maintenance** | `maint2` | `pass` | `maint2@campus.edu` |

