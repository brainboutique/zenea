import { Injectable, signal, effect } from '@angular/core';
import { EntityApiService } from './entity-api.service';
import { UserConfigService } from './user-config.service';

/** Single application from the applications list (id, displayName, optional TIME classification). */
export interface ApplicationItem {
  id: string;
  displayName: string;
  /** TIME classification e.g. "invest", "migrate"; used in migration target dialog to highlight invest apps. */
  lxTimeClassification?: string | null;
  /** Business capability displayNames; used for Jaccard similarity ordering. */
  capabilityNames?: string[];
}

@Injectable({ providedIn: 'root' })
export class ApplicationsService {
  /** When true, start loading applications (lazy to avoid duplicate list loads). */
  private readonly enabled = signal(false);

  /** Loaded applications list; empty until GET /api/v1/applications has completed. */
  readonly applications = signal<ApplicationItem[]>([]);
  /** Whether the applications list is currently loading. */
  readonly loading = signal<boolean>(false);

  /** Bump to force a reload of applications (used for migrationTarget dropdown invalidation). */
  private readonly cacheInvalidationNonce = signal(0);

  /** Last repo|branch key+nonce used to load applications, to avoid duplicate reloads. */
  private lastRepoBranchKey: string | null = null;
  private lastCacheInvalidationNonceSeen = 0;

  /** Sequence id to ignore stale in-flight loads. */
  private loadSeq = 0;

  constructor(private entityApi: EntityApiService, private userConfig: UserConfigService) {
    effect(
      () => {
        if (!this.enabled()) return;

        const repo = this.userConfig.getRepoName().trim() || 'local';
        const branch = this.userConfig.getBranch().trim() || 'default';
        const key = `${repo}|${branch}`;
        const nonce = this.cacheInvalidationNonce();
        if (this.lastRepoBranchKey === key && this.lastCacheInvalidationNonceSeen === nonce) return;
        this.lastRepoBranchKey = key;
        this.lastCacheInvalidationNonceSeen = nonce;
        this.applications.set([]);
        this.load();
      },
      { allowSignalWrites: true }
    );
  }

  /** Start (or re-start) loading applications; safe to call multiple times. */
  ensureLoaded(): void {
    this.enabled.set(true);
  }

  /**
   * Invalidate the browser-side cache of applications used in the migration target dialog.
   * Next open of the dialog will see the reloaded list.
   */
  invalidateMigrationTargetOptionsCache(): void {
    this.cacheInvalidationNonce.update((n) => n + 1);
  }

  load(): void {
    const seq = ++this.loadSeq;
    this.loading.set(true);

    // Read active applications from the (typed) entities API via EntityApiService.
    this.entityApi.listEntities().subscribe({
      next: (list) => {
        // If a newer load started, ignore this response.
        if (seq !== this.loadSeq) return;
        const safeList = Array.isArray(list) ? list : [];
        this.applications.set(
          safeList.map((e) => {
            const rawCaps = (e as any).relApplicationToBusinessCapability;
            const capabilityNames: string[] = Array.isArray(rawCaps)
              ? rawCaps
                  .map((c: any) => String(c?.displayName ?? c?.fullName ?? c?.id ?? '').trim())
                  .filter((s: string) => s.length > 0)
              : [];
            return {
              id: String((e as any).id ?? ''),
              displayName: String((e as any).displayName ?? ''),
              lxTimeClassification: (e as any).lxTimeClassification ?? undefined,
              capabilityNames,
            };
          })
        );
        this.loading.set(false);
      },
      error: () => {
        if (seq !== this.loadSeq) return;
        this.applications.set([]);
        this.loading.set(false);
      },
    });
  }
}
