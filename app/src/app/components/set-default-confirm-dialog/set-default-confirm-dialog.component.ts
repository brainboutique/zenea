import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';

export interface SetDefaultConfirmDialogData {
  repoName: string;
  branch: string;
}

@Component({
  selector: 'app-set-default-confirm-dialog',
  standalone: true,
  imports: [CommonModule, MatDialogModule, MatButtonModule],
  template: `
    <h2 mat-dialog-title>Set default</h2>
    <mat-dialog-content>
      <p class="set-default-message">
        Set the current branch {{ data.repoName }} / {{ data.branch }} as default?
      </p>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>Cancel</button>
      <button mat-raised-button color="primary" (click)="confirm()">Set default</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .set-default-message {
        margin: 0;
        min-width: 280px;
      }
      mat-dialog-content {
        padding-top: 8px;
      }
    `,
  ],
})
export class SetDefaultConfirmDialogComponent {
  constructor(
    private dialogRef: MatDialogRef<SetDefaultConfirmDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: SetDefaultConfirmDialogData
  ) {}

  confirm(): void {
    this.dialogRef.close(true);
  }
}
