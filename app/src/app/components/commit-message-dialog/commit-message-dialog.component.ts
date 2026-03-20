import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-commit-message-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatFormFieldModule,
    MatInputModule,
    TranslateModule,
  ],
  template: `
    <h2 mat-dialog-title>{{ 'Commit' | translate }}</h2>
    <mat-dialog-content>
      <mat-form-field appearance="outline" class="commit-message-field">
        <mat-label>{{ 'Commit message' | translate }}</mat-label>
        <input matInput [(ngModel)]="message" [placeholder]="'Optional message' | translate" />
      </mat-form-field>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close>{{ 'Cancel' | translate }}</button>
      <button mat-raised-button color="primary" (click)="submit()">{{ 'Commit' | translate }}</button>
    </mat-dialog-actions>
  `,
  styles: [
    `
      .commit-message-field {
        width: 100%;
        min-width: 280px;
      }
      mat-dialog-content {
        padding-top: 16px;
        overflow: visible;
      }
    `,
  ],
})
export class CommitMessageDialogComponent {
  message = '';

  constructor(private dialogRef: MatDialogRef<CommitMessageDialogComponent>) {}

  submit(): void {
    this.dialogRef.close(this.message?.trim() ?? '');
  }
}
