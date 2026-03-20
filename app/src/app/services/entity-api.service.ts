import { Injectable, inject } from '@angular/core';
import { EntityService } from './api/api/entity.service';
import { UserConfigService } from './user-config.service';
import { Observable } from 'rxjs';
import { ListEntities200ResponseInner } from './api/model/listEntities200ResponseInner';

@Injectable({ providedIn: 'root' })
export class EntityApiService {
  private api = inject(EntityService);
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
      filterPlatformTEMP
    ) as Observable<ListEntities200ResponseInner[]>;
  }

  /**
   * List entities of a specific type from /api/v1/{repoName}/{branch}/entities/{type}.
   * Used by reference editors for relation targets (BusinessCapability, UserGroup).
   */
  listEntitiesByType(type: string): Observable<ListEntities200ResponseInner[]> {
    return this.api.listEntitiesRepoBranch(this.repo(), this.branch(), type) as Observable<ListEntities200ResponseInner[]>;
  }

  getEntity(guid: string, type: string): Observable<unknown> {
    return this.api.getEntityRepoBranch(this.repo(), this.branch(), type, guid);
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

