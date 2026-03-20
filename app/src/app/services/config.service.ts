import { Inject, Injectable, Optional } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { BASE_PATH } from './api/variables';

export interface UpdateConfigResponse {
  defaultRepositoryName?: string;
  defaultBranch?: string;
}

export interface LicenseResponse {
  license: string;
}

@Injectable({ providedIn: 'root' })
export class ConfigService {
  private get basePath(): string {
    const path = this.basePathValue;
    return Array.isArray(path) ? path[0] : path;
  }

  constructor(
    private httpClient: HttpClient,
    @Optional() @Inject(BASE_PATH) private basePathValue: string | string[]
  ) {}

  getLicense(): Observable<LicenseResponse> {
    return this.httpClient.get<LicenseResponse>(`${this.basePath}/api/v1/license`);
  }

  /**
   * Set the default repository and branch on the server (/data/.meta.json).
   */
  updateConfig(defaultRepositoryName: string, defaultBranch: string): Observable<UpdateConfigResponse> {
    const path = `${this.basePath}/api/v1/config`;
    return this.httpClient.put<UpdateConfigResponse>(path, {
      defaultRepositoryName: defaultRepositoryName.trim(),
      defaultBranch: defaultBranch.trim(),
    });
  }
}
