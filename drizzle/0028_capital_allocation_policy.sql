-- Nullable/unset means the group hasn't configured a capital-allocation
-- policy yet — lib/domain/capital.ts's computeAllocationDrift returns null
-- (no flag raised) rather than assuming a default on the group's behalf.
-- No new table or RLS policy needed: this is a plain column on `groups`,
-- already covered by the existing groups RLS policies.
ALTER TABLE "groups" ADD COLUMN "target_loan_deployment_pct" numeric(5, 2);