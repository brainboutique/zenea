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
import { HttpClient } from '@angular/common/http';
import { UserConfigService } from './user-config.service';
import { Observable } from 'rxjs';

export interface CustomFieldDefinition {
  label: Record<string, string>;
  type: 'number' | 'string' | 'textarea' | 'selectSingle' | 'selectMultiple';
  uom?: string;
  values?: string[];
}

export interface ModelDefinition {
  customFields?: Record<string, CustomFieldDefinition>;
}

export interface ModelDefinitionsResponse {
  [entityType: string]: ModelDefinition;
}

@Injectable({ providedIn: 'root' })
export class ModelDefinitionsService {
  private http = inject(HttpClient);
  private userConfig = inject(UserConfigService);

  private repo(): string {
    return this.userConfig.getRepoName().trim() || 'local';
  }

  private branch(): string {
    return this.userConfig.getBranch().trim() || 'default';
  }

  getModelDefinitions(): Observable<ModelDefinitionsResponse> {
    return this.http.get<ModelDefinitionsResponse>(
      `/api/v1/${this.repo()}/${this.branch()}/model-definitions`
    );
  }

  getCustomFieldsForType(entityType: string, definitions: ModelDefinitionsResponse): Record<string, CustomFieldDefinition> {
    return definitions[entityType]?.customFields ?? {};
  }
}
