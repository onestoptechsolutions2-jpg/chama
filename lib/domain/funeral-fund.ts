/**
 * Funeral funds: a short-lived group for a funeral harambee. Anyone can give
 * by M-Pesa prompt without joining; the committee are the group's officials
 * and money leaves only through the wallet's two-official withdrawal. These
 * are the pure rules; lib/funds/* applies them. Amounts are whole shillings.
 */
export type FundStatus = "open" | "closed" | "converted";

export const MIN_GIFT = 10;
export const MAX_GIFT = 250_000; // M-Pesa's per-transaction limit
/** Prompts one phone may start for one fund in GIFT_WINDOW_MINUTES (stops prompt spam). */
export const GIFTS_PER_PHONE = 3;
export const GIFT_WINDOW_MINUTES = 10;
export const MAX_FUND_DAYS = 120;
export const DEFAULT_FUND_DAYS = 60;

export type CommitteeRole = "chair" | "treasurer" | "secretary";
export const COMMITTEE_ROLE = { chair: "admin", treasurer: "treasurer", secretary: "secretary" } as const;

/** Is the fund taking gifts today (Nairobi date, YYYY-MM-DD)? */
export function isOpen(fund: { status: string; closesOn: string }, today: string): boolean {
  return fund.status === "open" && today <= fund.closesOn;
}

export function closesOnError(closesOn: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(closesOn) || Number.isNaN(Date.parse(closesOn))) return "closesOn must be a date (YYYY-MM-DD)";
  if (closesOn < today) return "closesOn is in the past";
  const days = (Date.parse(closesOn) - Date.parse(today)) / 86_400_000;
  if (days > MAX_FUND_DAYS) return `A funeral fund can stay open at most ${MAX_FUND_DAYS} days`;
  return null;
}

export function committeeError(committee: { role: CommitteeRole; phone: string | null }[]): string | null {
  if (!committee.some((c) => c.role === "chair")) return "The committee needs a chair";
  for (const role of ["chair", "treasurer", "secretary"] as const) {
    if (committee.filter((c) => c.role === role).length > 1) return `Only one ${role}`;
  }
  if (committee.some((c) => !c.phone)) return "Every committee member needs a valid Kenyan phone number";
  const phones = committee.map((c) => c.phone);
  if (new Set(phones).size !== phones.length) return "The same phone appears twice in the committee";
  return null;
}

export function giftError(
  g: { amount: number; phone: string | null; branch?: string | null },
  ctx: { open: boolean; branches: string[]; recentFromPhone: number },
): string | null {
  if (!ctx.open) return "This fund is closed";
  if (!g.phone) return "Enter a valid Safaricom number";
  if (!Number.isFinite(g.amount) || g.amount < MIN_GIFT) return `The smallest gift is Ksh ${MIN_GIFT}`;
  if (g.amount > MAX_GIFT) return `M-Pesa allows at most Ksh ${MAX_GIFT.toLocaleString("en-KE")} at a time`;
  if (g.branch && ctx.branches.length && !ctx.branches.includes(g.branch)) return "Unknown family branch";
  if (ctx.recentFromPhone >= GIFTS_PER_PHONE) return "Too many prompts to this phone — wait a few minutes and try again";
  return null;
}

export type GiftRow = { name: string; amount: number; branch: string | null; message: string | null; anonymous: boolean; status: string; paidAt: Date | null };

/** Totals over paid gifts; names hidden for anonymous givers. */
export function summarizeGifts(gifts: GiftRow[], recentLimit = 20) {
  const paid = gifts.filter((g) => g.status === "paid");
  const byBranch = new Map<string, { total: number; count: number }>();
  for (const g of paid) {
    const key = g.branch ?? "";
    const b = byBranch.get(key) ?? { total: 0, count: 0 };
    b.total += g.amount;
    b.count += 1;
    byBranch.set(key, b);
  }
  return {
    total: Math.round(paid.reduce((s, g) => s + g.amount, 0)),
    giftCount: paid.length,
    byBranch: [...byBranch.entries()]
      .map(([branch, b]) => ({ branch: branch || null, total: Math.round(b.total), count: b.count }))
      .sort((a, b) => b.total - a.total),
    recent: [...paid]
      .sort((a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0))
      .slice(0, recentLimit)
      .map((g) => ({ name: g.anonymous ? "Well-wisher" : g.name, amount: Math.round(g.amount), message: g.message, paidAt: g.paidAt?.toISOString() ?? null })),
  };
}
