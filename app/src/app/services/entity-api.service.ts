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

import { Injectable, inject } from '@angular/core';
import { EntityService } from './api/api/entity.service';
import { BusinessCapabilitiesService } from './api/api/businessCapabilities.service';
import { UserGroupsService } from './api/api/userGroups.service';
import { PlatformsService } from './api/api/platforms.service';
import { DataProductsService } from './api/api/dataProducts.service';
import { UserConfigService } from './user-config.service';
import { Observable } from 'rxjs';
import { ListEntities200ResponseInner } from './api/model/listEntities200ResponseInner';

@Injectable({ providedIn: 'root' })
export class EntityApiService {
  private api = inject(EntityService);
  private businessCapabilities = inject(BusinessCapabilitiesService);
  private userGroups = inject(UserGroupsService);
  private platforms = inject(PlatformsService);
  private dataProducts = inject(DataProductsService);
  private userConfig = inject(UserConfigService);

  private repo(): string {
    return this.userConfig.getRepoName().trim() || 'local';
  }

  private branch(): string {
    return this.userConfig.getBranch().trim() || 'default';
  }

  listEntities(
    filterDisplayName?: string,
    filterTechnicalSuitability?: string,
    filterFunctionalSuitability?: string,
    filterRelApplicationToBusinessCapability?: string,
    filterRelApplicationToUserGroup?: string,
    filterRelApplicationToProject?: string,
    filterRelApplicationToDataProduct?: string,
    filterRelApplicationToPlatform?: string,
    filterPlatformTEMP?: string
  ): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(
      this.repo(),
      this.branch(),
      'Application',
      filterDisplayName,
      filterTechnicalSuitability,
      filterFunctionalSuitability,
      filterRelApplicationToBusinessCapability,
      filterRelApplicationToUserGroup,
      filterRelApplicationToProject,
      filterRelApplicationToDataProduct,
      filterRelApplicationToPlatform,
      filterPlatformTEMP
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List ALL Application entities without any filtering.
   * Used for client-side filtering after initial load.
   */
  listAllEntities(): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(
      this.repo(),
      this.branch(),
      'Application'
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List entities of a specific type from /api/v1/{repoName}/{branch}/entities/{type}.
   * Used by reference editors for relation targets (Application, ITComponent, Platform).
   */
  listEntitiesByType(type: string): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(this.repo(), this.branch(), type) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List ServiceCatalogSections with optional parent filtering.
   * @param parentsFilter - "null" for root items (empty parents), otherwise filter for items containing this GUID in parents array
   */
  listServiceCatalogSections(parentsFilter?: string): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(
      this.repo(),
      this.branch(),
      'ServiceCatalogSection',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      parentsFilter
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List ALL ServiceCatalogSections without any filtering.
   * Used for client-side filtering after initial load.
   */
  listAllServiceCatalogSections(): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(
      this.repo(),
      this.branch(),
      'ServiceCatalogSection'
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List ServiceCatalogServices with optional parent filtering.
   * @param parentsFilter - "null" for root items (empty parents), otherwise filter for items containing this GUID in parents array
   */
  listServiceCatalogServices(parentsFilter?: string): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(
      this.repo(),
      this.branch(),
      'ServiceCatalogService',
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      parentsFilter
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List ALL ServiceCatalogServices without any filtering.
   */
  listAllServiceCatalogServices(): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(
      this.repo(),
      this.branch(),
      'ServiceCatalogService'
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List business capabilities from /api/v1/{repoName}/{branch}/business-capabilities.
   * Returns cached list with { id, displayName } for each capability.
   */
  listBusinessCapabilities(): Observable<{ id: string; displayName: string }[]> {
    return this.businessCapabilities.getBusinessCapabilitiesRepoBranch(this.repo(), this.branch()) as Observable<{ id: string; displayName: string }[]>;
  }

  /**
   * List user groups from /api/v1/{repoName}/{branch}/user-groups.
   * Returns cached list with { id, displayName } for each group.
   */
  listUserGroups(): Observable<{ id: string; displayName: string }[]> {
    return this.userGroups.getUserGroupsRepoBranch(this.repo(), this.branch()) as Observable<{ id: string; displayName: string }[]>;
  }

  /**
   * List platforms from /api/v1/{repoName}/{branch}/platforms.
   * Returns cached list with { id, displayName } for each platform.
   */
  listPlatforms(): Observable<{ id: string; displayName: string }[]> {
    return this.platforms.getPlatformsRepoBranch(this.repo(), this.branch()) as Observable<{ id: string; displayName: string }[]>;
  }

  /**
   * List data products from /api/v1/{repoName}/{branch}/data-products.
   * Returns cached list with { id, displayName } for each data product.
   */
  listDataProducts(): Observable<{ id: string; displayName: string }[]> {
    return this.dataProducts.getDataProductsRepoBranch(this.repo(), this.branch()) as Observable<{ id: string; displayName: string }[]>;
  }

  getEntity(guid: string, type: string): Observable<unknown> {
    return this.api.getEntityRepoBranch(this.repo(), this.branch(), type, guid);
  }

  getServiceCatalogSection(guid: string): Observable<unknown> {
    return this.api.getEntityRepoBranch(this.repo(), this.branch(), 'ServiceCatalogSection', guid);
  }

  getServiceCatalogService(guid: string): Observable<unknown> {
    return this.api.getEntityRepoBranch(this.repo(), this.branch(), 'ServiceCatalogService', guid);
  }

  putEntity(guid: string, body: any, type: string): Observable<unknown> {
    return this.api.putEntityRepoBranch(this.repo(), this.branch(), type, guid, body);
  }

  patchEntity(guid: string, body: any, type: string): Observable<unknown> {
    return this.api.patchEntityRepoBranch(this.repo(), this.branch(), type, guid, body);
  }

  deleteEntity(guid: string, type: string): Observable<unknown> {
    return this.api.deleteEntityRepoBranch(this.repo(), this.branch(), type, guid);
  }
}

