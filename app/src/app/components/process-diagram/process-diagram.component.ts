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

import { Component, computed, effect, ElementRef, inject, input, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { MatButtonModule } from '@angular/material/button';
import { MatDialog } from '@angular/material/dialog';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { TranslatePipe } from '@ngx-translate/core';
import type { ReferenceEditorDialogData, ReferenceEditorItem } from '../../models/reference-editor-item';
import { ApplicationsService, type ApplicationItem } from '../../services/ApplicationsService';
import { UserConfigService } from '../../services/user-config.service';
import { readRelationItems } from '../../utils/relation-data';
import { ReferenceEditorDialogComponent } from '../reference-editor-dialog/reference-editor-dialog.component';
import {
  NgDiagramBackgroundComponent,
  NgDiagramComponent,
  NgDiagramModelService,
  NgDiagramNodeTemplateMap,
  NgDiagramViewportService,
  ClipboardPastedEvent,
  initializeModel,
  NodeResizeEndedEvent,
  provideNgDiagram,
  SelectionRemovedEvent,
} from 'ng-diagram';
import { ProcessDecisionNodeComponent } from './process-decision-node.component';
import { ProcessDiagramAutoFocusDirective } from './process-diagram-auto-focus.directive';
import { ProcessDiagramStateService } from './process-diagram-state.service';
import { ProcessLaneNodeComponent } from './process-lane-node.component';
import { ProcessLanesGroupNodeComponent } from './process-lanes-group-node.component';
import { ProcessStepNodeComponent } from './process-step-node.component';
import {
  DECISION_HEIGHT,
  DECISION_TYPE,
  DECISION_WIDTH,
  DiagramNode,
  GROUP_ID,
  GROUP_TYPE,
  LANE_GAP,
  LANE_HEIGHT,
  LANE_PADDING_X,
  LANE_TYPE,
  LANE_WIDTH,
  ProcessDiagramPayload,
  ProcessLaneNode,
  STEP_GAP,
  STEP_HEIGHT,
  STEP_TYPE,
  STEP_WIDTH,
  STEP_Z_ORDER,
  buildContainer,
  isContainerNode,
  isDecisionNode,
  isConnectedEdge,
  isInsideLane,
  isLaneNode,
  isStepNode,
  prepareDiagram,
  readStoredDiagram,
  seedProcessDiagram,
} from './process-diagram.types';

const PERSIST_DEBOUNCE_MS = 600;

/** One row of the Steps table below the diagram (sort keys drive the order). */
interface ProcessStepTableRow {
  id: string;
  label: string;
  description: string;
  capabilities: ReferenceEditorItem[];
  laneIndex: number;
  y: number;
  x: number;
}

@Component({
  selector: 'app-process-diagram',
  standalone: true,
  imports: [
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatMenuModule,
    TranslatePipe,
    NgDiagramComponent,
    NgDiagramBackgroundComponent,
    ProcessDiagramAutoFocusDirective,
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
    // Only swimlanes opt into resizing (node.resizable). Deliberately no
    // content-based getMinNodeSize: the library feeds it into the lane
    // element's CSS min-height reactively, so a dragged shape kept re-growing
    // its lane (content min > current size -> observer syncs it back into the
    // model -> re-evaluate) until the lane had chased it into the next one.
    resize: { defaultResizable: false },
    linking: { portSnapDistance: 100 },
    danglingEdges: { enabled: true },
    // Selection must never hide what sits on a swimlane: the engine's default
    // +10000 elevation lifts a selected lane above its steps (opaque
    // background), so the shapes underneath disappear. Selection stays active
    // (border, resize handles, label editing) — only the z-bump is off.
    zIndex: { elevateOnSelection: false },
    zoom: { zoomToFit: { onInit: true, padding: 40 } },
    grouping: {
      canGroup: (node: DiagramNode, group: DiagramNode): boolean =>
        isLaneNode(node) && isContainerNode(group),
    },
  }));

  private readonly state = inject(ProcessDiagramStateService);
  private readonly viewportService = inject(NgDiagramViewportService);
  private readonly modelService = inject(NgDiagramModelService);
  private readonly dialog = inject(MatDialog);
  private readonly applicationsService = inject(ApplicationsService);
  private readonly userConfig = inject(UserConfigService);
  private readonly diagramEl = viewChild('diagram', { read: ElementRef });

  private persistTimer: ReturnType<typeof setTimeout> | null = null;
  private fitTimers: ReturnType<typeof setTimeout>[] = [];
  private lastSerialized = '';
  private destroyed = false;

  /** Bumped on every model change so the Steps table re-reads node data even
   *  when the library's nodes() read is not tracked as a signal. */
  private readonly modelVersion = signal(0);

  /** App lookup results memoized by the step's capability-id set (cleared whenever the applications list reloads). */
  private readonly appsByCapSet = new Map<string, ApplicationItem[]>();

  private readonly clearAppsCache = effect(() => {
    this.applicationsService.applications();
    this.appsByCapSet.clear();
  });

  /** Focuses the diagram host before the engine's pointerdown handler, without scrolling. */
  private readonly grabHostFocus = (event: Event): void => {
    const host = this.diagramEl()?.nativeElement as HTMLElement | undefined;
    if (!host) return;
    const target = event.target;
    if (target instanceof Node && !host.contains(target)) return;
    if (!host.contains(document.activeElement)) {
      host.focus({ preventScroll: true });
    }
  };

  /**
   * Inline editor state for an edge label: opened by double-clicking an edge,
   * positioned over the edge's label (or midpoint) inside the canvas wrapper.
   */
  readonly edgeLabelEditor = signal<{ id: string; label: string; x: number; y: number } | null>(
    null,
  );

  /** Double-click on an edge opens the label editor. Runs in the capture phase
   *  on the diagram host so the engine's own handlers cannot swallow it. */
  private readonly handleEdgeDoubleClick = (event: Event): void => {
    if (this.readOnly()) return;
    const target = event.target;
    if (!(target instanceof Element) || target.closest('ng-diagram-node')) return;
    const edgeEl = target.closest('[data-edge-id]');
    const edgeId = edgeEl?.getAttribute('data-edge-id');
    if (!edgeEl || !edgeId) return;
    const edge = this.modelService.getEdgeById(edgeId);
    if (!edge) return;

    const host = this.diagramEl()?.nativeElement as HTMLElement | undefined;
    const canvas = host?.closest('.diagram-canvas');
    if (!canvas) return;

    // Anchor on the rendered label when it exists, otherwise on the path midpoint.
    const canvasRect = canvas.getBoundingClientRect();
    const labelEl = edgeEl.querySelector('.ng-diagram-default-edge-label');
    let x: number;
    let y: number;
    if (labelEl) {
      const rect = labelEl.getBoundingClientRect();
      x = rect.left - canvasRect.left;
      y = rect.top - canvasRect.top;
    } else {
      const path = edgeEl.querySelector('path');
      const rect = (path ?? edgeEl).getBoundingClientRect();
      x = rect.left + rect.width / 2 - canvasRect.left - 70;
      y = rect.top + rect.height / 2 - canvasRect.top - 14;
    }

    const rawLabel = edge.data as { label?: unknown } | undefined;
    event.preventDefault();
    this.edgeLabelEditor.set({
      id: edgeId,
      label: typeof rawLabel?.['label'] === 'string' ? (rawLabel['label'] as string) : '',
      x: Math.max(0, x),
      y: Math.max(0, y),
    });
  };

  commitEdgeLabel(raw: string): void {
    const editor = this.edgeLabelEditor();
    if (!editor) return;
    this.edgeLabelEditor.set(null);
    const label = raw.trim();
    const edge = this.modelService.getEdgeById(editor.id);
    if (!edge) return;
    const data = { ...(edge.data ?? {}) } as { label?: string };
    if (label) {
      data.label = label;
    } else {
      delete data.label;
    }
    void this.modelService.updateEdges([{ id: editor.id, data }]);
  }

  cancelEdgeLabel(): void {
    this.edgeLabelEditor.set(null);
  }

  /** One line of the Steps table below the diagram (sort keys included). */
  readonly stepsTable = computed<ProcessStepTableRow[]>(() => {
    this.modelVersion();
    const nodes = this.modelService.nodes();
    const lanes = nodes.filter(isLaneNode).sort((a, b) => a.position.y - b.position.y);
    const rows = nodes.filter(isStepNode).map((node) => ({
      id: node.id,
      label: node.data?.label ?? '',
      description: node.data?.description ?? '',
      capabilities: node.data?.capabilities ?? [],
      laneIndex: lanes.findIndex((lane) => isInsideLane(node, lane)),
      y: node.position.y,
      x: node.position.x,
    }));
    rows.sort((a, b) => a.laneIndex - b.laneIndex || a.y - b.y || a.x - b.x);
    return rows;
  });

  /** Commits a Steps-table name edit (Enter/blur); an emptied field reverts. */
  commitStepLabel(id: string, el: HTMLInputElement): void {
    const value = el.value.trim();
    const row = this.stepsTable().find((candidate) => candidate.id === id);
    if (value && value !== row?.label) {
      this.state.updateLabel(id, value);
    } else if (row) {
      el.value = row.label;
    }
  }

  /** Escape in the Steps-table name field: restore the stored label and leave the field. */
  revertStepLabel(el: HTMLInputElement, label: string): void {
    el.value = label;
    el.blur();
  }

  /** Persists a Steps-table description edit (the cell grows via cdkTextareaAutosize). */
  onStepDescriptionInput(id: string, el: HTMLTextAreaElement): void {
    this.state.updateDescription(id, el.value);
  }

  /** Opens the capability reference editor for a step (same dialog as the node's double-click). */
  editStepCapabilities(row: ProcessStepTableRow): void {
    if (this.readOnly()) return;
    const ref = this.dialog.open(ReferenceEditorDialogComponent, {
      width: '80vw',
      maxWidth: '80vw',
      height: '80vh',
      maxHeight: '80vh',
      panelClass: 'migration-target-dialog-panel',
      data: {
        targetType: 'BusinessCapability',
        currentSelection: row.capabilities.map((item) => ({ ...item })),
      } satisfies ReferenceEditorDialogData,
    });

    ref.afterClosed().subscribe((result: ReferenceEditorItem[] | undefined) => {
      if (result == null) return;
      this.state.updateCapabilities(row.id, result);
    });
  }

  /**
   * Applications linked to at least one of the step's capabilities with
   * coverage unset or > 0. Memoized per capability-id set; the cache is
   * dropped whenever the applications list itself changes.
   */
  appsFor(capabilities: ReferenceEditorItem[]): ApplicationItem[] {
    if (capabilities.length === 0) return [];
    const key = capabilities
      .map((item) => item.id)
      .sort()
      .join('|');
    const cached = this.appsByCapSet.get(key);
    if (cached) return cached;

    const capabilityIds = new Set(capabilities.map((item) => item.id));
    const apps = this.applicationsService
      .applications()
      .filter((app) =>
        readRelationItems(app.relApplicationToBusinessCapability).some(
          (item) => capabilityIds.has(item.id) && (item.coverage == null || item.coverage > 0),
        ),
      );
    this.appsByCapSet.set(key, apps);
    return apps;
  }

  /** Entity-page URL for an application (same tab base as every other entity link). */
  applicationUrl(appId: string): string {
    return this.userConfig.projectUrlString(`entity/Application/${appId}`);
  }

  /** Applications-column click: open the entity's edit page in a new window. */
  openApplication(event: MouseEvent, appId: string): void {
    event.preventDefault();
    window.open(this.applicationUrl(appId), '_blank', 'noopener');
  }

  /**
   * After a swimlane resize gesture: every lane takes the resized width, and
   * the lanes below the resized one (with the steps they hold) move up/down to
   * follow its new bottom edge. The container frame is rebuilt to fit.
   */
  onLaneResizeEnded(event: NodeResizeEndedEvent): void {
    if (this.readOnly()) return;
    const lanes = this.sortedLanes();
    const index = lanes.findIndex((lane) => lane.id === event.node.id);
    if (index === -1) return;

    const resized = lanes[index];
    const newWidth = event.node.size?.width ?? resized.size?.width ?? LANE_WIDTH;
    const newHeight = event.node.size?.height ?? resized.size?.height ?? LANE_HEIGHT;
    const items = this.model
      .getNodes()
      .filter((node) => isStepNode(node) || isDecisionNode(node));

    type NodeUpdate = Parameters<typeof this.modelService.updateNodes>[0][number];
    const updates: NodeUpdate[] = [];
    const finalLanes: ProcessLaneNode[] = lanes.map((lane, laneIndex) => ({
      ...lane,
      size: {
        width: newWidth,
        height: laneIndex === index ? newHeight : (lane.size?.height ?? LANE_HEIGHT),
      },
    }));

    // The resized lane keeps its position (right/bottom handles only) and its
    // contents stay exactly where they are — no relayouting on resize.

    // Reflow the lanes below: each sits directly under its predecessor.
    let prevBottom = resized.position.y + newHeight;
    for (let i = index + 1; i < finalLanes.length; i += 1) {
      const original = lanes[i];
      const newY = prevBottom + LANE_GAP;
      const dy = newY - original.position.y;
      if (dy !== 0) {
        finalLanes[i] = { ...finalLanes[i], position: { x: original.position.x, y: newY } };
        updates.push({ id: original.id, position: { x: original.position.x, y: newY } });
        for (const item of items.filter((candidate) => isInsideLane(candidate, original))) {
          updates.push({
            id: item.id,
            position: { x: item.position.x, y: item.position.y + dy },
          });
        }
      }
      const height = finalLanes[i].size?.height ?? LANE_HEIGHT;
      prevBottom = finalLanes[i].position.y + height;
    }

    // Width: every lane matches the resized width.
    for (let i = 0; i < finalLanes.length; i += 1) {
      const before = lanes[i].size ?? { width: LANE_WIDTH, height: LANE_HEIGHT };
      const after = finalLanes[i].size ?? before;
      if (after.width !== before.width || after.height !== before.height) {
        updates.push({ id: finalLanes[i].id, size: { width: after.width, height: after.height } });
      }
    }

    const container = buildContainer(finalLanes);
    updates.push({ id: container.id, position: container.position, size: container.size });
    void this.modelService.updateNodes(updates);
  }

  /**
   * Delete/Backspace removed a selection containing swimlanes: the steps and
   * decisions inside a deleted lane go with it, the lanes below (and everything
   * they hold) shift up to close the gap, and the container frame shrinks.
   * The library only emits this for delete-selection, so the cascade below
   * (programmatic deleteNodes) cannot re-enter this handler.
   */
  onSelectionRemoved(event: SelectionRemovedEvent): void {
    if (this.readOnly()) return;
    const deletedLanes = event.deletedNodes.filter(isLaneNode);
    if (deletedLanes.length === 0) return;

    const items = this.model
      .getNodes()
      .filter((node) => isStepNode(node) || isDecisionNode(node));
    const orphans = items.filter((item) =>
      deletedLanes.some((lane) => isInsideLane(item, lane)),
    );
    if (orphans.length > 0) {
      void this.modelService.deleteNodes(orphans.map((node) => node.id));
    }

    const lanes = this.sortedLanes();
    if (lanes.length === 0) {
      const container = this.model.getNodes().find(isContainerNode);
      if (container) void this.modelService.deleteNodes([container.id]);
      return;
    }

    // Anchor the compacted stack where the topmost lane used to start, so
    // deleting the first lane pulls every lane up to the origin.
    const anchorY = Math.min(
      ...deletedLanes.map((lane) => lane.position.y),
      ...lanes.map((lane) => lane.position.y),
    );

    type NodeUpdate = Parameters<typeof this.modelService.updateNodes>[0][number];
    const updates: NodeUpdate[] = [];
    const finalLanes: ProcessLaneNode[] = [];
    let cursor = anchorY;
    for (const lane of lanes) {
      const y = cursor;
      const height = lane.size?.height ?? LANE_HEIGHT;
      const dy = y - lane.position.y;
      if (dy !== 0) {
        updates.push({ id: lane.id, position: { x: lane.position.x, y } });
        for (const item of items.filter((candidate) => isInsideLane(candidate, lane))) {
          updates.push({
            id: item.id,
            position: { x: item.position.x, y: item.position.y + dy },
          });
        }
      }
      finalLanes.push({ ...lane, position: { x: lane.position.x, y } });
      cursor = y + height + LANE_GAP;
    }

    const container = buildContainer(finalLanes);
    updates.push({ id: container.id, position: container.position, size: container.size });
    void this.modelService.updateNodes(updates);
  }

  /** Swimlanes must not be copy/paste-able: drop pasted lanes right away
   *  (steps keep their clipboard behaviour). */
  onClipboardPasted(event: ClipboardPastedEvent): void {
    if (this.readOnly()) return;
    const laneIds = event.nodes.filter(isLaneNode).map((node) => node.id);
    if (laneIds.length > 0) {
      void this.modelService.deleteNodes(laneIds);
    }
  }

  constructor() {
    this.nodeTemplateMap.set(LANE_TYPE, ProcessLaneNodeComponent);
    this.nodeTemplateMap.set(STEP_TYPE, ProcessStepNodeComponent);
    this.nodeTemplateMap.set(DECISION_TYPE, ProcessDecisionNodeComponent);
    this.nodeTemplateMap.set(GROUP_TYPE, ProcessLanesGroupNodeComponent);
  }

  ngOnInit(): void {
    this.state.isReadOnly = () => this.readOnly();
    this.applicationsService.ensureLoaded();
    // The engine grabs focus on pointerdown with a plain .focus(), which makes
    // the browser scroll the focused host into view and shifts the diagram
    // under the cursor between the two clicks of a double-click. Pre-focusing
    // the host (without scrolling) from the document capture phase runs before
    // the engine's handler, which then skips its own focus() call.
    document.addEventListener('pointerdown', this.grabHostFocus, true);
    // Capture-phase so the label editor opens even while the engine handles the
    // double-click (edge selection, focus grabbing) on the same event.
    this.diagramEl()?.nativeElement?.addEventListener('dblclick', this.handleEdgeDoubleClick, true);
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
    document.removeEventListener('pointerdown', this.grabHostFocus, true);
    this.diagramEl()?.nativeElement?.removeEventListener('dblclick', this.handleEdgeDoubleClick, true);
    this.fitTimers.forEach((timer) => clearTimeout(timer));
    this.model.unregisterOnChange(this.handleModelChange);
    this.clearPersistTimer();
  }

  addStep(): void {
    if (this.readOnly()) return;
    const placement = this.placement(STEP_WIDTH, STEP_HEIGHT);
    if (!placement) return;

    const { lane, lanes, laneWidth, x, y } = placement;
    let number = this.model.getNodes().filter(isStepNode).length + 1;
    let id = `step-${number}`;
    while (this.model.getNodes().some((node) => node.id === id)) {
      number += 1;
      id = `step-${number}`;
    }

    const step: DiagramNode = {
      id,
      type: STEP_TYPE,
      autoSize: false,
      zOrder: STEP_Z_ORDER,
      size: { width: STEP_WIDTH, height: STEP_HEIGHT },
      position: { x, y },
      data: { label: `Step ${number}` },
    };

    this.widenLane(lane, lanes, laneWidth, x + STEP_WIDTH + LANE_PADDING_X);
    void this.modelService.addNodes([step]);
  }

  addDecision(): void {
    if (this.readOnly()) return;
    const placement = this.placement(DECISION_WIDTH, DECISION_HEIGHT);
    if (!placement) return;

    const { lane, lanes, laneWidth, x, y } = placement;
    let number = this.model.getNodes().filter(isDecisionNode).length + 1;
    let id = `decision-${number}`;
    while (this.model.getNodes().some((node) => node.id === id)) {
      number += 1;
      id = `decision-${number}`;
    }

    const decision: DiagramNode = {
      id,
      type: DECISION_TYPE,
      autoSize: false,
      zOrder: STEP_Z_ORDER,
      size: { width: DECISION_WIDTH, height: DECISION_HEIGHT },
      position: { x, y },
      data: { label: `Decision ${number}` },
    };

    this.widenLane(lane, lanes, laneWidth, x + DECISION_WIDTH + LANE_PADDING_X);
    void this.modelService.addNodes([decision]);
  }

  addLane(): void {
    if (this.readOnly()) return;
    const nodes = this.model.getNodes();
    const lanes = nodes.filter(isLaneNode).sort((a, b) => a.position.y - b.position.y);

    const width = lanes.reduce((max, lane) => Math.max(max, lane.size?.width ?? LANE_WIDTH), LANE_WIDTH);
    const bottom = lanes.reduce(
      (max, lane) => Math.max(max, lane.position.y + (lane.size?.height ?? LANE_HEIGHT)),
      0,
    );
    let number = lanes.length + 1;
    let id = `lane-${number}`;
    while (nodes.some((node) => node.id === id)) {
      number += 1;
      id = `lane-${number}`;
    }

    const lane: ProcessLaneNode = {
      id,
      type: LANE_TYPE,
      isGroup: true,
      highlighted: false,
      autoSize: false,
      groupId: GROUP_ID,
      draggable: false,
      resizable: true,
      size: { width, height: LANE_HEIGHT },
      position: { x: lanes[0]?.position.x ?? 0, y: lanes.length > 0 ? bottom + LANE_GAP : 0 },
      data: { label: `Role ${number}` },
    };

    // The new lane belongs to the lanes container: grow the frame with it, then
    // register the lane through the flow-core command so it is rendered and measured.
    const container = buildContainer([...lanes, lane]);
    if (lanes.length > 0) {
      void this.modelService.updateNodes([
        { id: container.id, position: container.position, size: container.size },
      ]);
    } else {
      void this.modelService.addNodes([container]);
    }
    void this.modelService.addNodes([lane]);
  }

  /**
   * Picks the lane with the fewest occupants and a free slot for a node of the
   * given size (after the rightmost step/decision in that lane, vertically centred).
   */
  private placement(
    width: number,
    height: number,
  ): { lane: ProcessLaneNode; lanes: ProcessLaneNode[]; laneWidth: number; x: number; y: number } | null {
    const lanes = this.sortedLanes();
    if (lanes.length === 0) return null;

    const items = this.model.getNodes().filter((node) => isStepNode(node) || isDecisionNode(node));

    let target = lanes[0];
    let fewest = Infinity;
    for (const lane of lanes) {
      const count = items.filter((item) => isInsideLane(item, lane)).length;
      if (count < fewest) {
        fewest = count;
        target = lane;
      }
    }

    const laneWidth = target.size?.width ?? LANE_WIDTH;
    const laneHeight = target.size?.height ?? LANE_HEIGHT;
    const siblings = items.filter((item) => isInsideLane(item, target));
    const rightEdge = siblings.reduce(
      (max, item) => Math.max(max, item.position.x + (item.size?.width ?? STEP_WIDTH)),
      target.position.x + LANE_PADDING_X,
    );

    return {
      lane: target,
      lanes,
      laneWidth,
      x: rightEdge + STEP_GAP,
      y: target.position.y + (laneHeight - height) / 2,
    };
  }

  private sortedLanes(): ProcessLaneNode[] {
    return this.model
      .getNodes()
      .filter(isLaneNode)
      .sort((a, b) => a.position.y - b.position.y);
  }

  /**
   * Widen the lane (and its container frame) when the new node needs more room.
   * Changes go through the flow-core command so the render pipeline sees them
   * (adapter-only writes are never drawn).
   */
  private widenLane(
    lane: ProcessLaneNode,
    lanes: ProcessLaneNode[],
    laneWidth: number,
    requiredRight: number,
  ): void {
    const laneHeight = lane.size?.height ?? LANE_HEIGHT;
    const requiredWidth = requiredRight - lane.position.x;
    const newWidth = Math.max(laneWidth, requiredWidth);
    if (newWidth === laneWidth) return;
    const widened = lanes.map((candidate) =>
      candidate.id === lane.id
        ? { ...candidate, size: { width: newWidth, height: laneHeight } }
        : candidate,
    );
    const container = buildContainer(widened);
    void this.modelService.updateNodes([
      { id: lane.id, size: { width: newWidth, height: laneHeight } },
      { id: container.id, position: container.position, size: container.size },
    ]);
  }

  private readonly handleModelChange = (): void => {
    this.modelVersion.update((version) => version + 1);
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
