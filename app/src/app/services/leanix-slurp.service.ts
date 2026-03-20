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
