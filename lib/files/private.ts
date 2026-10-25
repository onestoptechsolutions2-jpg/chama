import "server-only";

/**
 * KYC documents (ID scans, photos, signatures) go to a *private* Vercel Blob
 * store when one is connected (BLOB_PRIVATE_READ_WRITE_TOKEN — a second
 * store, created with private access in the Vercel dashboard). They are
 * stored as an app path, /api/files/<pathname>, and served only through
 * app/api/files/[...path]/route.ts, which checks who is asking. Without the
 * setting, uploads stay on the public store as before.
 */
export const PRIVATE_FILE_PREFIX = "/api/files/";

export function privateFilesToken(): string | null {
  return process.env.BLOB_PRIVATE_READ_WRITE_TOKEN || null;
}

export const privateFileRef = (pathname: string) => `${PRIVATE_FILE_PREFIX}${pathname}`;

/** Which upload folders hold personal documents (and so go private). */
export const PRIVATE_FOLDERS = new Set(["kyc"]);

/**
 * Who may open a private KYC file: whoever uploaded it (their user id is the
 * second path segment), the member whose record holds it, or an official
 * with members.view in a group whose member record holds it.
 */
export function canViewPrivateFile(input: {
  pathParts: string[];
  viewerUserId: number;
  holders: { groupId: number; userId: number | null }[];
  canSeeMembersIn: (groupId: number) => boolean;
}): boolean {
  const { pathParts, viewerUserId, holders, canSeeMembersIn } = input;
  if (pathParts[0] !== "kyc" || pathParts.some((p) => p === ".." || p === "")) return false;
  if (pathParts[1] === String(viewerUserId)) return true;
  return holders.some((h) => h.userId === viewerUserId || canSeeMembersIn(h.groupId));
}
