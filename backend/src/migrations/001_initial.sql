-- ============================================================
-- Chama / Welfare / Hybrid / Selfhelp Group Platform
-- PostgreSQL Migration 001 — Initial Schema
-- ============================================================

-- ── Group ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS groups (
  id               SERIAL PRIMARY KEY,
  name             TEXT        NOT NULL,
  type             TEXT        NOT NULL CHECK (type IN ('chama','welfare','hybrid','selfhelp')),
  registration_no  TEXT,
  description      TEXT,
  logo_url         TEXT,
  founded_date     DATE,
  currency         TEXT        NOT NULL DEFAULT 'KES',
  -- Meeting defaults
  meeting_day      TEXT,                         -- e.g. 'first_sunday'
  meeting_time     TEXT        DEFAULT '15:00',
  meeting_venue    TEXT,
  -- Chama-specific defaults
  mgr_pool_amount  NUMERIC(14,2) DEFAULT 0,
  mgr_member_count INT           DEFAULT 2,      -- recipients per month
  -- Contact
  phone            TEXT,
  email            TEXT,
  -- Status
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Users (auth + roles) ──────────────────────────────────────
-- One user account per person.  A member row links to user.
CREATE TABLE IF NOT EXISTS users (
  id             SERIAL PRIMARY KEY,
  group_id       INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name           TEXT        NOT NULL,
  email          TEXT        UNIQUE,
  phone          TEXT,
  id_number      TEXT,                           -- national ID
  role           TEXT        NOT NULL DEFAULT 'member'
                   CHECK (role IN ('admin','treasurer','secretary','member')),
  password_hash  TEXT        NOT NULL,
  active         BOOLEAN     NOT NULL DEFAULT TRUE,
  joined_date    DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Members (financial profile, linked to user) ───────────────
-- Separate from users so financial data is cleanly isolated.
CREATE TABLE IF NOT EXISTS members (
  id               SERIAL PRIMARY KEY,
  group_id         INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id          INT         UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  name             TEXT        NOT NULL,
  phone            TEXT,
  email            TEXT,
  id_number        TEXT,
  -- Chama / Hybrid / Selfhelp balances
  capital          NUMERIC(14,2) NOT NULL DEFAULT 0,
  security         NUMERIC(14,2) NOT NULL DEFAULT 0,
  personal_savings NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Welfare balance
  welfare_balance  NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Fines owed
  total_fines      NUMERIC(14,2) NOT NULL DEFAULT 0,
  -- Loan flag: limit reduced due to extension
  limit_reduced    BOOLEAN     NOT NULL DEFAULT FALSE,
  active           BOOLEAN     NOT NULL DEFAULT TRUE,
  notes            TEXT,
  joined_date      DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Group Rules ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS rules (
  id              SERIAL PRIMARY KEY,
  group_id        INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  rule_number     TEXT        NOT NULL,          -- '01', '02', …
  category        TEXT        NOT NULL DEFAULT 'general'
                    CHECK (category IN ('general','contributions','loans','mgr','welfare','fines','meetings','projects','other')),
  title           TEXT,
  description     TEXT        NOT NULL,
  penalty_amount  NUMERIC(14,2),                 -- if applicable
  applies_to      TEXT        NOT NULL DEFAULT 'all'
                    CHECK (applies_to IN ('all','chama','welfare','selfhelp','hybrid')),
  active          BOOLEAN     NOT NULL DEFAULT TRUE,
  effective_date  DATE        NOT NULL DEFAULT CURRENT_DATE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Contributions ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contributions (
  id           SERIAL PRIMARY KEY,
  group_id     INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id    INT         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount       NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  type         TEXT        NOT NULL
                 CHECK (type IN ('capital','security','mgr','welfare','personal_savings','project','other')),
  month        INT         CHECK (month BETWEEN 1 AND 12),
  year         INT,
  status       TEXT        NOT NULL DEFAULT 'paid'
                 CHECK (status IN ('paid','pending','waived')),
  reference    TEXT,                             -- M-Pesa ref, receipt no, etc.
  notes        TEXT,
  recorded_by  INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Loans ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loans (
  id                        SERIAL PRIMARY KEY,
  group_id                  INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id                 INT         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  principal                 NUMERIC(14,2) NOT NULL CHECK (principal > 0),
  interest_rate             NUMERIC(5,2)  NOT NULL DEFAULT 20.00,   -- %
  total_repayable           NUMERIC(14,2) NOT NULL,
  amount_remaining          NUMERIC(14,2) NOT NULL,
  status                    TEXT        NOT NULL DEFAULT 'active'
                              CHECK (status IN ('pending','active','extended','overdue','cleared','rejected')),
  extended                  BOOLEAN     NOT NULL DEFAULT FALSE,
  limit_reduced_by_extension BOOLEAN    NOT NULL DEFAULT FALSE,
  purpose                   TEXT,
  issued_date               DATE        NOT NULL DEFAULT CURRENT_DATE,
  due_date                  DATE,
  cleared_date              DATE,
  approved_by               INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Loan Repayments ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_repayments (
  id          SERIAL PRIMARY KEY,
  loan_id     INT         NOT NULL REFERENCES loans(id) ON DELETE CASCADE,
  amount      NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference   TEXT,
  notes       TEXT,
  recorded_by INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── MGR (Merry-Go-Round) Schedule ─────────────────────────────
CREATE TABLE IF NOT EXISTS mgr_schedule (
  id           SERIAL PRIMARY KEY,
  group_id     INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  month_index  INT         NOT NULL,             -- 1, 2, 3, …
  month        TEXT        NOT NULL,             -- 'January 2025'
  member1_id   INT         REFERENCES members(id) ON DELETE SET NULL,
  member2_id   INT         REFERENCES members(id) ON DELETE SET NULL,
  pool_amount  NUMERIC(14,2) NOT NULL DEFAULT 100000,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','skipped')),
  paid_date    DATE,
  notes        TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Fines ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fines (
  id           SERIAL PRIMARY KEY,
  group_id     INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id    INT         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  type         TEXT        NOT NULL DEFAULT 'other'
                 CHECK (type IN ('lateness','absence','rule_violation','loan_default','other')),
  amount       NUMERIC(14,2) NOT NULL CHECK (amount >= 0),
  reason       TEXT,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','waived')),
  meeting_date DATE,
  recorded_by  INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Meetings ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS meetings (
  id           SERIAL PRIMARY KEY,
  group_id     INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  meeting_date DATE        NOT NULL,
  meeting_type TEXT        NOT NULL DEFAULT 'regular'
                 CHECK (meeting_type IN ('regular','special','emergency','agm')),
  venue        TEXT,
  agenda       TEXT,
  minutes      TEXT,
  quorum_met   BOOLEAN,
  chaired_by   TEXT,
  created_by   INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Meeting Attendance ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS attendance (
  id          SERIAL PRIMARY KEY,
  meeting_id  INT         NOT NULL REFERENCES meetings(id) ON DELETE CASCADE,
  member_id   INT         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  status      TEXT        NOT NULL DEFAULT 'absent'
                CHECK (status IN ('present','absent','late','excused')),
  fine_issued BOOLEAN     NOT NULL DEFAULT FALSE,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (meeting_id, member_id)
);

-- ── Welfare Claims (welfare / hybrid groups) ──────────────────
CREATE TABLE IF NOT EXISTS welfare_claims (
  id               SERIAL PRIMARY KEY,
  group_id         INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  member_id        INT         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  -- Claims can be for a member or their immediate family
  beneficiary_name TEXT,
  beneficiary_rel  TEXT,                         -- 'self','spouse','child','parent','sibling'
  claim_type       TEXT        NOT NULL DEFAULT 'other'
                     CHECK (claim_type IN ('medical','bereavement','emergency','education','maternity','disability','other')),
  amount_requested NUMERIC(14,2) NOT NULL,
  amount_approved  NUMERIC(14,2),
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','under_review','approved','rejected','disbursed')),
  description      TEXT,
  supporting_docs  TEXT,                         -- comma-sep file paths or URLs
  reviewed_by      INT         REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  disbursed_at     TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Projects (selfhelp / hybrid groups) ──────────────────────
CREATE TABLE IF NOT EXISTS projects (
  id               SERIAL PRIMARY KEY,
  group_id         INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  name             TEXT        NOT NULL,
  description      TEXT,
  target_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  collected_amount NUMERIC(14,2) NOT NULL DEFAULT 0,
  status           TEXT        NOT NULL DEFAULT 'planning'
                     CHECK (status IN ('planning','active','on_hold','completed','cancelled')),
  start_date       DATE,
  end_date         DATE,
  created_by       INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Project Contributions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS project_contributions (
  id         SERIAL PRIMARY KEY,
  project_id INT         NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  member_id  INT         NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  amount     NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  reference  TEXT,
  notes      TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Announcements ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS announcements (
  id         SERIAL PRIMARY KEY,
  group_id   INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  title      TEXT        NOT NULL,
  content    TEXT        NOT NULL,
  pinned     BOOLEAN     NOT NULL DEFAULT FALSE,
  created_by INT         REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_users_group       ON users(group_id);
CREATE INDEX IF NOT EXISTS idx_members_group     ON members(group_id);
CREATE INDEX IF NOT EXISTS idx_contributions_member ON contributions(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_member      ON loans(member_id);
CREATE INDEX IF NOT EXISTS idx_loans_status      ON loans(status);
CREATE INDEX IF NOT EXISTS idx_fines_member      ON fines(member_id);
CREATE INDEX IF NOT EXISTS idx_fines_status      ON fines(status);
CREATE INDEX IF NOT EXISTS idx_welfare_member    ON welfare_claims(member_id);
CREATE INDEX IF NOT EXISTS idx_welfare_status    ON welfare_claims(status);
CREATE INDEX IF NOT EXISTS idx_attendance_meeting ON attendance(meeting_id);
CREATE INDEX IF NOT EXISTS idx_mgr_group         ON mgr_schedule(group_id);
