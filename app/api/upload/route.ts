import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/auth/session";
import { PRIVATE_FOLDERS, privateFileRef, privateFilesToken } from "@/lib/files/private";

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

/**
 * Thin upload primitive — no business logic. Any authenticated user can
 * upload (KYC self-service via /profile, staff adding a member's documents
 * via the Members page, group documents via /dashboard/governance); the
 * caller decides what the returned URL is used for. An optional `folder`
 * field in the form data sets the Blob path prefix (default "kyc", so
 * every existing caller keeps working unchanged without passing it).
 * Requires BLOB_READ_WRITE_TOKEN, provisioned by creating a Blob store in
 * the Vercel dashboard and linking it to the project — see .env.example.
 */
export async function POST(req: Request) {
  const session = await requireSession();

  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const MAX_BYTES = 8 * 1024 * 1024;
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File is too large (max 8MB)" }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: "Please upload a photo (JPG, PNG) or a PDF" },
      { status: 400 },
    );
  }

  const requestedFolder = form?.get("folder");
  const safeFolder =
    typeof requestedFolder === "string" && requestedFolder.trim()
      ? requestedFolder.trim().replace(/[^a-zA-Z0-9_-]/g, "_")
      : "kyc";
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `${safeFolder}/${session.user.id}/${Date.now()}-${safeName}`;

  try {
    // Personal documents go to the private store when it is connected
    // (lib/files/private.ts); the app serves them after checking who asks.
    const privateToken = PRIVATE_FOLDERS.has(safeFolder) ? privateFilesToken() : null;
    if (privateToken) {
      const blob = await put(pathname, file, { access: "private", addRandomSuffix: true, token: privateToken });
      return NextResponse.json({ url: privateFileRef(blob.pathname) });
    }
    const blob = await put(pathname, file, { access: "public", addRandomSuffix: true });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
