import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TranslateModule } from '@ngx-translate/core';
import { NorthStarClassificationComponent } from '../north-star-classification/north-star-classification.component';

@Component({
  selector: 'app-edit-field-north-star',
  standalone: true,
  imports: [CommonModule, TranslateModule, NorthStarClassificationComponent],
  template: `
    <div class="form-field-like">
      <span class="mat-label">{{ label() | translate }}</span>
      <div class="north-star-field">
        <app-north-star-classification
          [data]="data()!"
          [field]="field()"
          [description]="description()"
          [readOnly]="readOnly()"
          [onMutated]="onMutated()"
        />
      </div>
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }
    .form-field-like {
      margin-bottom: 1rem;
    }
    .mat-label {
      display: block;
      margin-bottom: 0.25rem;
      font-size: 0.75rem;
      color: rgba(0, 0, 0, 0.6);
    }
    .north-star-field {
      padding: 0.5rem 0;
    }
  `],
})
export class EditFieldNorthStarComponent {
  data = input.required<Record<string, unknown>>();
  field = input.required<string>();
  label = input.required<string>();
  description = input<string | null>(null);
  readOnly = input<boolean>(false);
  onMutated = input<() => void>(() => {});
}
