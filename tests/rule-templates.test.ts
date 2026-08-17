import { describe, it, expect } from "vitest";
import { RULE_TEMPLATES, visibleRuleTemplates } from "../lib/domain/rule-templates";
import type { ProductFlags } from "../lib/domain/products";

const noProducts: ProductFlags = { loans: false, mgr: false, welfare: false, projects: false };
const allProducts: ProductFlags = { loans: true, mgr: true, welfare: true, projects: true };

describe("RULE_TEMPLATES", () => {
  it("has a unique id per template", () => {
    const ids = RULE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every template has a non-empty title and description", () => {
    for (const t of RULE_TEMPLATES) {
      expect(t.title.trim().length).toBeGreaterThan(0);
      expect(t.description.trim().length).toBeGreaterThan(0);
    }
  });

  it("covers every rule category with at least one template", () => {
    const categories = new Set(RULE_TEMPLATES.map((t) => t.category));
    for (const c of ["general", "contributions", "loans", "mgr", "welfare", "fines", "meetings", "projects", "other"]) {
      expect(categories.has(c as never)).toBe(true);
    }
  });
});

describe("visibleRuleTemplates", () => {
  it("with no products active, only shows the always-relevant categories", () => {
    const visible = visibleRuleTemplates(noProducts);
    const categories = new Set(visible.map((t) => t.category));
    expect(categories.has("loans")).toBe(false);
    expect(categories.has("mgr")).toBe(false);
    expect(categories.has("welfare")).toBe(false);
    expect(categories.has("projects")).toBe(false);
    expect(categories.has("general")).toBe(true);
    expect(categories.has("contributions")).toBe(true);
    expect(categories.has("fines")).toBe(true);
    expect(categories.has("meetings")).toBe(true);
    expect(categories.has("other")).toBe(true);
  });

  it("reveals a vehicle's templates once its product is enabled, one at a time", () => {
    const loansOnly = visibleRuleTemplates({ ...noProducts, loans: true });
    expect(loansOnly.some((t) => t.category === "loans")).toBe(true);
    expect(loansOnly.some((t) => t.category === "mgr")).toBe(false);

    const welfareOnly = visibleRuleTemplates({ ...noProducts, welfare: true });
    expect(welfareOnly.some((t) => t.category === "welfare")).toBe(true);
    expect(welfareOnly.some((t) => t.category === "projects")).toBe(false);
  });

  it("with every product active, shows every template", () => {
    expect(visibleRuleTemplates(allProducts).length).toBe(RULE_TEMPLATES.length);
  });
});
