import { Component, Inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatProgressBarModule } from '@angular/material/progress-bar';
import { MatButtonModule } from '@angular/material/button';
import { LeanixSlurpService, LeanixSlurpConfig, LeanixSlurpResponse } from '../../services/leanix-slurp.service';
import { EntityListRefreshService } from '../../services/entity-list-refresh.service';

export interface SlurpLeanixProgressDialogData {
  baseUrl: string;
  bearerToken: string;
  cookies: string;
  repoName: string;
  branch: string;
  /** Comma-separated LeanIX fact sheet types, e.g. "Application,Platform" */
  types?: string;
}

@Component({
  selector: 'app-slurp-leanix-progress-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatProgressBarModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Slurp entities from LeanIX</h2>
    <mat-dialog-content class="slurp-progress-content">
      <p class="slurp-progress-status">{{ statusText() }}</p>
      <mat-progress-bar mode="determinate" [value]="progressValue()"></mat-progress-bar>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      @if (isDone()) {
        <button mat-raised-button color="primary" mat-dialog-close>Close</button>
      }
    </mat-dialog-actions>
  `,
  styles: [
    `
      .slurp-progress-content {
        min-width: 320px;
      }
      .slurp-progress-status {
        margin: 0 0 12px 0;
        color: rgba(0, 0, 0, 0.8);
      }
      mat-progress-bar {
        margin-bottom: 8px;
      }
    `,
  ],
})
export class SlurpLeanixProgressDialogComponent implements OnInit {
  statusText = signal('Fetching entity list...');
  progressValue = signal(0);
  isDone = signal(false);

  constructor(
    private dialogRef: MatDialogRef<SlurpLeanixProgressDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SlurpLeanixProgressDialogData,
    private leanix: LeanixSlurpService,
    private entityListRefresh: EntityListRefreshService
  ) {}

  ngOnInit(): void {
    this.runSlurp();
  }

  private async runSlurp(): Promise<void> {
    const config: LeanixSlurpConfig = {
      baseUrl: this.data.baseUrl,
      bearerToken: this.data.bearerToken,
      cookies: this.data.cookies,
    };
    try {
      this.statusText.set('Fetching entity list...');
      this.progressValue.set(10);

      const result: LeanixSlurpResponse = await this.leanix.slurp(
        this.data.repoName,
        this.data.branch,
        config,
        this.data.types
      );

      const total = typeof result.total === 'number' ? result.total : 0;
      const stored = typeof result.stored === 'number' ? result.stored : 0;
      this.statusText.set(stored === total ? `Slurped ${total} entity(s).` : `Slurped ${stored}/${total} entity(s).`);
      this.progressValue.set(100);
      this.isDone.set(true);
      this.entityListRefresh.triggerRefresh();
    } catch (err) {
      this.statusText.set(`Error: ${err instanceof Error ? err.message : String(err)}`);
      this.progressValue.set(100);
      this.isDone.set(true);
      this.entityListRefresh.triggerRefresh();
    }
  }
}
