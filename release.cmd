@echo off
rem Publishes a new version: bumps the build number, commits, tags and pushes.
rem GitHub then builds the .exe and publishes the release;
rem running copies update themselves to it.
rem Build numbers go by day: the first release of a day gets the next whole number (67), and later releases
rem the same day add .1, .2... to it (67.1, 67.2). The next day starts at 68.
rem Usage:  release.cmd "What changed in this build"
rem Needs: Node.js and Git (signed in to GitHub).
cd /d "%~dp0"
if "%~1"=="" ( echo Usage: release.cmd "What changed" & exit /b 1 )
node -e "const f='version.json',fs=require('fs'),v=JSON.parse(fs.readFileSync(f,'utf8')),d=new Date(),today=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');if(v.date===today){v.patch=(v.patch||0)+1}else{v.build++;v.patch=0}v.date=today;fs.writeFileSync(f,JSON.stringify(v)+'\n')" || exit /b 1
for /f %%v in ('node -p "require('./version.json').version"') do set VER=%%v
for /f %%b in ('node -p "const v=require('./version.json');v.build+(v.patch?'.'+v.patch:'')"') do set BUILD=%%b
set TAG=v%VER%.%BUILD%
git add -A || exit /b 1
git commit -m "Build %BUILD%: %~1" || exit /b 1
git tag -a %TAG% -m "%~1" || exit /b 1
git push origin HEAD %TAG% || exit /b 1
echo.
echo Pushed %TAG%. GitHub is building and publishing it (about 2-3 minutes):
echo   https://github.com/krabbzdev/KrabbzDev-PlaneTracker1/actions
