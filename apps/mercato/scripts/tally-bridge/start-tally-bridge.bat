@echo off
REM Creative Carbon ERP -> Tally bridge. Fill in the two lines below once, then double-click this file.
REM Needs Node.js 18 or newer (https://nodejs.org). Keep the window open while Accounts works.
set ERP_URL=https://your-erp-address
set BRIDGE_KEY=paste-the-key-from-the-Tally-page
set TALLY_URL=http://localhost:9000
node "%~dp0tally-bridge.mjs"
pause
