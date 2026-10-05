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

import { Component, input } from '@angular/core';
import { NgDiagramNodeSelectedDirective } from 'ng-diagram';
import { ProcessContainerNode } from './process-diagram.types';

@Component({
  selector: 'app-process-lanes-group-node',
  standalone: true,
  imports: [NgDiagramNodeSelectedDirective],
  template: `
    <div class="group-frame" ngDiagramNodeSelected [node]="node()"></div>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
      box-sizing: border-box;
    }

    .group-frame {
      box-sizing: border-box;
      width: 100%;
      height: 100%;
      background: transparent;
      border: 1px dashed #b9c4d4;
      border-radius: 8px;
      pointer-events: auto;
    }

    .group-frame.ng-diagram-node-selected {
      border-color: #1976d2;
    }
  `,
})
export class ProcessLanesGroupNodeComponent {
  node = input.required<ProcessContainerNode>();
}
