/**
 * Adds the one-person-one-phone/email unique indexes that migration
 * 0051_unique_contacts skipped because duplicates existed. Run after
 * support has merged the duplicates listed on /super-admin/users:
 *
 *   npm run db:enforce-unique-contacts
 *
 * Needs the OWNER connection (DATABASE_URL) — creating an index is DDL.
 * Safe to re-run; prints what is still blocking.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import ws from "ws";

neonConfig.webSocketConstructor = ws;

const CHECKS = [
  {
    index: "users_phone_unique",
    duplicates: `select phone as key, count(*) from users where phone is not null group by phone having count(*) > 1`,
    create: `create unique index if not exists users_phone_unique on users (phone) where phone is not null`,
  },
  {
    index: "users_email_lower_unique",
    duplicates: `select lower(email) as key, count(*) from users where email is not null group by lower(email) having count(*) > 1`,
    create: `create unique index if not exists users_email_lower_unique on users (lower(email)) where email is not null`,
  },
  {
    index: "members_group_phone_unique",
    duplicates: `select group_id || ':' || phone as key, count(*) from members where phone is not null group by group_id, phone having count(*) > 1`,
    create: `create unique index if not exists members_group_phone_unique on members (group_id, phone) where phone is not null`,
  },
];

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (owner role) is not set");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  let blocked = 0;
  for (const check of CHECKS) {
    const { rows } = await pool.query(check.duplicates);
    if (rows.length) {
      blocked++;
      console.log(`✗ ${check.index}: ${rows.length} duplicate value(s), e.g. ${rows.slice(0, 3).map((r) => r.key).join(", ")}`);
      continue;
    }
    await pool.query(check.create);
    console.log(`✓ ${check.index}`);
  }
  await pool.end();
  process.exit(blocked ? 1 : 0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
