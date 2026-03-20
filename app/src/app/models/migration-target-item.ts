/** Single migration target with optional proportion, priority, effort, ETA (stored per edge). */
export interface MigrationTargetItem {
  id: string;
  type?: string;
  displayName: string;
  lifecycle?: string | null;
  /** Proportion as percentage (0–100). Default 100. */
  proportion?: number | null;
  priority?: number | null;
  effort?: string | null;
  eta?: string | null;
}

export const MIGRATION_TARGET_LIFECYCLE_OPTIONS = ['Idea', 'Planned', 'Running', 'Done'] as const;
export const MIGRATION_TARGET_PRIORITY_OPTIONS = [1, 2, 3, 4, 5] as const;
export const MIGRATION_TARGET_EFFORT_OPTIONS = ['S', 'M', 'L', 'XL', '>XL'] as const;
export const MIGRATION_TARGET_ETA_OPTIONS = [
  'Q1/26', 'Q2/26', 'Q3/26', 'Q4/26',
  'Q1/27', 'Q2/27', 'Q3/27', 'Q4/27',
  'Q1/28', 'Q2/28', 'Q3/28', 'Q4/28',
] as const;
