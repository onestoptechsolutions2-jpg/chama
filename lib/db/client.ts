import { Pool, neonConfig } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-serverless";
import ws from "ws";
import * as schema from "./schema";

neonConfig.webSocketConstructor = ws;

const globalForDb = globalThis as unknown as { pool?: Pool };

function getAppDatabaseUrl(): string {
  const url = process.env.APP_DATABASE_URL;
  if (!url) {
    throw new Error(
      "APP_DATABASE_URL is not set — the running app must connect as a " +
        "least-privilege role, not DATABASE_URL's owner role (which has " +
        "BYPASSRLS and would silently disable every RLS policy). See .env.example.",
    );
  }
  return url;
}

// Reuse the pool across hot-reloads in dev so we don't leak connections.
// Deliberately APP_DATABASE_URL, not DATABASE_URL — see getAppDatabaseUrl().
const pool = globalForDb.pool ?? new Pool({ connectionString: getAppDatabaseUrl() });

if (process.env.NODE_ENV !== "production") globalForDb.pool = pool;

export const db = drizzle(pool, { schema });
export { pool };
