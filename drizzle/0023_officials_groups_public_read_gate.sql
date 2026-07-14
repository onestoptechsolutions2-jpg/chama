-- A group without its three offices filled (Chair/Treasurer/Secretary —
-- see lib/domain/officials.ts's computeRegistrationComplete) shouldn't be
-- publicly discoverable, on top of the existing app-level filter in
-- app/(public)/discover/page.tsx and discover/[id]/page.tsx and the
-- registrationComplete check in requestToJoinAction — same defense-in-depth
-- reasoning as every other RLS policy in this schema.
ALTER POLICY "groups_public_read" ON "groups"
  USING (is_public = true AND registration_complete = true);
