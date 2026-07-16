import { describe, it, expect } from "vitest";
import { defaultProductsForType } from "../lib/domain/products";

describe("defaultProductsForType", () => {
  it("chama: loans + mgr, not welfare/projects", () => {
    expect(defaultProductsForType("chama")).toEqual({
      loans: true,
      mgr: true,
      welfare: false,
      projects: false,
    });
  });

  it("welfare: only welfare", () => {
    expect(defaultProductsForType("welfare")).toEqual({
      loans: false,
      mgr: false,
      welfare: true,
      projects: false,
    });
  });

  it("hybrid: everything on", () => {
    expect(defaultProductsForType("hybrid")).toEqual({
      loans: true,
      mgr: true,
      welfare: true,
      projects: true,
    });
  });

  it("selfhelp: loans + projects, not mgr/welfare", () => {
    expect(defaultProductsForType("selfhelp")).toEqual({
      loans: true,
      mgr: false,
      welfare: false,
      projects: true,
    });
  });
});
