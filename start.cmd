@echo off
rem Starts Krabbz9999 - FlightTracker from source (needs Node.js) and opens it in your browser.
cd /d "%~dp0"
start "" http://localhost:8090
node server.js
