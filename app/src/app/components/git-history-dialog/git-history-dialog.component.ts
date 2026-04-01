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

import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { MatDialogModule, MatDialogRef, MAT_DIALOG_DATA } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { TranslateModule } from '@ngx-translate/core';
import { UserConfigService } from '../../services/user-config.service';

export interface GitHistoryEntry {
  hash: string;
  shortHash: string;
  date: string;
  author: string;
  message: string;
}

export interface GitHistoryDialogData {
  entityId: string;
  entityType: string;
  displayName: string;
}

@Component({
  selector: 'app-git-history-dialog',
  standalone: true,
  imports: [
    CommonModule,
    MatDialogModule,
    MatButtonModule,
    MatTableModule,
    MatProgressSpinnerModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'GIT History' | translate }}</h2>
    <mat-dialog-content class="git-history-dialog-content">
      @if (loading()) {
        <div class="loading-container">
          <mat-spinner diameter="40"></mat-spinner>
        </div>
      } @else if (error()) {
        <p class="error-message">{{ error() }}</p>
      } @else if (entries().length === 0) {
        <p class="no-history">{{ 'No history available' | translate }}</p>
      } @else {
        <table mat-table [dataSource]="entries()" class="history-table">
          <ng-container matColumnDef="shortHash">
            <th mat-header-cell *matHeaderCellDef>{{ 'Commit' | translate }}</th>
            <td mat-cell *matCellDef="let entry" class="commit-cell">
              <code>{{ entry.shortHash }}</code>
            </td>
          </ng-container>

          <ng-container matColumnDef="date">
            <th mat-header-cell *matHeaderCellDef>{{ 'Date/Time' | translate }}</th>
            <td mat-cell *matCellDef="let entry" class="date-cell">
              {{ formatDate(entry.date) }}
            </td>
          </ng-container>

          <ng-container matColumnDef="author">
            <th mat-header-cell *matHeaderCellDef>{{ 'Author' | translate }}</th>
            <td mat-cell *matCellDef="let entry" class="author-cell">
              {{ entry.author }}
            </td>
          </ng-container>

          <ng-container matColumnDef="message">
            <th mat-header-cell *matHeaderCellDef>{{ 'Message' | translate }}</th>
            <td mat-cell *matCellDef="let entry" class="message-cell">
              {{ entry.message }}
            </td>
          </ng-container>

          <tr mat-header-row *matHeaderRowDef="displayedColumns"></tr>
          <tr mat-row *matRowDef="let row; columns: displayedColumns"></tr>
        </table>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'OK' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .git-history-dialog-content {
        min-width: 500px;
        width: 70vw;
        max-height: 70vh;
        overflow: auto;
      }

      .loading-container {
        display: flex;
        justify-content: center;
        padding: 32px;
      }

      .error-message {
        color: #f44336;
        padding: 16px;
      }

      .no-history {
        color: #666;
        padding: 16px;
        text-align: center;
      }

      .history-table {
        width: 100%;
      }

      .commit-cell code {
        background: #f5f5f5;
        padding: 2px 6px;
        border-radius: 3px;
        font-size: 0.9em;
      }

      .date-cell {
        white-space: nowrap;
      }

      .author-cell {
        white-space: nowrap;
        color: #666;
      }

      .message-cell {
        word-break: break-word;
      }

      th.mat-header-cell {
        font-weight: 600;
      }
    `,
  ],
})
export class GitHistoryDialogComponent {
  private dialogRef = inject(MatDialogRef<GitHistoryDialogComponent>);
  private data = inject<GitHistoryDialogData>(MAT_DIALOG_DATA);
  private http = inject(HttpClient);
  private userConfig = inject(UserConfigService);

  displayedColumns = ['shortHash', 'date', 'author', 'message'];
  entries = signal<GitHistoryEntry[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor() {
    this.loadHistory();
  }

  private loadHistory(): void {
    const repoName = encodeURIComponent(this.userConfig.getRepoName() || 'local');
    const branch = encodeURIComponent(this.userConfig.getBranch() || 'default');
    const type = encodeURIComponent(this.data.entityType);
    const guid = encodeURIComponent(this.data.entityId);

    const url = `/api/v1/${repoName}/${branch}/git/history/${type}/${guid}`;

    this.http
      .get<{ success: boolean; entries?: GitHistoryEntry[]; message?: string }>(url)
      .subscribe({
        next: (response) => {
          this.loading.set(false);
          if (response.success && response.entries) {
            this.entries.set(response.entries);
          } else {
            this.error.set(response.message || 'Failed to load history');
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(err.error?.message || err.message || 'Failed to load history');
        },
      });
  }

  formatDate(isoDate: string): string {
    try {
      const date = new Date(isoDate);
      return date.toLocaleString();
    } catch {
      return isoDate;
    }
  }
}
