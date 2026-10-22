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
 * You should have received a copy of the GNU Affero General Public License along
 * with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { Component, computed, inject, input, signal } from '@angular/core';
import { ProcessDiagramAutoFocusDirective } from './process-diagram-auto-focus.directive';
import { TranslatePipe } from '@ngx-translate/core';
import { NgDiagramNodeSelectedDirective, NgDiagramPortComponent } from 'ng-diagram';
import { ProcessDiagramStateService } from './process-diagram-state.service';
import { ProcessDecisionNode } from './process-diagram.types';

/**
 * Flowchart decision (diamond). The shape is a CSS clip-path diamond: an outer
 * layer paints the border, an inset inner layer paints the fill, so the outline
 * follows the clipped edges. The left/right ports sit exactly on the diamond
 * vertices, where edges attach.
 */
@Component({
  selector: 'app-process-decision-node',
  standalone: true,
  imports: [NgDiagramNodeSelectedDirective, NgDiagramPortComponent, TranslatePipe, ProcessDiagramAutoFocusDirective],
  template: `
    <div class="decision-wrap ng-diagram-port-hoverable-over-node">
      <div class="decision" ngDiagramNodeSelected [node]="node()">
        <div class="decision__shape"></div>
        @if (editing()) {
          <input
            #editInput
            class="decision__edit"
            appAutoFocus
            type="text"
            [value]="label()"
            (pointerdown)="$event.stopPropagation()"
            (click)="$event.stopPropagation()"
            (keydown.enter)="commit(editInput.value)"
            (keydown.escape)="cancel()"
            (blur)="commit(editInput.value)"
          />
        } @else {
          <span
            class="decision__label"
            title="{{ 'Double-click to rename' | translate }}"
            (dblclick)="startEdit()"
            >{{ label() }}</span
          >
        }
      </div>
      <ng-diagram-port id="port-left" type="both" side="left" />
      <ng-diagram-port id="port-right" type="both" side="right" />
    </div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }

    .decision-wrap {
      position: relative;
      box-sizing: border-box;
      width: 100%;
      height: 100%;
    }

    .decision {
      position: relative;
      box-sizing: border-box;
      display: flex;
      align-items: center;
      justify-content: center;
      width: 100%;
      height: 100%;
      // Outer layer = border; the inset shape below = fill.
      background: #9fb4d1;
      clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
      transition: background-color 0.1s ease-in-out;
    }

    .decision:hover {
      background: #6f8cb8;
    }

    .decision.ng-diagram-node-selected {
      background: #1976d2;
    }

    .decision__shape {
      position: absolute;
      inset: 2px;
      background: #dde7f6;
      clip-path: polygon(50% 0, 100% 50%, 50% 100%, 0 50%);
    }

    .decision__label {
      position: relative;
      display: block;
      max-width: 70%;
      color: #1e2f4a;
      font-size: 0.8125rem;
      font-weight: 600;
      line-height: 16px;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      user-select: none;
      cursor: text;
    }

    .decision__edit {
      position: relative;
      box-sizing: border-box;
      max-width: 76%;
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
export class ProcessDecisionNodeComponent {
  private readonly state = inject(ProcessDiagramStateService);

  node = input.required<ProcessDecisionNode>();

  label = computed(() => this.node().data?.label ?? '');
  editing = signal(false);

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
