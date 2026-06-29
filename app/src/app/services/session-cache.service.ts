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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
 */

import { Injectable, inject } from '@angular/core';
import { ApplicationsService } from './ApplicationsService';
import { ServiceCatalogService } from './ServiceCatalogService';
import { CatalogServicesService } from './CatalogServicesService';
import { CatalogApplicationsService } from './CatalogApplicationsService';
import { UserGroupsDataService } from './UserGroupsDataService';
import { FacetsService } from './FacetsService';
import { TagsService } from './TagsService';
import { AttributePermissionsService } from './attribute-permissions.service';
import { CacheBusterService } from './cache-buster.service';

/**
 * Centralized cache invalidation for all data-caching services.
 * Call invalidateAll() on login/logout/session change to ensure fresh data.
 */
@Injectable({ providedIn: 'root' })
export class SessionCacheService {
  private applicationsService = inject(ApplicationsService);
  private serviceCatalogService = inject(ServiceCatalogService);
  private catalogServicesService = inject(CatalogServicesService);
  private catalogApplicationsService = inject(CatalogApplicationsService);
  private userGroupsDataService = inject(UserGroupsDataService);
  private facetsService = inject(FacetsService);
  private tagsService = inject(TagsService);
  private attrPerms = inject(AttributePermissionsService);
  private cacheBuster = inject(CacheBusterService);

  invalidateAll(): void {
    this.cacheBuster.bump();
    this.applicationsService.invalidateMigrationTargetOptionsCache();
    this.serviceCatalogService.invalidateCache();
    this.catalogServicesService.invalidateCache();
    this.catalogApplicationsService.invalidateCache();
    this.userGroupsDataService.invalidateCache();
    this.facetsService.invalidateCache();
    this.tagsService.invalidateCache();
    this.attrPerms.reset();
  }
}
