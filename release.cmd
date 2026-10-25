@echo off
rem Builds a new .exe and publishes it as a GitHub Release. Running copies update themselves to it.
rem Usage:  release.cmd "What changed in this build"
rem Needs: Node.js, Git and the GitHub CLI (signed in with: gh auth login).
cd /d "%~dp0"
if "%~1"=="" ( echo Usage: release.cmd "What changed" & exit /b 1 )
call build-exe.cmd || exit /b 1
for /f %%v in ('node -p "require('./version.json').version"') do set VER=%%v
for /f %%b in ('node -p "require('./version.json').build"') do set BUILD=%%b
set TAG=v%VER%.%BUILD%
git add -A || exit /b 1
git commit -m "Build %BUILD%: %~1" || exit /b 1
git tag %TAG% || exit /b 1
git push origin HEAD %TAG% || exit /b 1
gh release create %TAG% Krabbz9999-FlightTracker.exe --title "Krabbz9999 - FlightTracker %VER% build %BUILD%" --notes "%~1" || exit /b 1
echo.
echo Released %TAG% - running copies will update within 6 hours (or use Settings, Check for updates).
