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

import { Injectable, inject } from '@angular/core';
import { NgDiagramModelService } from 'ng-diagram';
import type { ReferenceEditorItem } from '../../models/reference-editor-item';
import {
  LANE_HEIGHT,
  STEP_WIDTH,
  isInsideLane,
  isLaneNode,
  isStepNode,
  stepHeightFor,
} from './process-diagram.types';

/** Bridges between the diagram node templates and the owning ProcessDiagramComponent. */
@Injectable()
export class ProcessDiagramStateService {
  isReadOnly: () => boolean = () => false;

  /**
   * Node mutations must go through the flow-core commands (NgDiagramModelService):
   * the render pipeline only re-reads flow state, so writes to the plain
   * initializeModel() adapter (permanently persisted via toJSON) are never drawn.
   */
  private readonly modelService = inject(NgDiagramModelService);

  updateLabel(nodeId: string, label: string): void {
    if (this.isReadOnly()) return;
    const current = this.modelService.nodes().find((node) => node.id === nodeId);
    void this.modelService.updateNodes([
      { id: nodeId, data: { ...(current?.data ?? {}), label } },
    ]);
  }

  /** Stores the step's plain-text description (persisted with node.data). */
  updateDescription(nodeId: string, description: string): void {
    if (this.isReadOnly()) return;
    const current = this.modelService.nodes().find((node) => node.id === nodeId);
    void this.modelService.updateNodes([
      { id: nodeId, data: { ...(current?.data ?? {}), description } },
    ]);
  }

  /** Stores the step's linked capabilities and re-sizes (and re-centres) the node to fit. */
  updateCapabilities(nodeId: string, capabilities: ReferenceEditorItem[]): void {
    if (this.isReadOnly()) return;
    const nodes = this.modelService.nodes();
    const target = nodes.find((node) => node.id === nodeId);
    if (!target || !isStepNode(target)) return;

    const height = stepHeightFor(capabilities.length);
    const width = target.size?.width ?? STEP_WIDTH;
    const lane = nodes.filter(isLaneNode).find((candidate) => isInsideLane(target, candidate));
    const y = lane
      ? lane.position.y + ((lane.size?.height ?? LANE_HEIGHT) - height) / 2
      : target.position.y;

    void this.modelService.updateNodes([
      {
        id: nodeId,
        data: { ...(target.data ?? { label: '' }), capabilities },
        size: { width, height },
        position: { x: target.position.x, y },
      },
    ]);
  }
}
