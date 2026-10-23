import { describe, expect, it } from "vitest";
import { buildReceiptSms } from "@/lib/domain/receipts";

describe("buildReceiptSms", () => {
  it("is short and says what came in and the new balance", () => {
    const sms = buildReceiptSms({
      groupName: "Umoja",
      memberName: "Wanjiku Kamau",
      items: [{ type: "capital", amount: 500 }],
      reference: "QFX12",
      savingsTotal: 12500,
      statementUrl: null,
    });
    expect(sms).toBe("Umoja: received Ksh 500 shares from Wanjiku, ref QFX12. Savings now Ksh 12,500.");
    expect(sms.length).toBeLessThanOrEqual(160);
  });

  it("totals several items and adds the statement link", () => {
    const sms = buildReceiptSms({
      groupName: "Umoja",
      memberName: "Akinyi",
      items: [
        { type: "capital", amount: 500 },
        { type: "welfare", amount: 100 },
      ],
      reference: null,
      savingsTotal: 3000,
      statementUrl: "https://x.co/s/abc",
    });
    expect(sms).toContain("Ksh 600 (Ksh 500 shares, Ksh 100 welfare)");
    expect(sms).toContain("Statement: https://x.co/s/abc");
  });
});
