@echo off
setlocal

echo ================================================================
echo  Campus Maintenance Management System
echo  Backend: Node.js + Express   Database: MySQL
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

:: Try node in PATH first
where node >nul 2>nul
if %ERRORLEVEL% EQU 0 (
    echo Starting server with system Node.js...
    node server.js
    goto :eof
)

:: Fallback: bundled OpenAI Codex node
set "NODE_EXE=C:\Users\SINDHUJA-PC\AppData\Local\OpenAI\Codex\runtimes\cua_node\a708e72b10c27b59\bin\node.exe"
if exist "%NODE_EXE%" (
    echo Starting server with bundled Node.js...
    "%NODE_EXE%" server.js
    goto :eof
)

set "NODE_EXE_2=C:\Users\SINDHUJA-PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
if exist "%NODE_EXE_2%" (
    echo Starting server with bundled Node.js (cache)...
    "%NODE_EXE_2%" server.js
    goto :eof
)

echo [ERROR] Node.js not found. Please install Node.js from https://nodejs.org
pause
