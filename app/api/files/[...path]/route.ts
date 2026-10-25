import { NextResponse } from "next/server";
import { get } from "@vercel/blob";
import { or, eq } from "drizzle-orm";
import { requireSession } from "@/lib/auth/session";
import { can } from "@/lib/auth/permissions";
import { withPlatformAdmin } from "@/lib/db/rls";
import { members } from "@/lib/db/schema";
import { canViewPrivateFile, privateFileRef, privateFilesToken } from "@/lib/files/private";

/**
 * Serves a private KYC document to someone allowed to see it:
 * - the person who uploaded it (their user id is in the path), or
 * - the member it belongs to, or an official who can see the member list
 *   (members.view) in a group where that member's record holds this file —
 *   including platform support while it has that group open.
 * Everyone else gets 404, so a guessed path reveals nothing.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const session = await requireSession();
  const token = privateFilesToken();
  const parts = (await params).path;
  const pathname = parts.map(decodeURIComponent).join("/");
  const notFound = () => NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!token || parts[0] !== "kyc") return notFound();

  const ref = privateFileRef(pathname);
  const holders = await withPlatformAdmin((tx) =>
    tx
      .select({ groupId: members.groupId, userId: members.userId })
      .from(members)
      .where(or(eq(members.idDocumentUrl, ref), eq(members.photoUrl, ref), eq(members.signatureUrl, ref))),
  );
  const allowed = canViewPrivateFile({
    pathParts: pathname.split("/"),
    viewerUserId: session.user.id,
    holders,
    canSeeMembersIn: (groupId) =>
      [session.activeMembership, ...session.memberships].some((m) => m && m.groupId === groupId && can(m, "members.view")),
  });
  if (!allowed) return notFound();

  const file = await get(pathname, { access: "private", token }).catch(() => null);
  if (!file || file.statusCode !== 200) return notFound();
  return new Response(file.stream, {
    headers: {
      "Content-Type": file.blob.contentType,
      "Content-Disposition": "inline",
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
