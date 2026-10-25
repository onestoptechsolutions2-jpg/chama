-- Dues were never marked paid when savings came in, so the daily job fined
-- members who had paid. From now on savings pay off dues as they are
-- recorded (lib/commands/contributions.ts). This catches up the dues still
-- pending: savings (shares or personal savings) a member paid in the same
-- calendar month as the due, Nairobi time, count towards it. Fines already
-- issued are left for officials to review and waive.
UPDATE "contribution_dues" d SET
  "amount_paid" = least(d.amount_due, p.paid),
  "status" = CASE WHEN p.paid >= d.amount_due THEN 'paid'::contribution_due_status ELSE d.status END,
  "updated_at" = now()
FROM (
  SELECT d2.id, coalesce(sum(c.amount), 0) AS paid
  FROM "contribution_dues" d2
  LEFT JOIN "contributions" c
    ON c.group_id = d2.group_id AND c.member_id = d2.member_id
   AND c.type IN ('capital', 'personal_savings') AND c.status = 'paid'
   AND date_trunc('month', c.created_at AT TIME ZONE 'Africa/Nairobi') = date_trunc('month', d2.due_date::timestamp)
  WHERE d2.status = 'pending'
  GROUP BY d2.id
) p
WHERE d.id = p.id AND p.paid > 0;
