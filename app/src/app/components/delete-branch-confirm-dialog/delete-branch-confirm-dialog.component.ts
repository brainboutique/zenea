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

export interface DeleteBranchConfirmDialogData {
  repoName: string;
  branch: string;
}

@Component({
  selector: 'app-delete-branch-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'Delete Branch' | translate }}</h2>
    <mat-dialog-content>
      <p class="delete-branch-message">
        {{ 'Are you sure you want to permanently delete the branch' | translate }}
        <strong>{{ data.repoName }} / {{ data.branch }}</strong>?
      </p>
      <p class="delete-branch-warning">
        {{ 'This action cannot be undone. All data in this branch folder will be removed.' | translate }}
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button mat-raised-button color="warn" (click)="confirm()">{{ 'Delete' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .delete-branch-message {
        margin: 0 0 8px 0;
        font-size: 0.9em;
        color: rgba(0, 0, 0, 0.8);
      }
      .delete-branch-warning {
        margin: 0;
        font-size: 0.85em;
        color: #c62828;
      }
      mat-dialog-content {
        padding-top: 8px;
      }
    `,
  ],
})
export class DeleteBranchConfirmDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<DeleteBranchConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: DeleteBranchConfirmDialogData
  ) {}

  confirm(): void {
    this.dialogRef.close(true);
  }
}
