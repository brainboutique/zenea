import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MigrationTargetItem } from '../../models/migration-target-item';

@Component({
  selector: 'app-migration-target-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span
      class="migration-target-pill"
      [class.migration-target-pill--idea]="lifecycle() === 'Idea'"
      [class.migration-target-pill--planned]="lifecycle() === 'Planned'"
      [class.migration-target-pill--running]="lifecycle() === 'Running'"
      [class.migration-target-pill--done]="lifecycle() === 'Done'"
      [class.migration-target-pill-disabled]="disabled()"
      [attr.title]="title() ?? undefined"
    >
      {{ pillText() }}
    </span>
  `,
  styles: [
    `
      .migration-target-pill {
        display: inline-block;
        max-width: 240px;
        padding: 0.25rem 0.5rem;
        border-radius: 1rem;
        border: 1px solid rgba(0, 0, 0, 0.18);
        background: #f3f4f6; /* Idea: light gray */
        color: #333;
        font-size: 0.875rem;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        vertical-align: middle;
      }

      .migration-target-pill--idea {
        background: #f3f4f6;
      }

      .migration-target-pill--planned {
        background: #ffeddb; /* Planned: light orange */
      }

      .migration-target-pill--running {
        background: #dbeafe; /* Running: light blue */
      }

      .migration-target-pill--done {
        background: #dcfce7; /* Done: light green */
      }

      .migration-target-pill-disabled {
        color: #aaaaaa;
        border-color: #aaaaaa;
        background: #fafafa;
      }
    `,
  ],
})
export class MigrationTargetPillComponent {
  target = input.required<MigrationTargetItem>();
  disabled = input(false);

  lifecycle = computed(() => (this.target()?.lifecycle ?? null)?.toString() ?? null);

  private parts(): string[] {
    const t = this.target();
    const name = (t?.displayName ?? t?.id ?? '').toString().trim();
    if (!name) return [];

    const extra: string[] = [];
    if (t.lifecycle) extra.push(String(t.lifecycle));
    if (t.proportion != null && t.proportion !== 100) extra.push(`${t.proportion}%`);
    if (t.priority != null) extra.push(`P${t.priority}`);
    if (t.effort) extra.push(String(t.effort));
    if (t.eta) extra.push(String(t.eta));

    return [name, ...extra];
  }

  pillText = computed(() => {
    const p = this.parts();
    return p.length ? `${p.join(' | ')}` : '—';
  });

  title = computed(() => {
    const p = this.parts();
    return p.length ? p.join(' | ') : null;
  });
}

