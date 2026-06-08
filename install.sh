#!/bin/bash
set -e

echo ""
echo "============================================"
echo " Challan Sender - UP Traffic Department"
echo " Auto Installer (Mac / Linux)"
echo "============================================"
echo ""

# Check Node.js
echo "[1/3] Checking Node.js..."
if ! command -v node &> /dev/null; then
    echo ""
    echo " ERROR: Node.js is NOT installed!"
    echo " Install from: https://nodejs.org (LTS version)"
    exit 1
fi
echo " Found: $(node --version)"

# Check npm
echo "[2/3] Checking npm..."
if ! command -v npm &> /dev/null; then
    echo " ERROR: npm not found."
    exit 1
fi

# Install dependencies
echo "[3/3] Installing dependencies..."
npm install --legacy-peer-deps

echo ""
echo "============================================"
echo " Installation Complete!"
echo "============================================"
echo ""
echo " To START: npm start"
echo " To BUILD: npm run build-mac  (Mac)"
echo "           npm run build-linux (Linux)"
echo ""
