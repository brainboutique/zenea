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

/** Single migration target with optional proportion, priority, effort, ETA, comments (stored per edge). */
export interface MigrationTargetItem {
  id: string;
  type?: string;
  displayName: string;
  lifecycle?: string | null;
  /** Proportion as percentage (0–100). Default 100. */
  proportion?: number | null;
  priority?: number | null;
  effort?: string | null;
  benefit?: string | null;
  eta?: string | null;
  /** Free-text comments for this migration target edge. */
  comments?: string | null;
  /** Start date as ISO string (YYYY-MM-DD) or null. */
  startDate?: string | null;
  /** End date as ISO string (YYYY-MM-DD) or null. */
  endDate?: string | null;
  /** Free-text project reference for this migration target edge. */
  projectReference?: string | null;
  /** User groups this migration is constrained to (n:m edges notation). */
  userGroup?: Array<{ id: string; displayName: string; fullName?: string }> | null;
}

export const MIGRATION_TARGET_LIFECYCLE_OPTIONS = ['Idea', 'Validated', 'Confirmed', 'Planned', 'Running', 'Done', 'Discarded'] as const;
export const MIGRATION_TARGET_PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const;
export const MIGRATION_TARGET_EFFORT_OPTIONS = ['S', 'M', 'L', 'XL', '>XL'] as const;
export const MIGRATION_TARGET_BENEFIT_OPTIONS = ['S', 'M', 'L', 'XL', '>XL'] as const;

/**
 * Generate ETA options dynamically: from 2 quarters before today to 3 years in the future.
 * Format: "YY/Qn" (e.g. "26/Q1").
 */
export function generateMigrationTargetEtaOptions(): string[] {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentQuarter = Math.floor(now.getMonth() / 3) + 1; // 1-4

  const startOffset = -2; // 2 quarters before today
  const endOffset = 12;   // 3 years = 12 quarters

  const options: string[] = [];
  for (let i = startOffset; i <= endOffset; i++) {
    let q = currentQuarter + i;
    let y = currentYear;
    while (q > 4) { q -= 4; y++; }
    while (q < 1) { q += 4; y--; }
    const yy = String(y).slice(-2);
    options.push(`${yy}/Q${q}`);
  }
  return options;
}
