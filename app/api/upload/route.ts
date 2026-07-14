import { NextResponse } from "next/server";
import { put } from "@vercel/blob";
import { requireSession } from "@/lib/auth/session";

/**
 * Thin upload primitive — no business logic. Any authenticated user can
 * upload (KYC self-service via /profile, staff adding a member's documents
 * via the Members page); the caller decides what the returned URL is used
 * for. Requires BLOB_READ_WRITE_TOKEN, provisioned by creating a Blob
 * store in the Vercel dashboard and linking it to the project — see
 * .env.example.
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
  if (!file.type.startsWith("image/") && file.type !== "application/pdf") {
    return NextResponse.json(
      { error: "Only images or PDFs are accepted" },
      { status: 400 },
    );
  }

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const pathname = `kyc/${session.user.id}/${Date.now()}-${safeName}`;

  try {
    const blob = await put(pathname, file, { access: "public", addRandomSuffix: true });
    return NextResponse.json({ url: blob.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Upload failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
