// Local type — see lib/domain/officials.ts's identical reasoning for why
// lib/domain/* doesn't import from lib/auth/session.ts (which pulls in
// "server-only").
export type GroupType = "chama" | "welfare" | "hybrid" | "selfhelp";

export type ProductFlags = {
  loans: boolean;
  mgr: boolean;
  welfare: boolean;
  projects: boolean;
};

/**
 * A group's product access used to be implied entirely by `type` (see
 * lib/nav-config.ts's old `groupTypes` filter) — this is that exact
 * mapping, now used only to seed the independently-toggleable
 * groups.*Enabled columns at creation time. Changing `type` after creation
 * no longer changes access; only Settings > Products does.
 */
export function defaultProductsForType(type: GroupType): ProductFlags {
  switch (type) {
    case "chama":
      return { loans: true, mgr: true, welfare: false, projects: false };
    case "welfare":
      return { loans: false, mgr: false, welfare: true, projects: false };
    case "hybrid":
      return { loans: true, mgr: true, welfare: true, projects: true };
    case "selfhelp":
      return { loans: true, mgr: false, welfare: false, projects: true };
  }
}
