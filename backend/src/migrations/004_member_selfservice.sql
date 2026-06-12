-- Migration 004: Member Self-Service
-- Loan applications, member statement view, contribution due tracking

-- ── 1. Loan applications ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS loan_applications (
  id               SERIAL PRIMARY KEY,
  group_id         INTEGER       NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  member_id        INTEGER       NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  amount_requested DECIMAL(14,2) NOT NULL,
  purpose          TEXT,
  repayment_months INTEGER       NOT NULL DEFAULT 3,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  reviewed_by      INTEGER       REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at      TIMESTAMPTZ,
  review_notes     TEXT,
  -- if approved, the resulting loan id
  loan_id          INTEGER       REFERENCES loans(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_loan_apps_group  ON loan_applications (group_id);
CREATE INDEX IF NOT EXISTS idx_loan_apps_member ON loan_applications (member_id);
CREATE INDEX IF NOT EXISTS idx_loan_apps_status ON loan_applications (group_id, status);

-- ── 2. Contribution due dates ──────────────────────────────────────────────
-- Tracks expected contribution per member per period so we can detect missed payments
CREATE TABLE IF NOT EXISTS contribution_dues (
  id           SERIAL PRIMARY KEY,
  group_id     INTEGER       NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  member_id    INTEGER       NOT NULL REFERENCES members(id)  ON DELETE CASCADE,
  due_date     DATE          NOT NULL,
  amount_due   DECIMAL(14,2) NOT NULL,
  amount_paid  DECIMAL(14,2) NOT NULL DEFAULT 0,
  status       VARCHAR(20)   NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','paid','overdue','waived')),
  fine_id      INTEGER       REFERENCES fines(id) ON DELETE SET NULL,  -- auto-fine link
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, member_id, due_date)
);
CREATE INDEX IF NOT EXISTS idx_dues_group  ON contribution_dues (group_id);
CREATE INDEX IF NOT EXISTS idx_dues_member ON contribution_dues (member_id);
CREATE INDEX IF NOT EXISTS idx_dues_status ON contribution_dues (group_id, status, due_date);

-- ── 3. Add overdue tracking columns to loans ───────────────────────────────
ALTER TABLE loans
  ADD COLUMN IF NOT EXISTS overdue_flagged_at  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS penalty_total       DECIMAL(14,2) NOT NULL DEFAULT 0;
