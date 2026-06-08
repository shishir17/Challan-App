@echo off
title Challan Sender - Installer
color 0A
echo.
echo  ============================================
echo   Challan Sender - UP Traffic Department
echo   Auto Installer
echo  ============================================
echo.

:: Check Node.js
echo [1/4] Checking Node.js...
node --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Node.js is NOT installed!
    echo.
    echo  Please install Node.js from: https://nodejs.org
    echo  Download the "LTS" version ^(e.g. 20.x^)
    echo  Then run this script again.
    echo.
    pause
    exit /b 1
)
FOR /F "tokens=*" %%i IN ('node --version') DO echo  Found: %%i

:: Check npm
echo [2/4] Checking npm...
npm --version >nul 2>&1
IF %ERRORLEVEL% NEQ 0 (
    echo  ERROR: npm not found. Reinstall Node.js.
    pause
    exit /b 1
)

:: Install dependencies
echo [3/4] Installing dependencies (this may take 2-5 minutes)...
echo       Please wait...
npm install --legacy-peer-deps
IF %ERRORLEVEL% NEQ 0 (
    echo.
    echo  ERROR: Failed to install dependencies.
    echo  Check your internet connection and try again.
    pause
    exit /b 1
)

echo [4/4] Done!
echo.
echo  ============================================
echo   Installation Complete!
echo  ============================================
echo.
echo  To START the app, run:   npm start
echo  To BUILD .exe installer: npm run build
echo.
pause
