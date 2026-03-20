import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { TranslateModule } from '@ngx-translate/core';

@Component({
  selector: 'app-generate-sampledata-dialog',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, MatDialogModule, MatFormFieldModule, MatInputModule, MatButtonModule, TranslateModule],
  templateUrl: './generate-sampledata-dialog.component.html',
  styleUrl: './generate-sampledata-dialog.component.scss',
})
export class GenerateSampledataDialogComponent {
  private dialogRef = inject(MatDialogRef<GenerateSampledataDialogComponent>);

  readonly minCount = 1;
  readonly maxCount = 200;

  countCtrl = new FormControl<number>(10, {
    nonNullable: true,
    validators: [Validators.required, Validators.min(this.minCount), Validators.max(this.maxCount)],
  });

  onCancel(): void {
    this.dialogRef.close(undefined);
  }

  onOk(): void {
    this.countCtrl.markAllAsTouched();
    if (this.countCtrl.invalid) return;
    const value = this.countCtrl.value ?? this.minCount;
    this.dialogRef.close(value);
  }
}

