-- Append-only audit log for MGR slot changes (claims, admin reassignment,
-- marking paid, skipping). Deliberately only SELECT and INSERT policies —
-- no UPDATE, no DELETE. Under RLS with FORCE, a command with no matching
-- policy is denied outright for any role without BYPASSRLS (chama_app has
-- none — see docs/architecture.md Phase 7 notes), so this table cannot be
-- edited or erased by the running app at all, regardless of what a bug or
-- a compromised session tries to do. Only a real migration (run as the
-- owner role) could alter history here, which is the point — an
-- unmodifiable evidence trail, not a log that trusts the app to behave.
ALTER TABLE "mgr_slot_events" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "mgr_slot_events" FORCE ROW LEVEL SECURITY;

CREATE POLICY "mgr_slot_events_tenant_read" ON "mgr_slot_events"
  FOR SELECT
  USING (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );

CREATE POLICY "mgr_slot_events_tenant_insert" ON "mgr_slot_events"
  FOR INSERT
  WITH CHECK (
    group_id = NULLIF(current_setting('app.current_group_id', true), '')::int
    OR current_setting('app.is_platform_admin', true) = 'true'
  );
