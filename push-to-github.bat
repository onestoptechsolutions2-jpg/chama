@echo off
echo === Chama — Push to GitHub ===
cd /d "%~dp0"

REM Fix corrupted git config
echo [core] > .git\config
echo     repositoryformatversion = 0 >> .git\config
echo     filemode = false >> .git\config
echo     bare = false >> .git\config
echo     logallrefupdates = true >> .git\config
echo [remote "origin"] >> .git\config
echo     url = https://github.com/onestoptechsolutions2-jpg/chama.git >> .git\config
echo     fetch = +refs/heads/*:refs/remotes/origin/* >> .git\config
echo [branch "main"] >> .git\config
echo     remote = origin >> .git\config
echo     merge = refs/heads/main >> .git\config

REM Delete stale lock file if present
if exist .git\config.lock del /f .git\config.lock

git config user.email "billominde@gmail.com"
git config user.name "OneStop"

git add -A
git commit -m "feat: PostgreSQL backend + Docker/Coolify deployment

- Replace Strapi CMS with Node.js/Express + PostgreSQL
- Support 4 group types: chama, welfare, hybrid, selfhelp
- JWT auth, role-based access (admin/treasurer/secretary/member)
- Auto-migrate + bootstrap default group + admin on startup
- In-app user management page
- Docker Compose for Coolify deployment (postgres + backend + frontend/nginx)
- Meetings page, Welfare, Projects, dynamic Rules
- Default admin from env vars (ADMIN_EMAIL / ADMIN_PASSWORD)"

git push -u origin main
echo.
echo === Done! Check https://github.com/onestoptechsolutions2-jpg/chama ===
pause
