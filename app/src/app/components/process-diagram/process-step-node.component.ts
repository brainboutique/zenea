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
import { NgDiagramBaseNodeTemplateComponent } from 'ng-diagram';
import { ProcessDiagramStateService } from './process-diagram-state.service';
import { ProcessStepNode } from './process-diagram.types';

@Component({
  selector: 'app-process-step-node',
  standalone: true,
  imports: [NgDiagramBaseNodeTemplateComponent, TranslatePipe],
  template: `
    <ng-diagram-base-node-template [node]="node()">
      @if (editing()) {
        <input
          #editInput
          class="step__edit"
          type="text"
          [value]="label()"
          (pointerdown)="$event.stopPropagation()"
          (click)="$event.stopPropagation()"
          (keydown.enter)="commit(editInput.value)"
          (keydown.escape)="cancel()"
          (blur)="commit(editInput.value)"
        />
      } @else {
        <span class="step__label" title="{{ 'Double-click to rename' | translate }}" (dblclick)="startEdit()">{{ label() }}</span>
      }
    </ng-diagram-base-node-template>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      --ngd-node-bg-primary-default: #dde7f6;
      --ngd-node-border-color: #9fb4d1;
    }

    .step__label {
      display: block;
      width: 100%;
      color: #1e2f4a;
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 1.25;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
      cursor: text;
    }

    .step__edit {
      box-sizing: border-box;
      width: 100%;
      padding: 1px 4px;
      border: 1px solid #1976d2;
      border-radius: 4px;
      background: #fff;
      color: #1e2f4a;
      font-family: inherit;
      font-size: 0.8125rem;
      font-weight: 600;
      text-align: center;
      outline: none;
    }
  `,
})
export class ProcessStepNodeComponent {
  private readonly state = inject(ProcessDiagramStateService);

  node = input.required<ProcessStepNode>();

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
