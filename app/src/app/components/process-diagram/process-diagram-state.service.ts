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

import { Injectable } from '@angular/core';
import { DiagramAdapter } from './process-diagram.types';

/** Bridges between the diagram node templates and the owning ProcessDiagramComponent. */
@Injectable()
export class ProcessDiagramStateService {
  model: DiagramAdapter | null = null;
  isReadOnly: () => boolean = () => false;

  updateLabel(nodeId: string, label: string): void {
    if (!this.model || this.isReadOnly()) return;
    this.model.updateNodes((nodes) =>
      nodes.map((node) =>
        node.id === nodeId ? { ...node, data: { ...(node.data ?? {}), label } } : node,
      ),
    );
  }
}
