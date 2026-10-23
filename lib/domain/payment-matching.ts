import { normalizePhone } from "./identity";

/**
 * Who paid, and for what? Members pay the group's own paybill/till (or the
 * bank, or payroll) and type their account number — their member number,
 * optionally followed by what it's for: "12", "12 welfare", "12W",
 * "12 loan". A group can also use custom numbers such as a boda plate
 * ("KMDA 123A"). Phone is the fallback (M-Pesa often masks it).
 *
 * Deterministic: the same payment and roster always give the same answer,
 * and anything ambiguous is left for a person to match.
 */
export type PaymentPurpose = "capital" | "personal_savings" | "welfare" | "mgr" | "project" | "loan";

export const PAYMENT_PURPOSES: PaymentPurpose[] = ["capital", "personal_savings", "welfare", "mgr", "project", "loan"];

const KEYWORDS: Record<string, PaymentPurpose> = {
  S: "capital",
  SH: "capital",
  SHARE: "capital",
  SHARES: "capital",
  CAPITAL: "capital",
  SAV: "personal_savings",
  SAVE: "personal_savings",
  SAVING: "personal_savings",
  SAVINGS: "personal_savings",
  W: "welfare",
  WEL: "welfare",
  WELFARE: "welfare",
  L: "loan",
  LOAN: "loan",
  M: "mgr",
  MGR: "mgr",
  MERRY: "mgr",
  P: "project",
  PROJECT: "project",
};

const compact = (v: string) => v.toUpperCase().replace(/[^A-Z0-9]/g, "");

