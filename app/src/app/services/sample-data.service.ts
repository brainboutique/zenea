import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { forkJoin, map } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { MatSnackBar } from '@angular/material/snack-bar';
import { UserConfigService } from './user-config.service';
import { EntityApiService } from './entity-api.service';
import { EntityListRefreshService } from './entity-list-refresh.service';
import { GenerateSampledataDialogComponent } from '../components/generate-sampledata-dialog/generate-sampledata-dialog.component';
import { CRITICALITY_VALUES, SUITABILITY_VALUES } from '../components/suitability-rating/suitability-rating.component';

@Injectable({ providedIn: 'root' })
export class SampleDataService {
  private readonly dialog = inject(MatDialog);
  private readonly snackBar = inject(MatSnackBar);
  private readonly userConfig = inject(UserConfigService);
  private readonly entityApi = inject(EntityApiService);
  private readonly listRefresh = inject(EntityListRefreshService);

  /** Creates `count` demo applications directly and returns an Observable that completes when done. */
  generateSampleData(count: number): Observable<void> {
    const appNames = ['SAP S/4', 'Dynamics F&O', 'Microsoft D365', 'Infor', 'ZenEA', 'Workday', 'Salesforce', 'ServiceNow'];

    const requests = Array.from({ length: count }).map((_, index) => {
      const id = crypto.randomUUID();
      const baseName = appNames[index % appNames.length];
      const suffix = count > appNames.length ? ` #${index + 1}` : '';
      const displayName = `${baseName}${suffix}`;
      const randomFrom = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

      return this.entityApi.putEntity(id, {
        id, type: 'Application', status: 'ACTIVE', displayName,
        functionalSuitability: randomFrom(SUITABILITY_VALUES),
        technicalSuitability: randomFrom(SUITABILITY_VALUES),
        businessCriticality: randomFrom(CRITICALITY_VALUES),
      }, 'Application');
    });

    return forkJoin(requests).pipe(map(() => { this.listRefresh.triggerRefresh(); }));
  }

  openGenerateSampleDataDialog(): void {
    const ref = this.dialog.open(GenerateSampledataDialogComponent, {
      width: '420px',
    });

    ref.afterClosed().subscribe((count: number | undefined) => {
      if (!count || count <= 0) return;

      const repoName = this.userConfig.getRepoName().trim() || 'local';
      const branch = this.userConfig.getBranch().trim() || 'default';

      const appNames = ['SAP S/4', 'Dynamics F&O', 'Microsoft D365', 'Infor', 'ZenEA', 'Workday', 'Salesforce', 'ServiceNow'];

      const requests = Array.from({ length: count }).map((_, index) => {
        const id = crypto.randomUUID();
        const baseName = appNames[index % appNames.length];
        const suffix = count > appNames.length ? ` #${index + 1}` : '';
        const displayName = `${baseName}${suffix}`;

        const randomFrom = <T,>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)];

        const body: Record<string, unknown> = {
          id,
          type: 'Application',
          status: 'ACTIVE',
          displayName,
          functionalSuitability: randomFrom(SUITABILITY_VALUES),
          technicalSuitability: randomFrom(SUITABILITY_VALUES),
          businessCriticality: randomFrom(CRITICALITY_VALUES),
        };

        return this.entityApi.putEntity(id, body, 'Application');
      });

      if (requests.length === 0) return;

      this.snackBar.open(`Creating ${count} demo application(s)…`, undefined, {
        duration: 2000,
        panelClass: ['snackbar-info'],
      });

      import('rxjs').then(({ forkJoin }) => {
        forkJoin(requests).subscribe({
          next: () => {
            this.snackBar.open(`Created ${count} demo application(s).`, undefined, {
              duration: 3000,
              panelClass: ['snackbar-success'],
            });
            this.listRefresh.triggerRefresh();
          },
          error: (err) => {
            this.snackBar.open(err?.message ?? 'Failed to create sample applications.', undefined, {
              duration: 5000,
              panelClass: ['snackbar-error'],
            });
            this.listRefresh.triggerRefresh();
          },
        });
      });
    });
  }
}

