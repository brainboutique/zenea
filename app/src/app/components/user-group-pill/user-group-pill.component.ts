import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';

/** Border color by displayName prefix. */
function borderColorForDisplayName(displayName: string): string {
  const name = (displayName || '').trim();
  if (name.startsWith('Europe')) return '#1976d2'; // blue
  if (name.startsWith('Latin America')) return '#795548'; // brown
  if (name.startsWith('Asia Pacific')) return '#c62828'; // red
  if (name.startsWith('Group')) return '#2e7d32'; // green
  return '#ddd';
}

/** Icon filename by displayName content (first match: RMX, CEM, AGG). */
function iconForDisplayName(displayName: string): string | null {
  const name = (displayName || '').toUpperCase();
  if (name.includes('RMX')) return 'RMX.png';
  if (name.includes('CEM')) return 'CEM.png';
  if (name.includes('AGG')) return 'AGG.png';
  return null;
}

@Component({
  selector: 'app-user-group-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="pill" [style.borderColor]="borderColor()" [attr.title]="displayName() || undefined">
      <span class="pill-label">{{ fullName() }}</span>
      @if (iconSrc()) {
        <img class="pill-icon" [src]="iconSrc()" alt="" width="30" height="20" />
      }
    </span>
  `,
  styles: [`
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      padding: 0.25rem 0.5rem;
      border-radius: 1rem;
      border: 2px solid;
      font-size: 0.875rem;
      background: #f5f5f5;
      color: #333;
    }
    .pill-label {
      flex: 0 1 auto;
      max-width: 60px;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .pill-icon {
      flex-shrink: 0;
      width: 30px;
      height: 20px;
      object-fit: contain;
    }
  `],
})
export class UserGroupPillComponent {
  /** Visible label (fullName). */
  fullName = input.required<string>();
  /** Tooltip and used for border color / icon (displayName). */
  displayName = input.required<string>();

  borderColor = computed(() => borderColorForDisplayName(this.displayName()));

  iconSrc = computed(() => {
    const icon = iconForDisplayName(this.displayName());
    return icon ? `/icons/${icon}` : null;
  });
}
