# Chama Manager — GitHub + Vercel Deployment Guide

Strapi backend: **https://chama.laitor.co.ke** (already live, no changes needed)  
Frontend will be deployed to: **Vercel** (free tier is fine)

---

## Part 1 — Push to GitHub

### Step 1 — Open your terminal and go into the frontend folder

```bash
cd chama/frontend
```

### Step 2 — Initialise Git and make your first commit

```bash
git init
git add .
git commit -m "Initial commit — Chama Manager frontend"
```

### Step 3 — Create a new repo on GitHub

1. Go to https://github.com/new
2. Name it: `chama-manager` (or anything you like)
3. Set it to **Private** (recommended — keeps your code secure)
4. **Do NOT** tick "Add README" or "Add .gitignore" — leave them blank
5. Click **Create repository**

### Step 4 — Connect and push

GitHub will show you commands after creating the repo. Run these:

```bash
git remote add origin https://github.com/YOUR_USERNAME/chama-manager.git
git branch -M main
git push -u origin main
```

Replace `YOUR_USERNAME` with your actual GitHub username.

✅ Your code is now on GitHub.

---

## Part 2 — Deploy on Vercel

### Step 1 — Create a Vercel account

Go to https://vercel.com and sign up — use **Continue with GitHub** so Vercel can access your repos automatically.

### Step 2 — Import your project

1. On the Vercel dashboard, click **Add New → Project**
2. Find `chama-manager` in the list and click **Import**

### Step 3 — Configure the build

Vercel will auto-detect it as a Vite project. Confirm these settings:

| Setting | Value |
|---|---|
| Framework Preset | **Vite** |
| Root Directory | `.` (leave as default) |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install` |

### Step 4 — Add Environment Variable

Click **Environment Variables** and add:

| Name | Value |
|---|---|
| `VITE_STRAPI_URL` | `https://chama.laitor.co.ke` |

> ⚠️ Important: Vite bakes this URL into the app at **build time**. You must add it here — not just in a file — so Vercel uses it when building.

### Step 5 — Deploy

Click **Deploy**. Vercel will:
- Install dependencies (`npm install`)
- Build the app (`npm run build`)
- Publish the `dist/` folder to a global CDN

After ~1 minute you'll get a URL like: `https://chama-manager-xxxx.vercel.app`

✅ Your app is live.

---

## Part 3 — Fix Strapi CORS

Since the app is now on a new domain (Vercel), you must tell Strapi to allow it.

### Update middlewares.js on your Strapi server

SSH into your server and edit:
`/path-to-strapi/config/middlewares.js`

Add your Vercel URL to the `origin` array:

```js
module.exports = ({ env }) => [
  'strapi::errors',
  {
    name: 'strapi::cors',
    config: {
      origin: [
        'https://chama-manager-xxxx.vercel.app',  // ← your Vercel URL
        'https://your-custom-domain.com',          // ← if you add a custom domain later
        'http://localhost:5173',                   // ← local dev
      ],
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      headers: ['Content-Type', 'Authorization'],
    },
  },
  'strapi::security',
  'strapi::poweredBy',
  'strapi::logger',
  'strapi::query',
  'strapi::body',
  'strapi::session',
  'strapi::favicon',
  'strapi::public',
]
```

Then restart Strapi:
```bash
pm2 restart strapi   # if using PM2
# or
npm run start        # if running directly
```

---

## Part 4 — Get your API Token from Strapi

1. Go to https://chama.laitor.co.ke/admin
2. **Settings → API Tokens → Create new API Token**
3. Settings:
   - Name: `chama-app`
   - Token type: `Custom`
   - Duration: `Unlimited`
4. Under permissions, enable **Full access** for:
   - Member, Loan, Contribution, MgrSchedule, Fine, Meeting
5. Click **Save** and **copy the token immediately** — it's only shown once

---

## Part 5 — Use the app

1. Open your Vercel URL
2. Paste the API token from Step 4
3. Select **Treasurer** or **Member**
4. Click **Launch App**

---

## Optional — Add a custom domain on Vercel

1. Vercel dashboard → your project → **Settings → Domains**
2. Add your domain e.g. `app.laitor.co.ke`
3. Add a CNAME record in your DNS: `app` → `cname.vercel-dns.com`
4. Remember to also add this domain to Strapi CORS (see Part 3)

---

## Every time you update the code

```bash
git add .
git commit -m "describe your change"
git push
```

Vercel automatically detects the push and redeploys within ~60 seconds. Zero extra steps.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| "CORS error" in browser console | Add your Vercel URL to Strapi `middlewares.js` and restart Strapi |
| "403 Forbidden" from API | Your token doesn't have permissions — check API Token settings in Strapi admin |
| Page shows blank after clicking a link | Make sure `vercel.json` is in the repo — it handles React Router |
| `VITE_STRAPI_URL` is empty in production | Add it as an Environment Variable in Vercel dashboard, then redeploy |
| Members list is empty | Go to Strapi admin → Members → check entries exist and are published |

