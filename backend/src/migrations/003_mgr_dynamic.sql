-- Migration 003: Dynamic MGR Cycles
-- Supports flexible frequency, multiple recipients per cycle, member multi-turns

-- ── 1. Extend groups table with MGR config ─────────────────────────────────
ALTER TABLE groups
  ADD COLUMN IF NOT EXISTS mgr_frequency         VARCHAR(20)    DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS mgr_cycle_day         INTEGER        DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mgr_recipients_per_cycle INTEGER     DEFAULT 1,
  ADD COLUMN IF NOT EXISTS mgr_start_date        DATE,
  ADD COLUMN IF NOT EXISTS mgr_contribution_amount DECIMAL(12,2);

-- ── 2. Extend mgr_cycles with schedule metadata ────────────────────────────
ALTER TABLE mgr_cycles
  ADD COLUMN IF NOT EXISTS scheduled_date        DATE,
  ADD COLUMN IF NOT EXISTS slot_count            INTEGER        DEFAULT 1,
  ADD COLUMN IF NOT EXISTS payout_per_slot       DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS total_contributions   DECIMAL(12,2);

-- Widen the status check to include 'planned' (used by the schedule generator)
ALTER TABLE mgr_cycles DROP CONSTRAINT IF EXISTS mgr_cycles_status_check;
ALTER TABLE mgr_cycles ADD CONSTRAINT mgr_cycles_status_check
  CHECK (status IN ('active','planned','completed','closed'));

-- ── 3. Member turns table ──────────────────────────────────────────────────
-- Tracks how many turns each member has requested / been assigned
CREATE TABLE IF NOT EXISTS mgr_member_turns (
  id                   SERIAL PRIMARY KEY,
  group_id             INTEGER       NOT NULL REFERENCES groups(id)  ON DELETE CASCADE,
  member_id            INTEGER       NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  turns_total          INTEGER       NOT NULL DEFAULT 1,
  contribution_multiplier DECIMAL(5,2) NOT NULL DEFAULT 1.0,
  status               VARCHAR(20)   NOT NULL DEFAULT 'active',
  created_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, member_id)
);

-- ── 4. MGR slots table ─────────────────────────────────────────────────────
-- One row per recipient slot within a cycle (cycle may have 1..N slots)
CREATE TABLE IF NOT EXISTS mgr_slots (
  id             SERIAL PRIMARY KEY,
  group_id       INTEGER      NOT NULL REFERENCES groups(id)   ON DELETE CASCADE,
  cycle_id       INTEGER               REFERENCES mgr_cycles(id) ON DELETE SET NULL,
  cycle_number   INTEGER      NOT NULL,
  slot_number    INTEGER      NOT NULL,           -- 1..recipients_per_cycle
  member_id      INTEGER               REFERENCES members(id)  ON DELETE SET NULL,
  status         VARCHAR(20)  NOT NULL DEFAULT 'open',
  -- open | claimed | auto_assigned | paid | skipped
  payout_amount  DECIMAL(12,2),
  scheduled_date DATE,
  claimed_at     TIMESTAMPTZ,
  paid_at        TIMESTAMPTZ,
  created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, cycle_number, slot_number)
);

-- ── 5. Indexes ─────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_mgr_slots_group    ON mgr_slots (group_id);
CREATE INDEX IF NOT EXISTS idx_mgr_slots_member   ON mgr_slots (member_id);
CREATE INDEX IF NOT EXISTS idx_mgr_slots_status   ON mgr_slots (group_id, status);
CREATE INDEX IF NOT EXISTS idx_mgr_turns_group    ON mgr_member_turns (group_id);
CREATE INDEX IF NOT EXISTS idx_mgr_turns_member   ON mgr_member_turns (member_id);
