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
 * Single handover object for entity/list filters.
 * Emitted by filter components so consumers (list page, future displays) can apply filters in one place.
 */
export interface EntityListFilters {
  /** Applied name filter (display name). */
  name: string;
  /** Status filter whitelist (ACTIVE, ARCHIVED). Defaults to ['ACTIVE']. Empty array = no status filter. */
  status: string[];
  /** Technical suitability whitelist filter values. Empty array = no filter. */
  technicalSuitability: string[];
  /** Functional suitability whitelist filter values. Empty array = no filter. */
  functionalSuitability: string[];
  /** TIME classification whitelist filter values. Empty array = no filter. */
  lxTimeClassification: string[];
  /** North star classification whitelist filter values. Empty array = no filter. */
  northStarClassification: string[];
  /** Business criticality whitelist filter values. Empty array = no filter. */
  businessCriticality: string[];
  /** Migration whitelist filter values ('from', 'to'). Empty array = no filter. */
  migrationFilter: ('from' | 'to')[];
  /** Business capability filter: entity GUID. */
  relApplicationToBusinessCapability: string;
  /** Business capability match mode: 'subtree' (default, includes descendants) or 'exact' (direct only). */
  relApplicationToBusinessCapabilityMode?: 'subtree' | 'exact';
  /** Business capability join mode: 'join_left' (default, linked at least to selection) or 'join_inner' (linked only to selection). */
  relApplicationToBusinessCapabilityJoin?: 'join_left' | 'join_inner';
  /** User group filter: entity GUID. */
  relApplicationToUserGroup: string;
  /** User group match mode: 'subtree' (default, includes descendants) or 'exact' (direct only). */
  relApplicationToUserGroupMode?: 'subtree' | 'exact';
  /** User group join mode: 'join_left' (default, linked at least to selection) or 'join_inner' (linked only to selection). */
  relApplicationToUserGroupJoin?: 'join_left' | 'join_inner';
  /** Project filter: substring (contains) match on relation displayName. */
  relApplicationToProject: string;
  /** Data Products filter: substring (contains) match on relation displayName. */
  relApplicationToDataProduct: string;
  /** Tag filter: array of tag IDs to filter by (AND logic). */
  tags: string[];
  /** Added tag group IDs (for UI persistence, even if no tag selected). */
  tagGroups?: string[];
  /** Custom field filters: fieldName → selected value(s) (whitelist for the filter pill). */
  customFields?: Record<string, string[]>;
  /** Added custom field IDs (for UI persistence, even if no value selected). */
  customFieldIds?: string[];
  /** Optional filter pill groups added to the view (for UI persistence; Status is always shown). */
  visiblePills?: string[];
}

/**
 * Query-param value written to the URL when the Status filter is unselected.
 * Empty whitelist renders as `status=ALL` for compatibility with older links.
 */
export const STATUS_URL_ALL = 'ALL';

export function emptyEntityListFilters(): EntityListFilters {
  return {
    name: '',
    status: ['ACTIVE'],
    technicalSuitability: [],
    functionalSuitability: [],
    lxTimeClassification: [],
    northStarClassification: [],
    businessCriticality: [],
    relApplicationToBusinessCapability: '',
    relApplicationToUserGroup: '',
    relApplicationToProject: '',
    relApplicationToDataProduct: '',
    migrationFilter: [],
    tags: [],
    customFields: {},
  };
}
