-- groups had SELECT/INSERT/UPDATE policies (0001_rls_policies.sql) but no
-- DELETE policy at all — under RLS FORCE, a command with no matching policy
-- is denied outright (0 rows affected, no error raised), which silently
-- broke tests/rls.test.ts's own afterAll cleanup and let fixture groups
-- pile up across every test run, eventually corrupting seedDemoData's
-- "first group" lookup. Platform-admin only: no part of the running app
-- ever deletes a group through normal tenant operations.
CREATE POLICY "groups_platform_admin_delete" ON "groups"
  FOR DELETE
  USING (current_setting('app.is_platform_admin', true) = 'true');
