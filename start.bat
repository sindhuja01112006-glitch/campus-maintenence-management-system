@echo off
setlocal

echo ================================================================
echo  Campus Maintenance Management System (FixPoint)
echo  Backend: Node.js + Express   Database: MySQL
echo  Email Service: Active (Transactional Notifications and Logs)
echo ================================================================
echo.

:: Ensure .env exists
if not exist ".env" (
    echo [WARN] .env file not found. Copying from .env.example...
    if exist ".env.example" (
        copy .env.example .env
    ) else (
        echo [ERROR] No .env or .env.example found. Please create .env with DB credentials.
        pause
        exit /b 1
    )
)

:: Check if MySQL is running; start XAMPP MySQL if installed
netstat -ano | findstr :3306 >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    if exist "C:\xampp\mysql_start.bat" (
        echo [INFO] Starting MySQL service via XAMPP...
        start "" "C:\xampp\mysql_start.bat"
        timeout /t 2 /nobreak >nul
    ) else (
        echo [WARN] MySQL does not appear to be running on port 3306.
        echo        Make sure MySQL is started in XAMPP or your database service.
    )
)

:: Automatically open default browser after a brief delay
start "" cmd /c "timeout /t 2 /nobreak >nul & start http://localhost:3000"

:: Try node in PATH first
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Starting server with system Node.js on http://localhost:3000...
    node server.js
    pause
    goto :eof
)

:: Fallback 1: cached node in codex-primary-runtime
set "NODE_EXE_CACHE=C:\Users\SINDHUJA-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%NODE_EXE_CACHE%" (
    echo Starting server with cached Node.js runtime on http://localhost:3000...
    "%NODE_EXE_CACHE%" server.js
    pause
    goto :eof
)

:: Fallback 2: bundled OpenAI Codex node
set "NODE_EXE=C:\Users\SINDHUJA-PC\AppData\Local\OpenAI\Codex\runtimes\cua_node\5c41f77a7900391c\bin\node.exe"
if exist "%NODE_EXE%" (
    echo Starting server with bundled Node.js on http://localhost:3000...
    "%NODE_EXE%" server.js
    pause
    goto :eof
)

echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org
pause
