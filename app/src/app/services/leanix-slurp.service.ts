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

import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface LeanixSlurpConfig {
  baseUrl: string;
  bearerToken: string;
  /** Cookie header value (mandatory), e.g. lxRegion=eu; _shibsession_...=... */
  cookies: string;
}

export interface LeanixSlurpResponse {
  total: number;
  stored?: number;
}

@Injectable({ providedIn: 'root' })
export class LeanixSlurpService {
  constructor(private http: HttpClient) {}

  async slurp(
    repoName: string,
    branch: string,
    config: LeanixSlurpConfig,
    typesCsv?: string
  ): Promise<LeanixSlurpResponse> {
    const safeRepo = encodeURIComponent(repoName);
    const safeBranch = encodeURIComponent(branch);
    const url = `/api/v1/${safeRepo}/${safeBranch}/leanix/slurp`;

    const body: any = {
      baseUrl: config.baseUrl,
      bearerToken: config.bearerToken,
      cookies: config.cookies,
    };
    if (typesCsv && typesCsv.trim() !== '') {
      body.types = typesCsv.trim();
    }

    return await firstValueFrom(
      this.http.post<LeanixSlurpResponse>(url, body, {
        withCredentials: true,
      })
    );
  }
}
