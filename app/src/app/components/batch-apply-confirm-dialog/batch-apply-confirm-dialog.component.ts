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

import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { TranslatePipe } from '@ngx-translate/core';

export interface BatchApplyConfirmDialogData {
  filterLabel: string;
  filterValue: string;
  count: number;
  actionLabel: string;
}

@Component({
  selector: 'app-batch-apply-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ data.actionLabel | translate }}</h2>
    <mat-dialog-content>
      <p class="batch-apply-message">
        {{ 'Are you sure you want to apply' | translate }}
        <strong>'{{ data.filterLabel }}'</strong>
        {{ 'to all displayed' | translate }} {{ data.count }}
        {{ 'applications' | translate }}?
      </p>
      <p class="batch-apply-warning">
        {{ 'This will update the field for all matching applications.' | translate }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button mat-raised-button color="primary" (click)="confirm()">{{ data.actionLabel || ('Set' | translate) }}</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .batch-apply-message {
      margin: 0 0 8px 0;
      font-size: 0.9em;
      color: rgba(0, 0, 0, 0.8);
    }
    .batch-apply-warning {
      margin: 0;
      font-size: 0.85em;
      color: #c62828;
    }
    mat-dialog-content {
      padding-top: 8px;
    }
  `],
})
export class BatchApplyConfirmDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<BatchApplyConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: BatchApplyConfirmDialogData
  ) {}

  confirm(): void {
    this.dialogRef.close(true);
  }
}
