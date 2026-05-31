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

export interface ServiceCatalogSection {
  type?: 'ServiceCatalogSection';
  id?: string;
  displayName?: string;
  description?: string | null;
  parents?: string[];
  applications?: RelationData;
  services?: RelationData;
  userGroups?: RelationData;
  abstract?: boolean;
  relServiceCatalogSectionToBusinessCapability?: RelationData;
  sortOrder?: number | null;
  edcNumber?: string;
  edcSLA?: string;
  edcServiceWindow?: string;
  etcFunctionalities?: string;
  edcScope?: string;
  edcApplications?: string[];
  edcCustomerCompanies?: string[];
  edcSegments?: string[];
  [key: string]: unknown;
}

export interface ServiceCatalogServiceEntity {
  type?: 'ServiceCatalogService';
  id?: string;
  displayName?: string;
  description?: string | null;
  parents?: string[];
  services?: RelationData;
  [key: string]: unknown;
}

export interface RelationData {
  edges?: Array<{ node?: { factSheet?: Record<string, unknown> } }>;
}
