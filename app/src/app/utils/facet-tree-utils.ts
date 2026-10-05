import type { FacetRelationItem } from '../services/FacetsService';
import { matchesSearch } from './search-utils';
import { extractParentIds } from './parent-utils';

export interface FacetTreeOption {
  id: string;
  label: string;
  depth: number;
  trackId?: string;
  parentId?: string;
  countLabel?: string;
  fullPath?: string;
  status?: string;
}

interface TreeNode {
  segment: string;
  itemId?: string;
  itemDisplayName?: string;
  itemStatus?: string;
  children: Map<string, TreeNode>;
}

function buildTree(items: FacetRelationItem[]): TreeNode {
  const root: TreeNode = { segment: '', children: new Map() };

  const itemMap = new Map<string, FacetRelationItem>();
  for (const item of items) {
    itemMap.set(item.id, item);
  }

  for (const item of items) {
    const parents = extractParentIds(item.relToParent);
    for (const parentId of parents) {
      if (!itemMap.has(parentId)) {
        const segments = (item.displayName ?? '').split(/\s*\/\s*/).map((s) => s.trim()).filter(Boolean);
        const parentName = segments.length > 1 ? segments.slice(0, -1).join(' / ') : parentId;
        itemMap.set(parentId, { id: parentId, displayName: parentName, fullName: parentName });
      }
    }
  }

  const createNode = (item: FacetRelationItem): TreeNode => {
    const displayName = item.displayName || item.id || '';
    const fullName = item.fullName || displayName;
    return {
      segment: fullName,
      itemId: item.id,
      itemDisplayName: item.id || '',
      itemStatus: item.status,
      children: new Map(),
    };
  };

  const primaryNodes = new Map<string, TreeNode>();
  for (const item of itemMap.values()) {
    primaryNodes.set(item.id, createNode(item));
  }

  const roots = new Map<string, TreeNode>();
  const placed = new Set<string>();

  for (const item of itemMap.values()) {
    const parents = extractParentIds(item.relToParent);
    const primary = primaryNodes.get(item.id)!;

    if (parents.length === 0) {
      if (!placed.has(item.id)) {
        roots.set(item.id, primary);
        placed.add(item.id);
      }
      continue;
    }

    const validParents = parents.filter((p) => itemMap.has(p));

    if (validParents.length > 0) {
      const firstParent = primaryNodes.get(validParents[0])!;
      firstParent.children.set(item.id, primary);
      placed.add(item.id);
      if (roots.has(item.id)) roots.delete(item.id);
    }
    // Items with parents that aren't in the dataset are silently skipped —
    // only items with truly NO parent (parents.length === 0) go to root.

    for (let i = 1; i < validParents.length; i++) {
      const dupe = createNode(item);
      dupe.children = new Map(primary.children);
      const parentNode = primaryNodes.get(validParents[i])!;
      parentNode.children.set(`${item.id}__dupe__${i}`, dupe);
    }
  }

  for (const [id, node] of roots) {
    root.children.set(id, node);
  }

  return root;
}

function flattenTree(
  node: TreeNode,
  depth: number,
  out: FacetTreeOption[],
  counts?: Map<string, number>,
  isSelected?: boolean,
  ancestors: string[] = [],
  exactMode?: boolean,
  dupeIdx?: { value: number },
  parentTrackId?: string
): void {
  const sorted = [...node.children.entries()].sort((a, b) =>
    a[1].segment.localeCompare(b[1].segment, undefined, { sensitivity: 'base' })
  );
  const ref = dupeIdx ?? { value: 0 };
  for (const [key, child] of sorted) {
    const count = counts?.get(child.itemId ?? '');
    const countLabel = count != null ? ` (${count})` : undefined;
    const label = child.segment;
    const pathParts = [...ancestors, child.segment];
    const fullPath = pathParts.join(' / ');
    if (child.itemId != null) {
      if (count === 0 && !isSelected) {
        if (exactMode) {
          const childStart = out.length;
          flattenTree(child, depth + 1, out, counts, isSelected, pathParts, exactMode, ref, parentTrackId);
          if (out.length > childStart) {
            const isDupe = key.includes('__dupe__');
            const trackId = isDupe ? `${child.itemId}__${ref.value++}` : child.itemId;
            out.splice(childStart, 0, {
              id: child.itemDisplayName ?? child.segment,
              label,
              depth,
              trackId,
              parentId: parentTrackId,
              countLabel: ' (0)',
              fullPath,
              status: child.itemStatus,
            });
          }
        } else {
          flattenTree(child, depth + 1, out, counts, isSelected, pathParts, exactMode, ref, parentTrackId);
        }
        continue;
      }
      const isDupe = key.includes('__dupe__');
      const trackId = isDupe ? `${child.itemId}__${ref.value++}` : child.itemId;
      out.push({
        id: child.itemDisplayName ?? child.segment,
        label,
        depth,
        trackId,
        parentId: parentTrackId,
        countLabel,
        fullPath,
        status: child.itemStatus,
      });
      flattenTree(child, depth + 1, out, counts, isSelected, pathParts, exactMode, ref, trackId);
    } else {
      flattenTree(child, depth + 1, out, counts, isSelected, pathParts, exactMode, ref, parentTrackId);
    }
  }
}

export function buildFacetTreeOptions(
  items: FacetRelationItem[],
  filterText: string,
  counts?: Map<string, number>,
  isSelected?: boolean,
  exactMode?: boolean
): FacetTreeOption[] {
  const trimmed = filterText ? filterText.trim() : '';
  let source: FacetRelationItem[];
  if (trimmed) {
    const matched = items.filter((item) => {
      const name = item.displayName ?? item.fullName ?? '';
      return matchesSearch(trimmed, name);
    });
    if (matched.length > 0) {
      const itemById = new Map(items.map(i => [i.id, i]));
      const childrenOf = new Map<string, FacetRelationItem[]>();
      for (const item of items) {
        for (const pid of extractParentIds(item.relToParent)) {
          const list = childrenOf.get(pid) ?? [];
          list.push(item);
          childrenOf.set(pid, list);
        }
      }
      const includeIds = new Set<string>();
      for (const m of matched) {
        if (includeIds.has(m.id)) continue;
        includeIds.add(m.id);
        // Include ancestors (walk up)
        let queue = [...extractParentIds(m.relToParent)];
        while (queue.length > 0) {
          const pid = queue.shift()!;
          if (includeIds.has(pid)) continue;
          includeIds.add(pid);
          const parent = itemById.get(pid);
          if (parent) queue.push(...extractParentIds(parent.relToParent));
        }
        // Include descendants (walk down)
        let descQueue = [...(childrenOf.get(m.id) ?? [])];
        while (descQueue.length > 0) {
          const child = descQueue.shift()!;
          if (includeIds.has(child.id)) continue;
          includeIds.add(child.id);
          descQueue.push(...(childrenOf.get(child.id) ?? []));
        }
      }
      source = items.filter(i => includeIds.has(i.id));
    } else {
      source = items;
    }
  } else {
    source = items;
  }
  const tree = buildTree(source);
  const out: FacetTreeOption[] = [];
  flattenTree(tree, 0, out, counts, isSelected, [], exactMode, { value: 0 });
  return out;
}
