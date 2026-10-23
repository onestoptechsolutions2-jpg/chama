import { describe, expect, it } from "vitest";
import { buildConstitution, buildResolutionMinutes, type PackGroup } from "@/lib/domain/registration-pack";

const group: PackGroup = {
  name: "Umoja Women Group",
  description: null,
  meetingDay: "Saturday",
  meetingVenue: "the church hall",
  sharePrice: 500,
  sharesPerMember: 1,
  loansEnabled: true,
  mgrEnabled: false,
  welfareEnabled: false,
  loanInterestRate: 10,
  loanMaxMultiplier: 3,
  loanRepaymentMonths: 3,
  loanMinGuarantors: 1,
  fineLateness: 50,
  fineAbsence: 100,
  welfareFixedAmount: null,
};

describe("buildConstitution", () => {
  it("writes the group's own numbers into the constitution", () => {
    const text = buildConstitution(group, []).flatMap((s) => [s.heading, ...s.paragraphs]).join("\n");
    expect(text).toContain("Umoja Women Group");
    expect(text).toContain("every Saturday at the church hall");
    expect(text).toContain("Ksh 500 per period");
    expect(text).toContain("up to 3 times their savings");
    expect(text).not.toContain("Merry-go-round");
  });

  it("numbers sections in order and includes the rule book", () => {
    const sections = buildConstitution(group, [{ ruleNumber: "01", title: "Lateness", description: "Be on time." }]);
    const numbers = sections.map((s) => Number(s.heading.split(".")[0]));
    expect(numbers).toEqual(numbers.map((_, i) => i + 1));
    expect(sections.some((s) => s.paragraphs.includes("01. Lateness: Be on time."))).toBe(true);
  });
});

describe("buildResolutionMinutes", () => {
  it("names the signatories", () => {
    const text = buildResolutionMinutes("Umoja", [{ name: "Akinyi", role: "Treasurer" }])[0].paragraphs.join(" ");
    expect(text).toContain("Akinyi (Treasurer)");
  });
});
