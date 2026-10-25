@echo off
rem Builds Krabbz9999-FlightTracker.exe: Node.js + server.js + index.html in one file.
rem Re-run this after changing server.js or index.html. Each run bumps the build number in version.json.
cd /d "%~dp0"
if not exist build mkdir build
node -e "const f='version.json',fs=require('fs'),v=JSON.parse(fs.readFileSync(f,'utf8'));v.build++;v.date=new Date().toISOString().slice(0,10);fs.writeFileSync(f,JSON.stringify(v)+'\n');console.log('Version '+v.version+' build '+v.build)" || goto :fail
node --experimental-sea-config sea-config.json || goto :fail
copy /y "%ProgramFiles%\nodejs\node.exe" Krabbz9999-FlightTracker.exe >nul || goto :fail
call npx --yes postject@1.0.0-alpha.6 Krabbz9999-FlightTracker.exe NODE_SEA_BLOB build\sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 || goto :fail
echo.
echo Built Krabbz9999-FlightTracker.exe
exit /b 0
:fail
echo Build failed.
exit /b 1
