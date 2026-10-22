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
 * You should have received a copy of the GNU Affero General Public License along with this program.  If not, see <https://www.gnu.org>.
 */

import { Component, input } from '@angular/core';
import { ProcessDiagramComponent } from '../../components/process-diagram/process-diagram.component';
import { EditFieldComponent } from '../../components/edit-field/edit-field.component';

export interface BusinessProcessData {
  type?: string;
  entityType?: string;
  displayName?: string;
  description?: string | null;
  rbaEntityId?: string;
  stableEaId?: string;
  id?: string;
  [key: string]: unknown;
}

@Component({
  selector: 'app-entity-business-process',
  standalone: true,
  imports: [EditFieldComponent, ProcessDiagramComponent],
  templateUrl: './entity-business-process.component.html',
  styleUrl: './entity-business-process.component.scss',
})
export class EntityBusinessProcessComponent {
  guid = input.required<string>();
  data = input.required<BusinessProcessData | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);
  /** Bumped by the host when an undo/redo snapshot changed the diagram payload (diagram remounts). */
  diagramRevision = input(0);

  onFieldMutated = (): void => {
    this.onDataMutated()?.();
  };
}
