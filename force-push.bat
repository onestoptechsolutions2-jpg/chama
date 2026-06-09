@echo off
cd /d "%~dp0"
echo Force pushing to GitHub...
git push origin main --force
echo.
echo === Done! ===
pause
