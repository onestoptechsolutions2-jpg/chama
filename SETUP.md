# Chama Platform — Setup Guide

## Prerequisites
- Node.js 18+
- PostgreSQL 14+ (running locally or hosted)

---

## 1. Database

```bash
# Create the database
psql -U postgres -c "CREATE DATABASE chama_db;"

# Run the migration (creates all tables)
cd backend
cp .env.example .env      # fill in DB_* and JWT_SECRET
npm install
npm run migrate
```

---

## 2. Backend

```bash
cd backend

# Configure .env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=chama_db
DB_USER=postgres
DB_PASSWORD=yourpassword
JWT_SECRET=a_long_random_string_here
PORT=4000
CORS_ORIGINS=http://localhost:5173

# Seed demo data (pick your group type)
GROUP_TYPE=chama npm run seed
# or: GROUP_TYPE=welfare npm run seed
# or: GROUP_TYPE=hybrid  npm run seed
# or: GROUP_TYPE=selfhelp npm run seed

# Start dev server
npm run dev
```

Default admin login after seeding:
- Email: `admin@chama.local`
- Password: `Admin1234!`

Member login example:
- Email: `alice.wanjiku@chama.local`
- Password: `Member1234!`

---

## 3. Frontend

```bash
cd frontend
npm install
npm run dev      # opens http://localhost:5173
```

The Vite dev server proxies all `/api` calls to `http://localhost:4000` automatically.

---

## Group Types & Features

| Feature              | Chama | Welfare | Hybrid | Selfhelp |
|----------------------|-------|---------|--------|----------|
| Members & profiles   | ✅    | ✅      | ✅     | ✅       |
| Contributions        | ✅    | ✅      | ✅     | ✅       |
| Dynamic rules        | ✅    | ✅      | ✅     | ✅       |
| Meetings & attendance| ✅    | ✅      | ✅     | ✅       |
| Fines (auto on late) | ✅    | ✅      | ✅     | ✅       |
| Loans (20% interest) | ✅    | ❌      | ✅     | ✅       |
| MGR / merry-go-round | ✅    | ❌      | ✅     | ❌       |
| Welfare claims       | ❌    | ✅      | ✅     | ❌       |
| Projects             | ❌    | ❌      | ✅     | ✅       |

---

## Roles

| Role        | Can do |
|-------------|--------|
| `admin`     | Everything: group settings, user management, CRUD on all data, rules |
| `treasurer` | Financial operations: loans, contributions, fines, MGR, welfare |
| `secretary` | Meetings, attendance, announcements |
| `member`    | View own profile, submit welfare claims, view rules/MGR |

---

## API Endpoints Summary

```
POST   /api/auth/login
GET    /api/auth/me
GET    /api/group
PUT    /api/group               (admin)
GET    /api/users               (admin)
POST   /api/users               (admin)
GET    /api/members
POST   /api/members             (admin/treasurer)
PUT    /api/members/:id
GET    /api/contributions
POST   /api/contributions       (admin/treasurer)
GET    /api/contributions/summary
GET    /api/loans
POST   /api/loans               (admin/treasurer)
PUT    /api/loans/:id           (admin/treasurer)
POST   /api/loans/:id/repay     (admin/treasurer)
GET    /api/mgr
POST   /api/mgr                 (admin/treasurer)
PUT    /api/mgr/:id             (admin/treasurer)
GET    /api/fines
POST   /api/fines               (admin/treasurer/secretary)
PUT    /api/fines/:id           (admin/treasurer)
GET    /api/meetings
POST   /api/meetings            (admin/secretary/treasurer)
GET    /api/meetings/:id/attendance
POST   /api/meetings/:id/attendance  (auto-creates fines)
GET    /api/welfare
POST   /api/welfare
PUT    /api/welfare/:id         (admin/treasurer)
GET    /api/welfare/fund
GET    /api/projects
POST   /api/projects            (admin/treasurer)
POST   /api/projects/:id/contributions
GET    /api/rules
POST   /api/rules               (admin)
PUT    /api/rules/:id           (admin)
DELETE /api/rules/:id           (admin, soft-delete)
GET    /api/dashboard
```

---

## Production Deployment

1. Set `NODE_ENV=production` and `CORS_ORIGINS=https://your-frontend.com` in backend `.env`
2. Build frontend: `cd frontend && npm run build`
3. Set `VITE_API_URL=https://your-backend.com` in frontend `.env` before building
4. Serve the `dist/` folder from any static host (Vercel, Netlify, etc.)
5. Host the backend on Railway, Render, Fly.io, or your own VPS
