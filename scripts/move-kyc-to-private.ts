/**
 * Moves KYC documents (ID scans, photos, signatures) that were uploaded to
 * the public Blob store into the private one, and points every member row
 * at the private copy (/api/files/kyc/…, served by app/api/files). Run once
 * after connecting the private store:
 *
 *   npm run files:move-kyc-private            # copy and repoint
 *   npm run files:move-kyc-private -- --delete-public   # also delete the public copies
 *
 * Needs DATABASE_URL (owner), BLOB_READ_WRITE_TOKEN (public store) and
 * BLOB_PRIVATE_READ_WRITE_TOKEN. Safe to re-run: rows already on the private
 * store are skipped; one URL shared by several rows (KYC reused across
 * groups) is copied once.
 */
import { Pool, neonConfig } from "@neondatabase/serverless";
import { del, put } from "@vercel/blob";
import ws from "ws";

neonConfig.webSocketConstructor = ws;
const COLUMNS = ["id_document_url", "photo_url", "signature_url"] as const;

async function main() {
  const privateToken = process.env.BLOB_PRIVATE_READ_WRITE_TOKEN;
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL (owner role) is not set");
  if (!privateToken) throw new Error("BLOB_PRIVATE_READ_WRITE_TOKEN is not set");
  const deletePublic = process.argv.includes("--delete-public");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  const moved = new Map<string, string>();
  for (const col of COLUMNS) {
    const { rows } = await pool.query<{ url: string }>(
      `select distinct ${col} as url from members where ${col} like 'https://%.blob.vercel-storage.com/kyc/%'`,
    );
    for (const { url } of rows) {
      if (!moved.has(url)) {
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`skip (download ${res.status}): ${url}`);
          continue;
        }
        const pathname = decodeURIComponent(new URL(url).pathname.slice(1));
        const blob = await put(pathname, await res.blob(), {
          access: "private",
          token: privateToken,
          addRandomSuffix: false,
          allowOverwrite: true,
          contentType: res.headers.get("content-type") ?? undefined,
        });
        moved.set(url, `/api/files/${blob.pathname}`);
      }
      const { rowCount } = await pool.query(`update members set ${col} = $1 where ${col} = $2`, [moved.get(url), url]);
      console.log(`${col}: ${rowCount} row(s) → ${moved.get(url)}`);
    }
  }
  if (deletePublic && moved.size) {
    await del([...moved.keys()]);
    console.log(`deleted ${moved.size} public file(s)`);
  }
  console.log(`done: ${moved.size} file(s) moved${deletePublic ? "" : " (public copies kept; re-run with --delete-public once checked)"}`);
  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
