/*
 * Copyright (C) 2026 BrainBoutique Solutions GmbH (Wilko Hein)
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as
 * published by the Free Software Foundation, version 3.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org>.
 */

/**
 * Wire shape of a relation field on entities read from the backend.
 *
 * Example (after the list-endpoint fold was removed):
 *   {
 *     edges: [
 *       { node: { factSheet: { id, displayName, fullName, ... } }, coverage, comments },
 *       ...
 *     ]
 *   }
 */
export interface RelationData {
  edges?: Array<{
    node?: { factSheet?: Record<string, unknown> };
    coverage?: number;
    comments?: string;
    [key: string]: unknown;
  }>;
  /** Optional dynamic filter condition attached to this relation (used by service-catalog items). */
  dynamic?: Array<Record<string, unknown>>;
}

/** Flat view of one edge node, suitable for UI (filters, pills, sort). */
export interface RelationItem {
  id: string;
  displayName: string;
  fullName?: string;
  type?: string;
  category?: string;
  description?: string;
  coverage?: number;
  comments?: string;
  [key: string]: unknown;
}

function factSheetToItem(fs: Record<string, unknown> | undefined, edge?: Record<string, unknown>): RelationItem {
  const item: RelationItem = {
    id: String(fs?.['id'] ?? ''),
    displayName: String(fs?.['displayName'] ?? fs?.['fullName'] ?? fs?.['id'] ?? ''),
  };
  const fullName = fs?.['fullName'];
  if (typeof fullName === 'string' && fullName) item.fullName = fullName;
  const type = fs?.['type'];
  if (typeof type === 'string') item.type = type;
  const category = fs?.['category'];
  if (typeof category === 'string') item.category = category;
  const description = fs?.['description'];
  if (typeof description === 'string') item.description = description;
  if (edge) {
    if (typeof edge['coverage'] === 'number') item.coverage = edge['coverage'] as number;
    const c = edge['comments'];
    if (typeof c === 'string' && c) item.comments = c;
  }
  return item;
}

/**
 * Read a relation field and return its items as a flat array of factSheet-derived entries.
 *
 * Accepts the wire shape `{edges:[...]}` OR a legacy flat array (defensive for in-flight migrations).
 * Returns an empty array for missing/null/shape-mismatched input.
 */
export function readRelationItems(rel: unknown): RelationItem[] {
  if (!rel) return [];
  if (Array.isArray(rel)) {
    return (rel as unknown[])
      .map((it) => {
        if (!it || typeof it !== 'object') return null;
        const obj = it as Record<string, unknown>;
        if (obj['node'] && typeof obj['node'] === 'object') {
          return factSheetToItem((obj['node'] as { factSheet?: Record<string, unknown> })['factSheet'], obj);
        }
        return factSheetToItem(obj);
      })
      .filter((x): x is RelationItem => x != null && x.id !== '');
  }
  if (typeof rel !== 'object') return [];
  const r = rel as RelationData;
  if (!Array.isArray(r.edges)) return [];
  return r.edges
    .map((edge) => {
      const fs = edge?.node?.factSheet;
      if (!fs || typeof fs !== 'object') return null;
      return factSheetToItem(fs as Record<string, unknown>, edge as Record<string, unknown>);
    })
    .filter((x): x is RelationItem => x != null && x.id !== '');
}
