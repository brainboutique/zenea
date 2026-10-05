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

import { Component, computed, ElementRef, inject, input, OnDestroy, OnInit, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';
import {
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  NgDiagramViewportService,
  initializeModel,
  provideNgDiagram,
} from 'ng-diagram';
import { ProcessDiagramStateService } from './process-diagram-state.service';
import { ProcessLaneNodeComponent } from './process-lane-node.component';
import { ProcessLanesGroupNodeComponent } from './process-lanes-group-node.component';
import { ProcessStepNodeComponent } from './process-step-node.component';
import {
  DiagramNode,
  GROUP_ID,
  GROUP_TYPE,
  LANE_HEIGHT,
  LANE_PADDING_X,
  LANE_TYPE,
  LANE_WIDTH,
  ProcessDiagramPayload,
  STEP_GAP,
  STEP_HEIGHT,
  STEP_TYPE,
  STEP_WIDTH,
  STEP_Z_ORDER,
  buildContainer,
  isContainerNode,
  isConnectedEdge,
  isInsideLane,
  isLaneNode,
  isStepNode,
  prepareDiagram,
  readStoredDiagram,
  seedProcessDiagram,
} from './process-diagram.types';

const PERSIST_DEBOUNCE_MS = 600;

/** Temporary diagnostics marker: confirms which build is running (window.__pd()). */
const PD_VERSION = 'pd-2026-10-05d';
const pdErrors: string[] = [];
if (typeof window !== 'undefined') {
  window.addEventListener('error', (event) => {
    if (pdErrors.length < 10) pdErrors.push(String(event.message));
  });
  const originalError = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    if (pdErrors.length < 10) {
      pdErrors.push(
        args
          .map((a) => {
            if (typeof a === 'string') return a;
            if (a instanceof Error) return a.message;
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          })
          .join(' ')
          .slice(0, 300),
      );
    }
    originalError(...args);
  };
}

