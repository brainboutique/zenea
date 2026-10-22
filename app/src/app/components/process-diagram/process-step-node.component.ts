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
import { MatDialog } from '@angular/material/dialog';
import { TranslatePipe } from '@ngx-translate/core';
import { NgDiagramBaseNodeTemplateComponent } from 'ng-diagram';
import { BcTreeService } from '../../services/bc-tree.service';
import type { ReferenceEditorDialogData, ReferenceEditorItem } from '../../models/reference-editor-item';
import { ReferenceEditorDialogComponent } from '../reference-editor-dialog/reference-editor-dialog.component';
import { ProcessDiagramStateService } from './process-diagram-state.service';
import { ProcessStepNode } from './process-diagram.types';

@Component({
  selector: 'app-process-step-node',
  standalone: true,
  imports: [NgDiagramBaseNodeTemplateComponent, TranslatePipe, ProcessDiagramAutoFocusDirective],
  template: `
    <ng-diagram-base-node-template [node]="node()" [attr.title]="description() || null">
      @if (editing()) {
        <input
          #editInput
          class="step__edit"
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
        <div class="step__body">
          <span class="step__label" [attr.title]="description() || ('Double-click to rename' | translate)" (dblclick)="startEdit()">
            {{ label() }}
          </span>
          <hr class="step__divider" />
          <ul
            class="step__caps"
            title="{{ 'Double-click to manage capabilities' | translate }}"
            (dblclick)="editCapabilities($event)"
          >
            @for (cap of capabilities(); track cap.id) {
              <li [title]="cap.displayName">{{ cap.displayName }}</li>
            } @empty {
              <li class="step__caps--empty">{{ 'No capabilities' | translate }}</li>
            }
          </ul>
        </div>
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

    .step__body {
      display: flex;
      flex-direction: column;
      width: 100%;
    }

    .step__label {
      display: block;
      width: 100%;
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

    .step__divider {
      box-sizing: border-box;
      width: 100%;
      margin: 3px 0;
      border: none;
      border-top: 1px solid #9fb4d1;
    }

    .step__caps {
      margin: 0;
      padding-left: 1.1em;
      color: #33415c;
      font-size: 0.6875rem;
      font-weight: 400;
      list-style: disc;
      user-select: none;
    }

    .step__caps li {
      line-height: 15px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .step__caps--empty {
      list-style: none;
      color: #7a8699;
      font-style: italic;
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
  private readonly dialog = inject(MatDialog);
  private readonly bcTree = inject(BcTreeService);

  node = input.required<ProcessStepNode>();

  label = computed(() => this.node().data?.label ?? '');
  capabilities = computed<ReferenceEditorItem[]>(() => this.node().data?.capabilities ?? []);
  /** Plain-text description (shown as the node's hover title; edited in the Steps table). */
  description = computed(() => this.node().data?.description ?? '');
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

  editCapabilities(event: Event): void {
    event.stopPropagation();
    if (this.state.isReadOnly()) return;
    if (!this.bcTree.loaded()) this.bcTree.load();
    const allBcs = this.bcTree.rawItems();

    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: {
        targetType: 'BusinessCapability',
        currentSelection: this.capabilities().map((item) => ({ ...item })),
        ...(allBcs.length > 0 ? { allBusinessCapabilities: allBcs } : {}),
      } satisfies ReferenceEditorDialogData,
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      this.state.updateCapabilities(this.node().id, result);
    });
  }
}
