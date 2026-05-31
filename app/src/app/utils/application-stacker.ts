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

import { ApplicationItem } from '../services/ApplicationsService';

/** ApplicationItem with stacking metadata. */
export interface StackableApplicationItem extends ApplicationItem {
  displayNameStacked?: string;
  stackedApplications?: ApplicationItem[];
}

/** Regex to remove parentheses content and surrounding whitespace: "SAP (EMEA)" -> "SAP" */
const PARENTHESIS_REGEX = /\s*\([^()]*\)\s*/g;

/**
 * Compute the stacked display name by removing all parenthesis content.
 * "SAP (EMEA)" -> "SAP", "App (UK) (Test)" -> "App"
 */
export function computeDisplayNameStacked(displayName: string): string {
  return displayName.replace(PARENTHESIS_REGEX, '').trim();
}

/**
 * Stack applications with the same displayNameStacked into pseudo-apps.
 * - displayName = displayNameStacked + "*"
 * - String values: concatenate unique values with ", "
 * - Relations (arrays): union all items
 * - stackedApplications: array of original apps
 */
export function stackApplications(apps: ApplicationItem[]): StackableApplicationItem[] {
  if (!apps || apps.length === 0) return [];

  const stackedNameMap = new Map<string, ApplicationItem[]>();

  for (const app of apps) {
    const stackedName = computeDisplayNameStacked(app.displayName);
    if (!stackedNameMap.has(stackedName)) {
      stackedNameMap.set(stackedName, []);
    }
    stackedNameMap.get(stackedName)!.push(app);
  }

  const result: StackableApplicationItem[] = [];

  const SKIP_KEYS = new Set(['id', 'displayName', 'displayNameStacked', 'stackedApplications', 'ApplicationLifecycle']);

  for (const [stackedName, groupApps] of stackedNameMap) {
    if (groupApps.length === 1) {
      result.push({ ...groupApps[0], displayNameStacked: stackedName });
      continue;
    }

    const pseudoApp: StackableApplicationItem = {
      ...groupApps[0],
      id: `stacked_${stackedName}`,
      displayName: stackedName,
      displayNameStacked: stackedName,
      stackedApplications: groupApps,
      ApplicationLifecycle: undefined,
    };

    for (const key of Object.keys(groupApps[0])) {
      if (SKIP_KEYS.has(key)) continue;

      const values = groupApps.map(a => (a as Record<string, unknown>)[key]);
      const allNumbers = values.every(v => v == null || typeof v === 'number');
      const allStrings = values.every(v => v == null || typeof v === 'string');
      const allArrays = values.every(v => v == null || Array.isArray(v));

      if (allNumbers) {
        const numbers = values.filter((v): v is number => typeof v === 'number');
        (pseudoApp as Record<string, unknown>)[key] = numbers.length === 0 ? null : numbers.reduce((sum, n) => sum + n, 0);
      } else if (allStrings) {
        (pseudoApp as Record<string, unknown>)[key] = mergeUniqueStrings(values as (string | null | undefined)[]);
      } else if (allArrays) {
        const arrays = values as (unknown[] | null | undefined)[];
        const firstNonNull = arrays.find(v => v && v.length > 0);
        if (firstNonNull && typeof firstNonNull[0] === 'object' && firstNonNull[0] !== null) {
          (pseudoApp as Record<string, unknown>)[key] = unionObjectsById(arrays as ({ id: string }[] | null | undefined)[]);
        } else {
          (pseudoApp as Record<string, unknown>)[key] = mergeUniqueArrays(arrays as string[][]);
        }
      }
    }

    const northStarValues = groupApps.map(a => (a as Record<string, unknown>)['northStarClassification'] as string | null | undefined).filter(v => v != null);
    if (northStarValues.length > 0) {
      if (northStarValues.includes('disputedNorthStar')) {
        (pseudoApp as Record<string, unknown>)['northStarClassification'] = 'disputedNorthStar';
      } else if (northStarValues.includes('northStar')) {
        (pseudoApp as Record<string, unknown>)['northStarClassification'] = 'northStar';
      } else if (northStarValues.includes('candidateNorthStar')) {
        (pseudoApp as Record<string, unknown>)['northStarClassification'] = 'candidateNorthStar';
      }
    }

    result.push(pseudoApp);
  }

  return result;
}

/** Merge non-empty unique strings with ", " separator. */
function mergeUniqueStrings(values: (string | null | undefined)[]): string {
  const unique = [...new Set(values.filter((v): v is string => typeof v === 'string' && v.length > 0))];
  return unique.join(', ');
}

/** Merge arrays and deduplicate by id. */
function mergeUniqueArrays(arrays: string[][]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const arr of arrays) {
    if (!arr) continue;
    for (const item of arr) {
      if (!seen.has(item)) {
        seen.add(item);
        result.push(item);
      }
    }
  }
  return result;
}

/** Union arrays of objects, deduplicating by `id`. */
function unionObjectsById(arrays: ({ id: string }[] | null | undefined)[]): { id: string }[] {
  const seen = new Map<string, { id: string }>();
  for (const arr of arrays) {
    if (!arr) continue;
    for (const item of arr) {
      if (!seen.has(item.id)) {
        seen.set(item.id, item);
      }
    }
  }
  return Array.from(seen.values());
}
