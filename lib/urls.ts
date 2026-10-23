import "server-only";
import { headers } from "next/headers";

/**
 * Absolute link to a page of this app, for SMS/WhatsApp messages. Uses
 * PORTAL_BASE_URL when set (production), else the current request's host.
 */
export async function appUrl(path: string): Promise<string> {
  const base = process.env.PORTAL_BASE_URL?.replace(/\/$/, "");
  if (base) return `${base}${path}`;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}${path}`;
}
