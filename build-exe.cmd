@echo off
rem Builds Krabbz9999-FlightTracker.exe locally (Node.js + server.js + index.html in one file), for testing.
rem Published releases are built by GitHub instead: see release.cmd and .github/workflows/release.yml.
cd /d "%~dp0"
if not exist build mkdir build
node --experimental-sea-config sea-config.json || goto :fail
copy /y "%ProgramFiles%\nodejs\node.exe" Krabbz9999-FlightTracker.exe >nul || goto :fail
call npx --yes postject@1.0.0-alpha.6 Krabbz9999-FlightTracker.exe NODE_SEA_BLOB build\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 || goto :fail
echo.
echo Built Krabbz9999-FlightTracker.exe
exit /b 0
:fail
echo Build failed.
exit /b 1
