import { describe, expect, it } from "vitest";
import { SEGMENTS, SEGMENT_ORDER, segmentRules } from "@/lib/domain/segments";
import { RULE_TEMPLATES } from "@/lib/domain/rule-templates";

describe("segments", () => {
  it("lists every segment once", () => {
    expect(new Set(SEGMENT_ORDER).size).toBe(Object.keys(SEGMENTS).length);
  });

  it("only uses rule templates that exist", () => {
    const ids = new Set(RULE_TEMPLATES.map((t) => t.id));
    for (const s of Object.values(SEGMENTS)) {
      for (const id of s.ruleTemplateIds) expect(ids.has(id)).toBe(true);
    }
  });

  it("only adds rules for products the segment switches on", () => {
    for (const key of SEGMENT_ORDER) {
      const { products } = SEGMENTS[key];
      for (const rule of segmentRules(key)) {
        if (rule.category === "loans") expect(products.loans).toBe(true);
        if (rule.category === "welfare") expect(products.welfare).toBe(true);
        if (rule.category === "mgr") expect(products.mgr).toBe(true);
      }
    }
  });

  it("gives welfare segments a fixed contribution", () => {
    expect(SEGMENTS.welfare_funeral.welfare?.fixedAmount).toBeGreaterThan(0);
    expect(SEGMENTS.employee_welfare.products.welfare).toBe(true);
  });
});
