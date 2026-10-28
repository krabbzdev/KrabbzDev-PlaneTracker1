@echo off
rem Publishes a new version: bumps the build number, commits, tags and pushes.
rem GitHub then builds the .exe and publishes the release;
rem running copies update themselves to it.
rem Usage:  release.cmd "What changed in this build"
rem Needs: Node.js and Git (signed in to GitHub).
cd /d "%~dp0"
if "%~1"=="" ( echo Usage: release.cmd "What changed" & exit /b 1 )
node -e "const f='version.json',fs=require('fs'),v=JSON.parse(fs.readFileSync(f,'utf8'));v.build++;v.date=new Date().toISOString().slice(0,10);fs.writeFileSync(f,JSON.stringify(v)+'\n')" || exit /b 1
for /f %%v in ('node -p "require('./version.json').version"') do set VER=%%v
for /f %%b in ('node -p "require('./version.json').build"') do set BUILD=%%b
set TAG=v%VER%.%BUILD%
git add -A || exit /b 1
git commit -m "Build %BUILD%: %~1" || exit /b 1
git tag -a %TAG% -m "%~1" || exit /b 1
git push origin HEAD %TAG% || exit /b 1
echo.
echo Pushed %TAG%. GitHub is building and publishing it (about 2-3 minutes):
echo   https://github.com/krabbzdev/KrabbzDev-PlaneTracker1/actions
