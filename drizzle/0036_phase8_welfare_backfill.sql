-- Phase 8 backfill:
-- (a) every existing group with welfare enabled gets a default policy +
--     zeroed fund row immediately, rather than relying solely on the lazy
--     getOrCreateWelfarePolicy/getOrCreateWelfareFund upsert fail-safe the
--     first time a member touches the feature.
-- (b) welfare_claims history is migrated forward into welfare_requests (and
--     welfare_grants for anything that was actually disbursed) so it stays
--     queryable through the new model. welfare_claims itself is left in
--     place, untouched, as a read-only historical record — see
--     lib/db/schema.ts's comment on that table for why it isn't dropped.
--     Reserve bucketing is a best-effort heuristic, since the old model
--     never tracked which reserve funded a claim: claim_type = 'emergency'
--     maps to the emergency reserve, everything else to long-term.

INSERT INTO "welfare_policies" ("group_id")
SELECT "id" FROM "groups" WHERE "welfare_enabled" = true
ON CONFLICT ("group_id") DO NOTHING;

INSERT INTO "welfare_funds" ("group_id")
SELECT "id" FROM "groups" WHERE "welfare_enabled" = true
ON CONFLICT ("group_id") DO NOTHING;

INSERT INTO "welfare_requests" (
  "group_id", "member_id", "reason", "beneficiary_name", "beneficiary_rel",
  "description", "requested_emergency_amount", "requested_long_term_amount",
  "approved_emergency_amount", "approved_long_term_amount", "approval_tier",
  "status", "reviewed_by", "reviewed_at", "rejection_reason", "disbursed_at",
  "created_at", "updated_at"
)
SELECT
  "group_id",
  "member_id",
  "claim_type",
  "beneficiary_name",
  "beneficiary_rel",
  "description",
  CASE WHEN "claim_type" = 'emergency' THEN "amount_requested" ELSE 0 END,
  CASE WHEN "claim_type" != 'emergency' THEN "amount_requested" ELSE 0 END,
  CASE WHEN "claim_type" = 'emergency' THEN "amount_approved" ELSE NULL END,
  CASE WHEN "claim_type" != 'emergency' THEN "amount_approved" ELSE NULL END,
  'tier1',
  "status"::text::"welfare_request_status",
  "reviewed_by",
  "reviewed_at",
  "rejection_reason",
  "disbursed_at",
  "created_at",
  "updated_at"
FROM "welfare_claims";

-- Correlated back to the source claim by (group_id, member_id, created_at)
-- rather than an id — welfare_requests has no legacy-claim-id column, and
-- this triple is effectively unique for a claims table (two claims from the
-- same member in the same group at the exact same microsecond timestamp is
-- not realistic).
INSERT INTO "welfare_grants" ("group_id", "request_id", "emergency_amount", "long_term_amount", "disbursed_at", "disbursed_by")
SELECT
  wr."group_id",
  wr."id",
  COALESCE(wr."approved_emergency_amount", 0),
  COALESCE(wr."approved_long_term_amount", 0),
  COALESCE(wr."disbursed_at", wr."updated_at", now()),
  wr."reviewed_by"
FROM "welfare_requests" wr
JOIN "welfare_claims" wc
  ON wc."group_id" = wr."group_id"
  AND wc."member_id" = wr."member_id"
  AND wc."created_at" = wr."created_at"
WHERE wc."status" = 'disbursed';
