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
 * You should have received a copy of the GNU Affero General Public License along with this program. If not, see <https://www.gnu.org>.
 */

import { Component, computed, effect, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { NgDiagramNodeSelectedDirective } from 'ng-diagram';
import { ProcessDiagramStateService } from './process-diagram-state.service';
import { ProcessLaneNode } from './process-diagram.types';

@Component({
  selector: 'app-process-lane-node',
  standalone: true,
  imports: [NgDiagramNodeSelectedDirective, TranslatePipe],
  template: `
    <div class="lane" ngDiagramNodeSelected [node]="node()">
      @if (editing()) {
        <input
          #editInput
          class="lane__edit"
          type="text"
          [value]="label()"
          (pointerdown)="$event.stopPropagation()"
          (click)="$event.stopPropagation()"
          (keydown.enter)="commit(editInput.value)"
          (keydown.escape)="cancel()"
          (blur)="commit(editInput.value)"
        />
      } @else {
        <span class="lane__label" title="{{ 'Double-click to rename' | translate }}" (dblclick)="startEdit()">{{ label() }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .lane {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      display: flex;
      align-items: center;
      padding: 0 16px;
      background: #f2f6fb;
      border: 1px solid #b9c4d4;
      border-radius: 4px;
      overflow: hidden;
      font-family: inherit;
    }

    .lane__label {
      color: #26364d;
      font-size: 0.875rem;
      font-weight: 700;
      letter-spacing: 0.02em;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
      cursor: text;
    }

    .lane__edit {
      box-sizing: border-box;
      width: 100%;
      max-width: 320px;
      padding: 2px 6px;
      border: 1px solid #1976d2;
      border-radius: 4px;
      background: #fff;
      color: #26364d;
      font-family: inherit;
      font-size: 0.875rem;
      font-weight: 700;
      outline: none;
    }

    .lane.ng-diagram-node-selected {
      border-color: #1976d2;
      box-shadow: 0 0 0 1px #1976d2;
    }
  `,
})
export class ProcessLaneNodeComponent {
  private readonly state = inject(ProcessDiagramStateService);

  node = input.required<ProcessLaneNode>();

  label = computed(() => this.node().data?.label ?? '');
  editing = signal(false);

  private readonly editInput = viewChild<ElementRef<HTMLInputElement>>('editInput');

  constructor() {
    effect(() => {
      if (!this.editing()) return;
      const inputElement = this.editInput()?.nativeElement;
      if (inputElement) {
        inputElement.focus();
        inputElement.select();
      }
    });
  }

  startEdit(): void {
    if (this.state.isReadOnly()) return;
    this.editing.set(true);
  }

  commit(raw: string): void {
    if (!this.editing()) return;
    const label = raw.trim();
    this.editing.set(false);
    if (!label || label === this.node().data?.label) return;
    this.state.updateLabel(this.node().id, label);
  }

  cancel(): void {
    this.editing.set(false);
  }
}
