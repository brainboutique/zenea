/**
 * Extract parent factSheet IDs from a relToParent relation structure.
 *
 * relToParent follows the standard LeanIX edge format:
 *   { edges: [{ node: { factSheet: { id } } }], totalCount }
 *
 * This is the single source of truth for deriving parent IDs. All code that
 * previously read a flat `parentIds` array should call this function instead,
 * passing the entity's `relToParent` value.
 */
export function extractParentIds(relToParent: any): string[] {
  if (!relToParent || typeof relToParent !== 'object') return [];
  const edges = relToParent.edges;
  if (!Array.isArray(edges)) return [];
  return edges
    .map((e: any) => e?.node?.factSheet?.id)
    .filter((id: any): id is string => typeof id === 'string' && id.length > 0);
}