export function parseAccountRef(ref: string | null | undefined): { account: string | null; purpose: PaymentPurpose | null } {
  if (!ref) return { account: null, purpose: null };
  const tokens = ref.toUpperCase().split(/[\s\-#/.,:_]+/).filter(Boolean);
  if (tokens.length === 0) return { account: null, purpose: null };
  // "12W" → "12" + "W"
  const glued = /^(\d+)([A-Z]+)$/.exec(tokens[0]);
  if (glued && KEYWORDS[glued[2]]) return { account: glued[1], purpose: KEYWORDS[glued[2]] };
  const purpose = tokens.slice(1).map((t) => KEYWORDS[t]).find(Boolean) ?? null;
  return { account: tokens[0], purpose };
}

export type RosterEntry = { id: number; memberNumber: string | null; phone: string | null };

export type PaymentMatch = { memberId: number; purpose: PaymentPurpose; by: "account" | "phone" };

export function matchPayment(
  payment: { accountRef: string | null; payerPhone: string | null },
  roster: RosterEntry[],
  defaultPurpose: PaymentPurpose,
  /** Bank narrations: also look for a member number anywhere in the text. */
  options: { scanNarration?: boolean } = {},
): PaymentMatch | null {
  const withNumbers = roster.filter((m) => m.memberNumber);

  // 1. The whole reference is a member's (custom) number, e.g. "KMDA 123A".
  if (payment.accountRef) {
    const whole = compact(payment.accountRef);
    const hits = withNumbers.filter((m) => compact(m.memberNumber!) === whole);
    if (hits.length === 1) return { memberId: hits[0].id, purpose: defaultPurpose, by: "account" };
  }

  // 2. Number first, purpose after: "12 welfare", "12W".
  const { account, purpose } = parseAccountRef(payment.accountRef);
  if (account) {
    const hits = withNumbers.filter((m) => compact(m.memberNumber!) === compact(account));
    if (hits.length === 1) return { memberId: hits[0].id, purpose: purpose ?? defaultPurpose, by: "account" };
    if (hits.length > 1) return null;
  }

  // 2b. Bank narration, e.g. "Deposit 12 welfare": exactly one member's
  // number appears as a word.
  if (options.scanNarration && payment.accountRef) {
    const words = payment.accountRef.toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean);
    const ids = new Set(withNumbers.filter((m) => words.includes(compact(m.memberNumber!))).map((m) => m.id));
    if (ids.size === 1) {
      const keyword = words.map((w) => KEYWORDS[w]).find((k) => k && k !== "capital") ?? null;
      return { memberId: [...ids][0], purpose: keyword ?? defaultPurpose, by: "account" };
    }
  }

  // 3. The payer's phone, when M-Pesa or the bank gives it unmasked.
  const phone = normalizePhone(payment.payerPhone);
  if (phone) {
    const hits = roster.filter((m) => normalizePhone(m.phone) === phone);
    if (hits.length === 1) return { memberId: hits[0].id, purpose: purpose ?? defaultPurpose, by: "phone" };
  }
  return null;
}

/** M-Pesa TransTime "20261023143005" (Nairobi time) → Date. Falls back to now. */
export function parseMpesaTime(value: string | null | undefined, now: Date = new Date()): Date {
  const m = value ? /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value) : null;
  if (!m) return now;
  const [, y, mo, d, h, mi, s] = m;
  const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}+03:00`);
  return Number.isNaN(date.getTime()) ? now : date;
}

/** One payment line from a bank statement or payroll check-off CSV. */
export type CsvPayment = { externalId: string; amount: number; accountRef: string | null; payerPhone: string | null; payerName: string | null; receivedAt: Date };

/**
 * Reads a bank or check-off CSV. Needs an `amount` column plus one of
 * `account` / `member_no` / `employee_no` / `reference` / `description`.
 * Optional: `date`, `phone`, `name`, `reference` (used as the unique id
 * when present, so re-uploading the same file adds nothing twice).
 */
export function parsePaymentCsv(
  text: string,
  fileKey: string,
  now: Date = new Date(),
): { rows: CsvPayment[] } | { error: string } {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { error: "The file needs a header row and at least one payment" };
  const split = (line: string) => {
    const out: string[] = [];
    let cur = "";
    let quoted = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (c === '"' && quoted && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = !quoted;
      else if (c === "," && !quoted) {
        out.push(cur.trim());
        cur = "";
      } else cur += c;
    }
    out.push(cur.trim());
    return out;
  };
  const headers = split(lines[0]).map((h) => h.toLowerCase().replace(/[\s-]+/g, "_"));
  const col = (...names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i >= 0) ?? -1;
  const iAmount = col("amount", "credit", "paid_in", "deduction");
  const iAccount = col("account", "member_no", "member_number", "employee_no", "payroll_no", "staff_no");
  const iRef = col("reference", "ref", "transaction_id", "receipt_no");
  const iDesc = col("description", "narration", "details");
  const iDate = col("date", "value_date", "transaction_date");
  const iPhone = col("phone", "msisdn", "mobile");
  const iName = col("name", "payer", "employee_name");
  if (iAmount < 0) return { error: "Missing an amount column (amount, credit, paid_in or deduction)" };
  if (iAccount < 0 && iRef < 0 && iDesc < 0) {
    return { error: "Missing a column that says who paid (account, member_no, employee_no, reference or description)" };
  }

  const rows: CsvPayment[] = [];
  for (let n = 1; n < lines.length; n++) {
    const v = split(lines[n]);
    const amount = Number((v[iAmount] ?? "").replace(/[, ]/g, ""));
    if (!Number.isFinite(amount) || amount <= 0) continue; // debits, blanks, totals
    const ref = iRef >= 0 ? v[iRef] || null : null;
    const date = iDate >= 0 && v[iDate] ? new Date(v[iDate]) : now;
    rows.push({
      externalId: ref ?? `${fileKey}:${n + 1}`,
      amount,
      accountRef: (iAccount >= 0 ? v[iAccount] : null) || (iDesc >= 0 ? v[iDesc] : null) || ref,
      payerPhone: iPhone >= 0 ? v[iPhone] || null : null,
      payerName: iName >= 0 ? v[iName] || null : null,
      receivedAt: Number.isNaN(date.getTime()) ? now : date,
    });
  }
  if (rows.length === 0) return { error: "No payments (positive amounts) found in the file" };
  return { rows };
}
