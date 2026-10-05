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
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslatePipe } from '@ngx-translate/core';

export interface EditOriginDialogData {
  repoName: string;
}

@Component({
  selector: 'app-edit-origin-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, TranslatePipe],
  template: `
    <h2 mat-dialog-title>{{ 'Change Origin URL' | translate }}</h2>
    <mat-dialog-content>
      <p class="edit-origin-message">
        {{ 'Update the remote origin URL for repository' | translate }} <strong>{{ data.repoName }}</strong>
      </p>
      <mat-form-field appearance="outline" subscriptSizing="dynamic" class="edit-origin-field">
        <mat-label>{{ 'New origin URL' | translate }}</mat-label>
        <input matInput [(ngModel)]="newUrl" (keydown.enter)="confirm()" autofocus />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button mat-raised-button color="primary" [disabled]="!newUrl.trim()" (click)="confirm()">{{ 'Update' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .edit-origin-message {
        margin: 0 0 12px 0;
        font-size: 0.9em;
        color: rgba(0, 0, 0, 0.7);
      }
      .edit-origin-field {
        width: 100%;
      }
      mat-dialog-content {
        padding-top: 8px;
      }
    `,
  ],
})
export class EditOriginDialogComponent {
  newUrl = '';

  constructor(
    private dialogRef: MatDialogRef<EditOriginDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: EditOriginDialogData
  ) {}

  confirm(): void {
    const url = this.newUrl.trim();
    if (url) {
      this.dialogRef.close(url);
    }
  }
}
