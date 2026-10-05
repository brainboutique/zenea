/**
 * Helpers to order sibling entities by the optional numeric `sortOrder`
 * attribute (root-level attribute of entity payload files).
 *
 * Rules: ascending numeric order; entities without a (usable) sortOrder are
 * sorted last. Ties keep their original (stable) order.
 */

/** Parse a value into a usable sort order, or null when it is missing/unusable. */
export function toSortOrder(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

/** Compare two sortOrder values: ascending, missing values last, 0 on ties. */
export function compareBySortOrder(a: unknown, b: unknown): number {
  const na = toSortOrder(a);
  const nb = toSortOrder(b);
  if (na === null && nb === null) return 0;
  if (na === null) return 1;
  if (nb === null) return -1;
  return na - nb;
}

/** Return a sorted copy of `items` ordered by their sortOrder (missing last). */
export function sortBySortOrder<T>(
  items: readonly T[],
  getSortOrder: (item: T) => unknown = (item) => (item as { sortOrder?: unknown }).sortOrder
): T[] {
  return [...items].sort((a, b) => compareBySortOrder(getSortOrder(a), getSortOrder(b)));
}
