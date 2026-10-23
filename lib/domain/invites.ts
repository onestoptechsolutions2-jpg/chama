import { can, type GroupRole, type MembershipLike } from "@/lib/auth/permissions";

export const INVITE_TTL_DAYS = 14;

export function inviteExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/** Inviting a plain member needs members.add; inviting an official needs members.manage. */
export function inviteRoleError(inviter: MembershipLike, role: GroupRole): string | null {
  if (role === "member") return can(inviter, "members.add") ? null : "You can't invite members.";
  return can(inviter, "members.manage") ? null : "Only an admin can invite officials.";
}

export type InviteLike = {
  status: "pending" | "accepted" | "cancelled";
  expiresAt: Date;
  phone: string | null;
  email: string | null;
};

/**
 * Can this signed-in account accept the invite? The link is the secret, but
 * an invite made for one phone can't be used by an account with another
 * phone — so a forwarded link doesn't let someone else take an office.
 */
export function inviteAcceptError(
  invite: InviteLike,
  user: { phone: string | null; email: string | null },
  now: Date = new Date(),
): string | null {
  if (invite.status === "accepted") return "This invite has already been used.";
  if (invite.status === "cancelled") return "This invite was cancelled. Ask the group for a new one.";
  if (invite.expiresAt.getTime() < now.getTime()) return "This invite has expired. Ask the group for a new one.";
  if (invite.phone && user.phone && invite.phone !== user.phone) {
    return "This invite is for a different phone number. Sign in with the number it was sent to.";
  }
  if (!invite.phone && invite.email && user.email && invite.email !== user.email) {
    return "This invite is for a different email address.";
  }
  return null;
}

/**
 * Role after accepting: an invite can promote an existing member to an
 * office, but never demotes someone who already holds one.
 */
export function roleAfterInvite(current: GroupRole | null, invited: GroupRole): GroupRole {
  if (!current) return invited;
  const rank: Record<GroupRole, number> = { member: 0, secretary: 1, treasurer: 2, admin: 3 };
  return rank[invited] > rank[current] ? invited : current;
}

export const ROLE_LABELS: Record<GroupRole, string> = {
  admin: "Chair / Admin",
  treasurer: "Treasurer",
  secretary: "Secretary",
  member: "Member",
};
