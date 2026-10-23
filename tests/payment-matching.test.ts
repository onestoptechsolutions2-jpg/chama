import { describe, expect, it } from "vitest";
import { matchPayment, parseAccountRef, parseMpesaTime, parsePaymentCsv } from "@/lib/domain/payment-matching";

const roster = [
  { id: 1, memberNumber: "12", phone: "254712345678" },
  { id: 2, memberNumber: "7", phone: null },
  { id: 3, memberNumber: "KMDA 123A", phone: "254700000001" },
  { id: 4, memberNumber: null, phone: "254711111111" },
];

describe("parseAccountRef", () => {
  it("reads number and purpose", () => {
    expect(parseAccountRef("12")).toEqual({ account: "12", purpose: null });
    expect(parseAccountRef("12 welfare")).toEqual({ account: "12", purpose: "welfare" });
    expect(parseAccountRef("12W")).toEqual({ account: "12", purpose: "welfare" });
    expect(parseAccountRef("12-loan")).toEqual({ account: "12", purpose: "loan" });
    expect(parseAccountRef(" ")).toEqual({ account: null, purpose: null });
  });
});

describe("matchPayment", () => {
  it("matches by member number with the default purpose", () => {
    expect(matchPayment({ accountRef: "12", payerPhone: null }, roster, "capital")).toEqual({ memberId: 1, purpose: "capital", by: "account" });
  });

  it("honours a purpose keyword", () => {
    expect(matchPayment({ accountRef: "7 loan", payerPhone: null }, roster, "capital")).toEqual({ memberId: 2, purpose: "loan", by: "account" });
  });

  it("matches a custom number with spaces, like a plate", () => {
    expect(matchPayment({ accountRef: "kmda123a", payerPhone: null }, roster, "capital")?.memberId).toBe(3);
  });

  it("falls back to the phone", () => {
    expect(matchPayment({ accountRef: "hello", payerPhone: "0711 111 111" }, roster, "welfare")).toEqual({ memberId: 4, purpose: "welfare", by: "phone" });
  });

  it("finds the member number inside a bank narration", () => {
    expect(matchPayment({ accountRef: "Deposit 12 welfare", payerPhone: null }, roster, "capital", { scanNarration: true })).toEqual({
      memberId: 1,
      purpose: "welfare",
      by: "account",
    });
    expect(matchPayment({ accountRef: "Deposit 12 welfare", payerPhone: null }, roster, "capital")).toBeNull();
  });

  it("leaves unknown payments for a person", () => {
    expect(matchPayment({ accountRef: "99", payerPhone: "2547*****678" }, roster, "capital")).toBeNull();
  });
});

describe("parseMpesaTime", () => {
  it("reads Nairobi time", () => {
    expect(parseMpesaTime("20261023143005").toISOString()).toBe("2026-10-23T11:30:05.000Z");
  });
});

describe("parsePaymentCsv", () => {
  it("reads a check-off file", () => {
    const result = parsePaymentCsv("employee_no,name,deduction\n12,Wanjiku,500\n7,Otieno,500\n", "oct.csv");
    expect("rows" in result && result.rows.map((r) => [r.accountRef, r.amount, r.externalId])).toEqual([
      ["12", 500, "oct.csv:2"],
      ["7", 500, "oct.csv:3"],
    ]);
  });

  it("reads a bank statement and skips debits", () => {
    const csv = 'Date,Description,Reference,Credit\n2026-10-01,"Deposit 12 welfare",BK1,"1,000"\n2026-10-02,Charges,BK2,-50\n';
    const result = parsePaymentCsv(csv, "bank.csv");
    expect("rows" in result && result.rows).toHaveLength(1);
    expect("rows" in result && result.rows[0]).toMatchObject({ externalId: "BK1", amount: 1000, accountRef: "Deposit 12 welfare" });
  });

  it("explains a missing column", () => {
    expect(parsePaymentCsv("name,phone\nA,1\n", "x")).toEqual({ error: expect.stringMatching(/amount/) });
  });
});
