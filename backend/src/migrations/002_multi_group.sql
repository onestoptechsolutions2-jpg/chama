-- ============================================================
-- Migration 002 — Multi-group, Settings, Cycles, Payments
-- ============================================================

-- ── Make users.group_id nullable (users can exist without a group) ──
ALTER TABLE users ALTER COLUMN group_id DROP NOT NULL;
ALTER TABLE users ALTER COLUMN joined_date DROP NOT NULL;

-- ── Add rich settings + visibility columns to groups ──────────
ALTER TABLE groups ADD COLUMN IF NOT EXISTS description        TEXT;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS is_public          BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS require_approval   BOOLEAN     NOT NULL DEFAULT TRUE;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS max_members        INT;

-- Contribution settings
ALTER TABLE groups ADD COLUMN IF NOT EXISTS share_price            NUMERIC(14,2) NOT NULL DEFAULT 2000;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS shares_per_member      INT           NOT NULL DEFAULT 1;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS contribution_day       INT           NOT NULL DEFAULT 1;

-- Loan settings
ALTER TABLE groups ADD COLUMN IF NOT EXISTS loan_interest_rate     NUMERIC(5,2)  NOT NULL DEFAULT 20.00;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS loan_max_multiplier    NUMERIC(5,2)  NOT NULL DEFAULT 3.00;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS loan_repayment_months  INT           NOT NULL DEFAULT 6;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS loan_late_penalty      NUMERIC(14,2) NOT NULL DEFAULT 500;

-- MGR settings
ALTER TABLE groups ADD COLUMN IF NOT EXISTS mgr_fee_pct            NUMERIC(5,2)  NOT NULL DEFAULT 5.00;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS mgr_terms              TEXT;

-- Fine settings
ALTER TABLE groups ADD COLUMN IF NOT EXISTS fine_lateness          NUMERIC(14,2) NOT NULL DEFAULT 100;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS fine_absence           NUMERIC(14,2) NOT NULL DEFAULT 200;
ALTER TABLE groups ADD COLUMN IF NOT EXISTS fine_rule_violation    NUMERIC(14,2) NOT NULL DEFAULT 500;

-- Platform terms (written by platform owner)
ALTER TABLE groups ADD COLUMN IF NOT EXISTS platform_terms         TEXT;

-- ── Group memberships ─────────────────────────────────────────
-- One record per (user, group). Replaces hard group_id on users.
CREATE TABLE IF NOT EXISTS group_memberships (
  id           SERIAL PRIMARY KEY,
  user_id      INT         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  group_id     INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  role         TEXT        NOT NULL DEFAULT 'member'
                 CHECK (role IN ('admin','treasurer','secretary','member')),
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','active','rejected','suspended')),
  join_message TEXT,
  reviewed_by  INT         REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user  ON group_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_group ON group_memberships(group_id);
CREATE INDEX IF NOT EXISTS idx_memberships_status ON group_memberships(status);

-- ── MGR Cycles ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS mgr_cycles (
  id            SERIAL PRIMARY KEY,
  group_id      INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  cycle_number  INT         NOT NULL,
  status        TEXT        NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active','completed')),
  started_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at  TIMESTAMPTZ,
  notes         TEXT,
  UNIQUE (group_id, cycle_number)
);
CREATE INDEX IF NOT EXISTS idx_mgr_cycles_group ON mgr_cycles(group_id);

-- Add cycle_id to mgr_schedule
ALTER TABLE mgr_schedule ADD COLUMN IF NOT EXISTS cycle_id INT REFERENCES mgr_cycles(id) ON DELETE SET NULL;

-- ── MGR Agreements (T&Cs) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS mgr_agreements (
  id                       SERIAL PRIMARY KEY,
  user_id                  INT         NOT NULL REFERENCES users(id)  ON DELETE CASCADE,
  group_id                 INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  cycle_id                 INT         REFERENCES mgr_cycles(id)      ON DELETE SET NULL,
  platform_terms           BOOLEAN     NOT NULL DEFAULT FALSE,
  group_terms              BOOLEAN     NOT NULL DEFAULT FALSE,
  financial_acknowledged   BOOLEAN     NOT NULL DEFAULT FALSE,
  digital_signature        TEXT        NOT NULL,
  agreed_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_agreements_user  ON mgr_agreements(user_id);
CREATE INDEX IF NOT EXISTS idx_agreements_group ON mgr_agreements(group_id);

-- ── Platform Payments (5% MGR fee etc.) ──────────────────────
CREATE TABLE IF NOT EXISTS platform_payments (
  id               SERIAL PRIMARY KEY,
  group_id         INT         NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  mgr_schedule_id  INT         REFERENCES mgr_schedule(id)    ON DELETE SET NULL,
  amount           NUMERIC(14,2) NOT NULL,
  fee_pct          NUMERIC(5,2)  NOT NULL DEFAULT 5.00,
  phone            TEXT,
  mpesa_ref        TEXT,
  checkout_request_id TEXT,
  status           TEXT        NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','paid','failed','cancelled')),
  type             TEXT        NOT NULL DEFAULT 'mgr_fee'
                     CHECK (type IN ('mgr_fee','subscription','other')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payments_group  ON platform_payments(group_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON platform_payments(status);
