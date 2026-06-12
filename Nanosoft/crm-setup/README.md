# Nanosoft × Twenty CRM — Setup Scripts

Configures a fresh Twenty v2.6 instance for Nanosoft Technology via the Metadata and Core APIs.
Requires **Node 18+** (uses built-in `fetch` — no npm install needed).

---

## Quick Start

### 1. Get your API Key

1. Open **http://192.168.30.40:3000** in your browser
2. Complete workspace setup (name it **Nanosoft Technology**)
3. Go to **Settings → API & Webhooks → + Create Key**
4. Name it `nanosoft-setup`, copy the key immediately

### 2. Paste the key into config.js

Open `config.js` and replace `PASTE_YOUR_API_KEY_HERE` with your key.

### 3. Run the scripts in order

```bash
# From this folder (WSL terminal or PowerShell):
node 01-create-objects.js   # Creates custom objects, fields, relations, pipeline stages
node 02-seed-data.js        # Seeds NanoProduct records, reference clients, sample data
node 03-verify.js           # Confirms everything is set up correctly
```

---

## What each script does

| Script | What it creates |
|--------|----------------|
| `01-create-objects.js` | 4 custom objects + all fields + relations + pipeline stages |
| `02-seed-data.js` | 6 NanoProduct records, 4 reference companies, 3 sample licences, 4 pipeline opportunities |
| `03-verify.js` | Read-only check — confirms objects, records, and stages exist |

---

## Objects Created

| Object | Fields | Relations |
|--------|--------|-----------|
| **NanoProduct** | productCategory, deploymentType, currentVersion, annualSupportFee, productStatus | — |
| **ClientLicence** | licenceNumber, licenceType, startDate, renewalDate, licenceStatus, numberOfUsers, annualValue, notes | → Company, → NanoProduct |
| **SupportTicket** | ticketRef, priority, status, issueDescription, resolutionDate, resolutionNotes | → Company, → NanoProduct, → Person (assignedEngineer) |
| **ProjectDeliverable** | deliverableTitle, deliverableType, plannedDate, deliverableStatus, deliverableNotes | → Company |

---

## Pipeline Stages Configured

**New Licence pipeline:**
Lead / Enquiry → Needs Discovery → Demo / PoC → Proposal Sent → Negotiation → Contract Signed — Won → Lost / Deferred

**Renewal pipeline:**
Renewal Due — 60 Days → Renewal Contacted → Invoice Raised → Renewed — Paid → Churned / Non-Renewal

---

## Troubleshooting

**`API_KEY` error** — edit config.js and paste your key.

**`object-ids.json not found`** — run `01-create-objects.js` first.

**`401 Unauthorized`** — key is wrong or expired; create a new one in Settings → API & Webhooks.

**`409 Conflict` on object creation** — object already exists. Safe to ignore; the script continues.

**`404` on `/rest/nanoProducts`** — objects not created yet; run script 01 first.

---

## Next steps after setup

1. **Import your full client list** — export from your current system as CSV, import via Settings → Import
2. **Connect email** — Settings → Accounts → Connect Google Workspace
3. **Configure workflows** — Settings → Workflows (see Implementation Guide for the 5 core workflows)
4. **Invite team members** — Settings → Members → Invite
