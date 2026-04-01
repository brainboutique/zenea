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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org/>.
 */

import { Component, input, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { AlternativeItem } from '../../models/alternative-item';

const COMMENT_PREVIEW_LEN = 10;

@Component({
  selector: 'app-alternatives-pill',
  standalone: true,
  imports: [CommonModule],
  template: `
    <span class="alternatives-pill" [attr.title]="title() ?? undefined">
      {{ pillText() }}
    </span>
  `,
  styles: [
    `
      .alternatives-pill {
        display: inline-block;
        max-width: 280px;
        padding: 0.25rem 0.5rem;
        border-radius: 1rem;
        border: 1px solid rgba(0, 0, 0, 0.18);
        background: #eef2ff;
        color: #333;
        font-size: 0.875rem;
        text-overflow: ellipsis;
        overflow: hidden;
        white-space: nowrap;
        vertical-align: middle;
      }
    `,
  ],
})
export class AlternativesPillComponent {
  target = input.required<AlternativeItem>();

  private commentPreview(raw: string | null | undefined): string {
    const s = (raw ?? '').trim();
    if (s.length === 0) return '';
    if (s.length <= COMMENT_PREVIEW_LEN) return s;
    return `${s.slice(0, COMMENT_PREVIEW_LEN)}...`;
  }

  private parts(): string[] {
    const t = this.target();
    const name = (t?.displayName ?? t?.id ?? '').toString().trim();
    if (!name) return [];

    const extra: string[] = [];
    const ov = t.functionalOverlap;
    if (ov != null && ov !== 100) extra.push(`${ov}%`);
    const c = this.commentPreview(t.comment);
    if (c) extra.push(c);

    return [name, ...extra];
  }

  pillText = computed(() => {
    const p = this.parts();
    return p.length ? `${p.join(' | ')}` : '—';
  });

  title = computed(() => {
    const t = this.target();
    const name = (t?.displayName ?? t?.id ?? '').toString().trim();
    if (!name) return null;
    const parts: string[] = [name];
    const ov = t.functionalOverlap;
    if (ov != null && ov !== 100) parts.push(`${ov}%`);
    const full = (t.comment ?? '').trim();
    if (full) parts.push(full);
    return parts.join(' | ');
  });
}
