import type { OrgUnit } from "./types";

export type UnitNode = OrgUnit & { children: UnitNode[]; depth: number };

/** Build the org tree from a flat row list, alphabetical at every level. */
export function buildTree(units: OrgUnit[]): UnitNode[] {
  const byId = new Map<string, UnitNode>();
  for (const u of units) byId.set(u.id, { ...u, children: [], depth: 0 });

  const roots: UnitNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }

  const sortRec = (nodes: UnitNode[], depth: number) => {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) {
      n.depth = depth;
      sortRec(n.children, depth + 1);
    }
  };
  sortRec(roots, 0);
  return roots;
}

/** Depth-first flatten — the shape dropdowns and tree views both render from. */
export function flattenTree(nodes: UnitNode[]): UnitNode[] {
  const out: UnitNode[] = [];
  const walk = (list: UnitNode[]) => {
    for (const n of list) {
      out.push(n);
      walk(n.children);
    }
  };
  walk(nodes);
  return out;
}

/** "Faculty of Law › Public & International Law" for a given unit. */
export function unitPath(unitId: string, units: OrgUnit[]): string {
  const byId = new Map(units.map((u) => [u.id, u]));
  const parts: string[] = [];
  let current = byId.get(unitId);
  const guard = new Set<string>();
  while (current && !guard.has(current.id)) {
    guard.add(current.id);
    parts.unshift(current.name);
    current = current.parent_id ? byId.get(current.parent_id) : undefined;
  }
  return parts.join(" › ");
}

/** A unit plus every unit beneath it — the scope a staff assignment implies. */
export function descendantIds(rootIds: string[], units: OrgUnit[]): string[] {
  const childrenOf = new Map<string, string[]>();
  for (const u of units) {
    if (!u.parent_id) continue;
    const list = childrenOf.get(u.parent_id) ?? [];
    list.push(u.id);
    childrenOf.set(u.parent_id, list);
  }

  const seen = new Set<string>();
  const stack = [...rootIds];
  while (stack.length) {
    const id = stack.pop()!;
    if (seen.has(id)) continue;
    seen.add(id);
    for (const child of childrenOf.get(id) ?? []) stack.push(child);
  }
  return [...seen];
}

/**
 * The faculty, school or directorate a unit reports to, i.e. the topmost
 * ancestor. A department's schedule line belongs under its faculty, not under
 * itself, which is what makes a schedule "by Faculty" mean anything.
 */
export function topTierOf(unitId: string, units: OrgUnit[]): OrgUnit | undefined {
  const byId = new Map(units.map((u) => [u.id, u]));
  let current = byId.get(unitId);
  const guard = new Set<string>();
  while (current?.parent_id && !guard.has(current.id)) {
    guard.add(current.id);
    const parent = byId.get(current.parent_id);
    if (!parent) break;
    current = parent;
  }
  return current;
}
