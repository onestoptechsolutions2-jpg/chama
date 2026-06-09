@echo off
cd /d "%~dp0"
echo Committing and force pushing to GitHub...
git add docker-compose.yml
git commit -m "fix: remove version key from docker-compose for Coolify compatibility"
git push origin main --force
echo.
echo === Done! ===
pause
