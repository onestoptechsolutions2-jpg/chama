-- Allow an authenticated active user to create their own group. The action
-- sets app.current_user_id through withUser() and immediately creates the
-- founding membership in the same transaction.
CREATE POLICY "groups_self_service_insert" ON "groups"
  FOR INSERT
  WITH CHECK (
    NULLIF(current_setting('app.current_user_id', true), '')::int IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM "users"
      WHERE "users"."id" = NULLIF(current_setting('app.current_user_id', true), '')::int
        AND "users"."active" = true
    )
  );