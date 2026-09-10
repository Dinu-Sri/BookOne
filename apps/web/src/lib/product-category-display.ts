export type CategoryLabelRow = {
  id: string;
  name: string;
  parentId: string | null;
  parentName: string | null;
  brandName: string | null;
  locationName: string | null;
};

export function categoryOptionLabel(row: CategoryLabelRow): string {
  const label = row.parentName ? `${row.parentName} → ${row.name}` : row.name;
  const scope = [row.brandName, row.locationName].filter(Boolean).join(' · ');
  return scope ? `${label} (${scope})` : label;
}

export function sortCategoryTree<T extends { id: string; name: string; parentId: string | null }>(rows: T[]): T[] {
  const children = new Map<string, T[]>();
  const roots: T[] = [];
  for (const row of rows) {
    if (!row.parentId) roots.push(row);
    else {
      const list = children.get(row.parentId) ?? [];
      list.push(row);
      children.set(row.parentId, list);
    }
  }
  const out: T[] = [];
  for (const root of roots.sort((a, b) => a.name.localeCompare(b.name))) {
    out.push(root);
    const kids = (children.get(root.id) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    out.push(...kids);
  }
  for (const row of rows) {
    if (!out.some((r) => r.id === row.id)) out.push(row);
  }
  return out;
}
