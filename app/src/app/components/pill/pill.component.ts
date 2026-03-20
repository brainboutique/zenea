import { Component, input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="pill"
      [style.background]="backgroundColor()"
      [attr.title]="title() ?? undefined"
    >{{ label() }}</span>
  `,
  styles: [`
    .pill {
      display: inline-block;
      max-width: 60px;
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      font-size: 0.875rem;
      color: #fff;
      text-shadow: 0 0 1px rgba(0,0,0,0.3);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
  `],
})
export class PillComponent {
  /** Pill text. */
  label = input.required<string>();
  /** Background color (CSS value, e.g. #hex or rgb()). */
  backgroundColor = input<string>('#999');
  /** Tooltip/title (e.g. description). */
  title = input<string | null>(null);
}
