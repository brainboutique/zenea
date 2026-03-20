import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { PillComponent } from '../pill/pill.component';
import { PillItem } from './pill-item';

@Component({
  selector: 'app-pills',
  standalone: true,
  imports: [CommonModule, PillComponent],
  template: `
    <div class="pills">
      @for (item of items(); track item.label + $index) {
        <app-pill
          [label]="item.label"
          [backgroundColor]="item.color ?? '#999'"
          [title]="item.title ?? null"
        />
      }
    </div>
  `,
  styles: [`
    .pills {
      display: flex;
      flex-wrap: wrap;
      gap: 0px 10px;
      margin-top:4px;
      align-items: center;
    }
  `],
})
export class PillsComponent {
  /** List of items to render as pills. */
  items = input.required<PillItem[]>();
}
