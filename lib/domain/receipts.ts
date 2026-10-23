const TYPE_LABELS: Record<string, string> = {
  capital: "shares",
  security: "security",
  personal_savings: "savings",
  welfare: "welfare",
  mgr: "merry-go-round",
  project: "project",
  other: "other",
};

/** The SMS a member gets after a payment is recorded. Short: one SMS is 160 characters. */
export function buildReceiptSms(input: {
  groupName: string;
  memberName: string;
  items: { type: string; amount: number }[];
  reference: string | null;
  savingsTotal: number;
  statementUrl: string | null;
}): string {
  const ksh = (n: number) => `Ksh ${Math.round(n).toLocaleString("en-KE")}`;
  const total = input.items.reduce((s, i) => s + i.amount, 0);
  const parts = input.items.map((i) => `${ksh(i.amount)} ${TYPE_LABELS[i.type] ?? i.type}`).join(", ");
  const first = input.memberName.split(" ")[0];
  return [
    `${input.groupName}: received ${input.items.length > 1 ? `${ksh(total)} (${parts})` : parts} from ${first}${input.reference ? `, ref ${input.reference}` : ""}.`,
    `Savings now ${ksh(input.savingsTotal)}.`,
    input.statementUrl ? `Statement: ${input.statementUrl}` : null,
  ]
    .filter(Boolean)
    .join(" ");
}
