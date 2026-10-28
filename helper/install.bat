@echo off
cd /d "%~dp0"
echo Installing the input helper (one time)...
call npm install
echo.
echo Done. Now run start-helper.bat
pause