@Component({
  selector: 'app-process-diagram',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    TranslatePipe,
    NgDiagramComponent,
    NgDiagramBackgroundComponent,
  ],
  providers: [provideNgDiagram(), ProcessDiagramStateService],
  templateUrl: './process-diagram.component.html',
  styleUrl: './process-diagram.component.scss',
})
export class ProcessDiagramComponent implements OnInit, OnDestroy {
  data = input.required<ProcessDiagramPayload | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);

  /** Diagram model owned by ngDiagram, seeded once from the payload's "diagram" property. */
  readonly model = initializeModel();

  readonly nodeTemplateMap = new NgDiagramNodeTemplateMap();

  readonly config = computed(() => ({
    hideWatermark: true,
    nodeDraggingEnabled: !this.readOnly(),
    nodeRotation: { defaultRotatable: false },
    linking: { portSnapDistance: 100 },
    danglingEdges: { enabled: true },
    zoom: { zoomToFit: { onInit: true, padding: 40 } },
    grouping: {
      canGroup: (node: DiagramNode, group: DiagramNode): boolean =>
        isLaneNode(node) && isContainerNode(group),
    },
  }));

  private readonly state = inject(ProcessDiagramStateService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly diagramEl = viewChild('diagram', { read: ElementRef });

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private fitTimers: ReturnType<typeof setTimeout>[] = [];
  private lastSerialized = '';
  private destroyed = false;

  constructor() {
    this.nodeTemplateMap.set(LANE_TYPE, ProcessLaneNodeComponent);
    this.nodeTemplateMap.set(STEP_TYPE, ProcessStepNodeComponent);
    this.nodeTemplateMap.set(GROUP_TYPE, ProcessLanesGroupNodeComponent);
    if (typeof window !== 'undefined') {
      (window as unknown as { __pd?: () => string }).__pd = () => this.diagnostics();
    }
  }

  /** One-shot runtime dump for debugging (run `__pd()` in the browser console). */
  private diagnostics(): string {
    const host = this.diagramEl()?.nativeElement as HTMLElement | undefined;
    const rect = host?.getBoundingClientRect();
    const canvas = document.querySelector('ng-diagram-canvas');
    const rootStyles = getComputedStyle(document.documentElement);
    return JSON.stringify(
      {
        version: PD_VERSION,
        rect: rect
          ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
          : null,
        transform: canvas ? getComputedStyle(canvas).transform : null,
        viewport: { w: window.innerWidth, h: window.innerHeight, scrollY: Math.round(window.scrollY) },
        edgeStrokeToken: rootStyles.getPropertyValue('--ngd-default-edge-stroke').trim(),
        modelNodes: this.model.getNodes().map((n) => ({
          id: n.id,
          pos: [Math.round(n.position.x), Math.round(n.position.y)],
          size: n.size ? [Math.round(n.size.width), Math.round(n.size.height)] : null,
          z: (n as { zOrder?: number }).zOrder ?? null,
          cz: (n as { computedZIndex?: number | null }).computedZIndex ?? null,
          hidden: (n as { computedHidden?: boolean }).computedHidden ?? null,
        })),
        domNodes: Array.from(document.querySelectorAll('ng-diagram-node')).map((el) => {
          const b = el.getBoundingClientRect();
          const cs = getComputedStyle(el);
          return {
            id: (el as HTMLElement).dataset['nodeId'] ?? '?',
            xywh: [Math.round(b.x), Math.round(b.y), Math.round(b.width), Math.round(b.height)],
            z: cs.zIndex,
            vis: cs.visibility,
            op: cs.opacity,
          };
        }),
        modelEdges: this.model.getEdges().map((e) => ({
          s: (e as { source?: string | null }).source ?? null,
          t: (e as { target?: string | null }).target ?? null,
        })),
        edgeEls: document.querySelectorAll('ng-diagram-edge').length,
        errors: pdErrors,
      },
      null,
      1,
    );
  }

  ngOnInit(): void {
    this.state.model = this.model;
    this.state.isReadOnly = () => this.readOnly();
    this.loadDiagram();
    this.lastSerialized = this.serialize();
    this.model.onChange(this.handleModelChange);

    // Re-fit once layout has settled and once more after the engine's
    // measurement timeout window. fitToContent() measures the host element
    // directly, so it cannot be thrown off by stale viewport metadata.
    this.fitTimers = [500, 2500].map((delay) =>
      setTimeout(() => {
        if (this.destroyed) return;
        this.fitToContent();
      }, delay),
    );
  }

  /** Centres all nodes inside the canvas using the live host rect. */
  private fitToContent(): void {
    const host = this.diagramEl()?.nativeElement;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const padding = 40;
    const availWidth = rect.width - padding * 2;
    const availHeight = rect.height - padding * 2;
    if (availWidth <= 0 || availHeight <= 0) return;

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const node of this.model.getNodes()) {
      const width = node.size?.width ?? 0;
      const height = node.size?.height ?? 0;
      if (width <= 0 || height <= 0) continue;
      minX = Math.min(minX, node.position.x);
      minY = Math.min(minY, node.position.y);
      maxX = Math.max(maxX, node.position.x + width);
      maxY = Math.max(maxY, node.position.y + height);
    }
    const contentWidth = maxX - minX;
    const contentHeight = maxY - minY;
    if (!(contentWidth > 0) || !(contentHeight > 0)) return;

    const scale = Math.min(availWidth / contentWidth, availHeight / contentHeight);
    if (!(scale > 0) || !Number.isFinite(scale)) return;
    const x = (rect.width - contentWidth * scale) / 2 - minX * scale;
    const y = (rect.height - contentHeight * scale) / 2 - minY * scale;
    void this.viewportService.setViewport(x, y, scale);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.fitTimers.forEach((timer) => clearTimeout(timer));
    this.model.unregisterOnChange(this.handleModelChange);
    this.clearPersistTimer();
  }

  addStep(): void {
    if (this.readOnly()) return;

    const nodes = this.model.getNodes();
    const lanes = nodes.filter(isLaneNode).sort((a, b) => a.position.y - b.position.y);
    if (lanes.length === 0) return;

    const steps = nodes.filter(isStepNode);

    let target = lanes[0];
    let fewest = Infinity;
    for (const lane of lanes) {
      const count = steps.filter((step) => isInsideLane(step, lane)).length;
      if (count < fewest) {
        fewest = count;
        target = lane;
      }
    }

    const laneWidth = target.size?.width ?? LANE_WIDTH;
    const laneHeight = target.size?.height ?? LANE_HEIGHT;
    const siblings = steps.filter((step) => isInsideLane(step, target));
    const rightEdge = siblings.reduce(
      (max, step) => Math.max(max, step.position.x + (step.size?.width ?? STEP_WIDTH)),
      target.position.x + LANE_PADDING_X,
    );
    const x = rightEdge + STEP_GAP;
    const y = target.position.y + (laneHeight - STEP_HEIGHT) / 2;

    let number = steps.length + 1;
    let id = `step-${number}`;
    while (nodes.some((node) => node.id === id)) {
      number += 1;
      id = `step-${number}`;
    }

    const requiredWidth = x + STEP_WIDTH + LANE_PADDING_X - target.position.x;
    const newWidth = Math.max(laneWidth, requiredWidth);
    const step: DiagramNode = {
      id,
      type: STEP_TYPE,
      autoSize: false,
      zOrder: STEP_Z_ORDER,
      size: { width: STEP_WIDTH, height: STEP_HEIGHT },
      position: { x, y },
      data: { label: `Step ${number}` },
    };

    // Widen the lane and its container frame in place (identity-preserving for
    // untouched nodes so the z-index middleware is not disturbed), then add the
    // step through the model service so it is registered as a real addition
    // (gets computed z-index, internal id and measurement).
    if (newWidth !== laneWidth) {
      this.model.updateNodes((current) => {
        const resized = current.map((node): DiagramNode => {
          if (node.id !== target.id) return node;
          return { ...node, size: { width: newWidth, height: laneHeight } };
        });
        const lanes = resized.filter(isLaneNode);
        const container = lanes.length > 0 ? buildContainer(lanes) : null;
        return container
          ? resized.map((node): DiagramNode => (node.id === GROUP_ID ? container : node))
          : resized;
      });
    }
    void this.modelService.addNodes([step]);
  }

  private readonly handleModelChange = (): void => {
    this.schedulePersist();
  };

  private loadDiagram(): void {
    const stored = readStoredDiagram(this.data()?.['diagram']);
    const { nodes, edges } = stored ?? seedProcessDiagram();
    this.model.updateNodes(prepareDiagram(nodes));
    this.model.updateEdges(edges.filter(isConnectedEdge));
  }

  private schedulePersist(): void {
    if (this.readOnly()) return;
    this.clearPersistTimer();
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const serialized = this.serialize();
      if (serialized === this.lastSerialized) return;
      const data = this.data();
      if (!data) return;
      this.lastSerialized = serialized;
      data['diagram'] = JSON.parse(serialized);
      this.onDataMutated()();
    }, PERSIST_DEBOUNCE_MS);
  }

  /** Serializes nodes and edges only; viewport metadata and drag-hover state are not persisted. */
  private serialize(): string {
    const payload = JSON.parse(this.model.toJSON()) as {
      nodes: Record<string, unknown>[];
      edges: unknown[];
    };
    return JSON.stringify({
      nodes: payload.nodes.map((node) => {
        const { highlighted: _highlighted, ...rest } = node;
        return rest;
      }),
      edges: payload.edges.filter((edge) => isConnectedEdge(edge as { source?: string; target?: string })),
    });
  }

  private clearPersistTimer(): void {
    if (this.persistTimer !== null) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
  }
}
