import { describe, expect, it } from "vitest";
import { buildSchedule, DEFAULT_FUNERAL_BENEFITS, readBenefitSchedule, resolveBenefit } from "@/lib/domain/welfare-benefits";

const REASONS = ["bereavement", "medical", "other"] as const;

describe("welfare benefit table", () => {
  it("fixes the amount from the table", () => {
    expect(resolveBenefit(DEFAULT_FUNERAL_BENEFITS, "spouse-death", 100000)).toEqual({
      reason: "bereavement",
      amount: 30000,
      label: "Death of a spouse",
    });
  });

  it("refuses unknown benefits and amounts above the policy cap", () => {
    expect(resolveBenefit(DEFAULT_FUNERAL_BENEFITS, "nope", 100000)).toHaveProperty("error");
    expect(resolveBenefit(DEFAULT_FUNERAL_BENEFITS, "member-death", 20000)).toHaveProperty("error");
  });

  it("reads stored rows defensively", () => {
    expect(readBenefitSchedule(null)).toEqual([]);
    expect(readBenefitSchedule([{ id: "a", label: "A", reason: "other", amount: 5 }, { id: "b" }])).toHaveLength(1);
  });

  it("builds clean, unique ids from the editor", () => {
    const s = buildSchedule(
      [
        { label: "Death of a parent", reason: "bereavement", amount: 20000 },
        { label: "Death of a parent", reason: "bereavement", amount: 15000 },
        { label: "", reason: "other", amount: 100 },
        { label: "Bad reason", reason: "lottery", amount: 100 },
      ],
      REASONS,
    );
    expect(s.map((b) => b.id)).toEqual(["death-of-a-parent", "death-of-a-parent-2"]);
  });
});
