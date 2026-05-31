import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogModule, MAT_DIALOG_DATA, MatDialogRef } from '@angular/material/dialog';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { DragDropModule, CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { ColumnVisibility } from './list.component';

export interface ColumnSelectorItem {
  id: string;
  label: string;
  visible: boolean;
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
  imports: [CommonModule, MatDialogModule, MatCheckboxModule, MatIconModule, MatButtonModule, DragDropModule],
  template: `
    <h2 mat-dialog-title>Column Selector</h2>
    <mat-dialog-content>
      <div
        cdkDropList
        (cdkDropListDropped)="onDrop($event)"
        class="column-list"
      >
        @for (col of columns; track col.id; let i = $index) {
          <div class="column-item" cdkDrag>
            <span class="drag-handle" cdkDragHandle>
              <mat-icon>drag_indicator</mat-icon>
            </span>
            <mat-checkbox
              [checked]="col.visible"
              (change)="col.visible = !col.visible"
            >
              {{ col.label }}
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
    .column-list {
      display: flex;
      flex-direction: column;
      gap: 4px;
      min-width: 260px;
    }
    .column-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 4px 0;
      background: #fff;
      border-radius: 4px;
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
  `],
})
export class ColumnSelectorDialogComponent {
  private dialogRef = inject(MatDialogRef<ColumnSelectorDialogComponent>);
  private data: ColumnSelectorData = inject(MAT_DIALOG_DATA);

  columns: ColumnSelectorItem[] = this.data.columns.map(c => ({ ...c }));

  onDrop(event: CdkDragDrop<ColumnSelectorItem[]>): void {
    moveItemInArray(this.columns, event.previousIndex, event.currentIndex);
  }

  onCancel(): void {
    this.dialogRef.close();
  }

  onApply(): void {
    const result: ColumnSelectorResult = {
      order: this.columns.map(c => c.id),
      visibility: Object.fromEntries(this.columns.map(c => [c.id, { visibility: c.visible }])),
    };
    this.dialogRef.close(result);
  }
}
