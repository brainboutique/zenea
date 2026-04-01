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
  /** Technical suitability filter value. */
  technicalSuitability: string;
  /** Functional suitability filter value. */
  functionalSuitability: string;
  /** TIME classification filter value (tolerate, invest, migrate, eliminate, or empty). */
  lxTimeClassification: string;
  /** Business criticality filter value. */
  businessCriticality: string;
  /** Business capability filter: substring (contains) match on relation displayName. */
  relApplicationToBusinessCapability: string;
  /** User group filter: substring (contains) match on relation displayName. */
  relApplicationToUserGroup: string;
  /** Project filter: substring (contains) match on relation displayName. */
  relApplicationToProject: string;
  /** Data Products filter: substring (contains) match on relation displayName. */
  relApplicationToDataProduct: string;
  /** PlatformTEMP filter: exact match on platformTEMP value. */
  platformTEMP: string;
}

export function emptyEntityListFilters(): EntityListFilters {
  return {
    name: '',
    technicalSuitability: '',
    functionalSuitability: '',
    lxTimeClassification: '',
    businessCriticality: '',
    relApplicationToBusinessCapability: '',
    relApplicationToUserGroup: '',
    relApplicationToProject: '',
    relApplicationToDataProduct: '',
    platformTEMP: '',
  };
}