import { Component, input, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';

export const NORTH_STAR_CLASSIFICATION_VALUES = ['northStar', 'candidateNorthStar', 'disputedNorthStar'] as const;
export type NorthStarValue = (typeof NORTH_STAR_CLASSIFICATION_VALUES)[number];

interface NorthStarOption {
  value: string | null;
  label: string;
  color: string;
  badge: string | null;
  badgeBg: string;
}

const OPTIONS: NorthStarOption[] = [
  { value: null, label: 'None', color: '#e0e0e0', badge: null, badgeBg: '' },
  { value: 'northStar', label: 'North Star', color: '#2e7d32', badge: null, badgeBg: '' },
  { value: 'candidateNorthStar', label: 'Candidate North Star', color: '#f57f17', badge: 'arrow_upward_alt', badgeBg: '#e65100' },
  { value: 'disputedNorthStar', label: 'Disputed North Star', color: '#1565c0', badge: 'bolt', badgeBg: '#c62828' },
];

function findOption(val: string | null): NorthStarOption | undefined {
  return OPTIONS.find(o => o.value === val);
}

@Component({
  selector: 'app-north-star-classification',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatMenuModule],
  template: `
    <span
      class="north-star-container"
      role="group"
      aria-label="North star classification"
      [attr.title]="description() || currentLabel() || null"
    >
      <span
        class="north-star-trigger"
        [class.clickable]="!readOnly()"
        [style.color]="iconColor()"
        [matMenuTriggerFor]="!readOnly() ? menu : null"
      >
        <mat-icon class="auto_awesome">auto_awesome</mat-icon>
        @if (badgeIcon()) {
          <span class="badge-circle" [style.background]="badgeBg()">
            <mat-icon class="badge-mat-icon">{{ badgeIcon() }}</mat-icon>
          </span>
        }
      </span>
      @if (showLabel()) {
        <span class="label-text" [style.color]="iconColor()">{{ currentLabel() }}</span>
      }
      @if (description()) {
        <mat-icon class="desc-icon">sticky_note_2</mat-icon>
      }

      <mat-menu #menu="matMenu" class="north-star-menu">
        @for (opt of allOptions; track $index) {
          <button
            type="button"
            mat-menu-item
            [class.selected]="currentValue() === opt.value"
            (click)="selectOption(opt.value)"
          >
            <span class="option-icon-wrap">
              <span class="icon-box">
                <mat-icon class="option-icon" [style.color]="opt.value ? opt.color : '#e0e0e0'">auto_awesome</mat-icon>
                @if (opt.badge) {
                  <span class="badge-circle option-badge" [style.background]="opt.badgeBg">
                    <mat-icon class="badge-mat-icon">{{ opt.badge }}</mat-icon>
                  </span>
                }
              </span>
            </span>
            <span class="option-label" [style.color]="opt.value ? opt.color : undefined">{{ opt.label }}</span>
          </button>
        }
      </mat-menu>
    </span>
  `,
  styles: [`
    .north-star-container {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .north-star-trigger {
      display: inline-flex;
      align-items: center;
      justify-content: left;
      position: relative;
      font-size: 22px;
      line-height: 1;
      color: #e0e0e0;
    }
    .north-star-trigger.clickable {
      cursor: pointer;
    }
    .auto_awesome {
      font-size: 22px;
      width: 22px;
      height: 22px;
      line-height: 22px;
    }
    .badge-circle {
      position: absolute;
      top: -5px;
      right: -5px;
      width: 14px;
      height: 14px;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1.5px solid #fff;
      box-sizing: content-box;
    }
    .badge-mat-icon {
      font-size: 10px;
      width: 10px;
      height: 10px;
      line-height: 10px;
      color: #fff;
    }
    .label-text {
      font-size: 0.8rem;
      color: rgba(0,0,0,0.7);
      margin-left: 4px;
      white-space: nowrap;
    }
    .desc-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      line-height: 14px;
      color: #f9a825;
      vertical-align: middle;
      cursor: default;
    }
    .option-icon-wrap {
      display: inline-flex;
      align-items: center;
      flex-shrink: 0;
      margin-right: 8px;
      .badge-mat-icon {
        margin-left: 12px;
      }
    }
    .icon-box {
      position: relative;
      display: inline-block;
      justify-content: center;
      width: 18px;
      height: 18px;
    }
    .option-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      line-height: 18px;
    }
    .option-badge {
      top: -5px;
      right: -5px;
      width: 12px;
      height: 12px;
    }
    .option-label {
      white-space: nowrap;
    }
    ::ng-deep .north-star-menu button.mat-mdc-menu-item.selected .option-label {
      font-weight: 600;
    }
    ::ng-deep .north-star-menu button.mat-mdc-menu-item.selected {
      background: rgba(0,0,0,0.06);
    }
  `],
})
export class NorthStarClassificationComponent {
  value = input<string | null>(null);
  data = input<Record<string, unknown> | null>(null);
  field = input<string>('northStarClassification');
  readOnly = input<boolean>(false);
  showLabel = input<boolean>(false);
  description = input<string | null>(null);
  onMutated = input<() => void>(() => {});

  private version = signal(0);

  readonly allOptions = OPTIONS;

  currentValue = computed(() => {
    this.version();
    const d = this.data();
    const f = this.field();
    if (d && f && d[f] !== undefined && d[f] !== null) {
      return String(d[f]);
    }
    const v = this.value();
    if (v != null) return v;
    return null;
  });

  currentLabel = computed(() => {
    const v = this.currentValue();
    if (!v) return '';
    return findOption(v)?.label ?? v;
  });

  iconColor = computed(() => {
    const v = this.currentValue();
    const opt = findOption(v);
    return opt?.color ?? '#e0e0e0';
  });

  badgeIcon = computed(() => {
    const v = this.currentValue();
    const opt = findOption(v);
    return opt?.badge ?? null;
  });

  badgeBg = computed(() => {
    const v = this.currentValue();
    const opt = findOption(v);
    return opt?.badgeBg ?? '';
  });

  selectOption(value: string | null): void {
    const d = this.data();
    const f = this.field();
    if (d && f) {
      d[f] = value;
      this.version.update(v => v + 1);
      this.onMutated()?.();
    }
  }
}
