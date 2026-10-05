import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { FormsModule } from '@angular/forms';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ColumnVisibility } from './list.component';

export interface ColumnSelectorItem {
  id: string;
  label: string;
  visible: boolean;
  readable?: boolean;
}

export interface ColumnSelectorData {
  columns: ColumnSelectorItem[];
}

export interface ColumnSelectorResult {
  order: string[];
  visibility: ColumnVisibility;
}

@Component({
  selector: 'app-column-selector-dialog',
  standalone: true,
  imports: [CommonModule, FormsModule, MatDialogModule, MatCheckboxModule, MatIconModule, MatButtonModule, MatFormFieldModule, MatInputModule, DragDropModule],
  template: `
    <h2 mat-dialog-title>Column Selector</h2>
    <mat-dialog-content>
      <div class="filter-row">
        <button mat-stroked-button type="button" (click)="onClear()">Clear</button>
        <mat-form-field appearance="outline" class="filter-field">
          <mat-label>Filter columns</mat-label>
          <input matInput [(ngModel)]="filterText" placeholder="Type to filter...">
          @if (filterText) {
            <button matSuffix mat-icon-button aria-label="Clear" (click)="filterText = ''">
              <mat-icon>close</mat-icon>
            </button>
          }
        </mat-form-field>
      </div>
      <div
        cdkDropList
        (cdkDropListDropped)="onDrop($event)"
        class="column-list"
      >
        @for (col of filteredColumns(); track col.id; let i = $index) {
          <div class="column-item" cdkDrag [class.not-readable]="col.readable === false">
            <span class="drag-handle" cdkDragHandle>
              <mat-icon>drag_indicator</mat-icon>
            </span>
            <mat-checkbox
              [checked]="col.visible"
              (change)="col.visible = !col.visible"
            >
              <span class="column-label" [class.strikethrough]="col.readable === false">
                {{ col.label }}
              </span>
              @if (col.readable === false) {
                <mat-icon class="restricted-icon">disabled_visible</mat-icon>
              }
            </mat-checkbox>
          </div>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button (click)="onCancel()">Cancel</button>
      <button mat-raised-button color="primary" (click)="onApply()">Apply</button>
    </mat-dialog-actions>
  `,
  styles: [`
    .filter-row {
      display: flex;
      align-items: flex-start;
      gap: 8px;
      margin-top: 8px;
      margin-bottom: 8px;
    }
    .filter-field {
      flex: 1;
      margin-bottom: 0;
    }
    .column-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 260px;
      min-height: 320px;
    }
    .column-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      background: #fff;
      border-radius: 4px;
    }
    .column-item.not-readable {
      opacity: 0.55;
    }
    .column-item.cdk-drag-preview {
      box-shadow: 0 5px 10px rgba(0,0,0,0.15);
      padding: 4px 8px;
    }
    .column-item.cdk-drag-placeholder {
      opacity: 0.3;
    }
    .drag-handle {
      cursor: grab;
      display: flex;
      align-items: center;
      color: rgba(0,0,0,0.38);
    }
    .drag-handle:active {
      cursor: grabbing;
    }
    .drag-handle mat-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }
    .column-label.strikethrough {
      text-decoration: line-through;
      color: rgba(0,0,0,0.38);
    }
    .restricted-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      vertical-align: middle;
      color: rgba(0,0,0,0.38);
      margin-left: 4px;
    }
  `],
})
export class ColumnSelectorDialogComponent {
  private dialogRef = inject(MatDialogRef<ColumnSelectorDialogComponent>);
  private data: ColumnSelectorData = inject(MAT_DIALOG_DATA);

  columns: ColumnSelectorItem[] = this.data.columns.map(c => ({ ...c }));
  filterText = '';

  filteredColumns(): ColumnSelectorItem[] {
    if (!this.filterText) return this.columns;
    const term = this.filterText.toLowerCase();
    return this.columns.filter(c => c.label.toLowerCase().includes(term));
  }

  onDrop(event: CdkDragDrop<ColumnSelectorItem[]>): void {
    const filtered = this.filteredColumns();
    const movedItem = filtered[event.previousIndex];
    const targetItem = filtered[event.currentIndex];
    const fromIdx = this.columns.indexOf(movedItem);
    const toIdx = this.columns.indexOf(targetItem);
    if (fromIdx !== -1 && toIdx !== -1) {
      moveItemInArray(this.columns, fromIdx, toIdx);
    }
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onClear(): void {
    this.columns.forEach(c => c.visible = false);
  }

  onApply(): void {
    const result: ColumnSelectorResult = {
      order: this.columns.map(c => c.id),
      visibility: Object.fromEntries(this.columns.map(c => [c.id, { visibility: c.visible }])),
    };
    this.dialogRef.close(result);
  }
}
