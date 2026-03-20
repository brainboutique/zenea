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
    platformTEMP: '',
  };
}