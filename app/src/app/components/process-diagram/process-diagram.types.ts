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

import type { Edge, GroupNode, SimpleNode, initializeModel } from 'ng-diagram';

export interface ProcessNodeData {
  label: string;
}

export type ProcessStepNode = SimpleNode<ProcessNodeData>;
export type ProcessLaneNode = GroupNode<ProcessNodeData>;
export type ProcessContainerNode = GroupNode<ProcessNodeData>;

/** Union of everything we put on the canvas (matches ng-diagram's internal node union). */
export type DiagramNode = ReturnType<ReturnType<typeof initializeModel>['getNodes']>[number];

export type DiagramAdapter = ReturnType<typeof initializeModel>;

/** Entity payload with an optional root "diagram" property. */
export interface ProcessDiagramPayload {
  [key: string]: unknown;
}

/** Shape stored in the payload's "diagram" property (output of ModelAdapter.toJSON()). */
export interface StoredProcessDiagram {
  nodes: DiagramNode[];
  edges: Edge[];
  metadata?: Record<string, unknown>;
}

/** Dangling (unfinished) edges are session-only: they neither load nor persist. */
export function isConnectedEdge(
  edge: { source?: string | null; target?: string | null } | null | undefined,
): boolean {
  return Boolean(edge?.source) && Boolean(edge?.target);
}

export const LANE_TYPE = 'process-lane';
export const STEP_TYPE = 'process-step';
export const GROUP_TYPE = 'process-group';
export const GROUP_ID = 'lanes-group';

export const LANE_WIDTH = 960;
export const LANE_HEIGHT = 140;
export const LANE_GAP = 20;
export const LANE_LABELS = ['Role 1', 'Role 2', 'Role 3'];
export const LANE_PADDING_X = 60;
export const STEP_WIDTH = 160;
export const STEP_HEIGHT = 56;
export const STEP_GAP = 40;
export const STEP_Z_ORDER = 10;
export const GROUP_PADDING = 12;

export function isGroupNode(node: DiagramNode): node is GroupNode {
  return 'isGroup' in node && node['isGroup'] === true;
}

export function isLaneNode(node: DiagramNode): node is ProcessLaneNode {
  return isGroupNode(node) && node.type === LANE_TYPE;
}

export function isContainerNode(node: DiagramNode): node is ProcessContainerNode {
  return isGroupNode(node) && node.type === GROUP_TYPE;
}

export function isStepNode(node: DiagramNode): node is ProcessStepNode {
  return !isGroupNode(node);
}

/** Whether the step's center lies inside the lane rectangle (absolute coordinates). */
export function isInsideLane(step: ProcessStepNode, lane: ProcessLaneNode): boolean {
  const centerX = step.position.x + (step.size?.width ?? STEP_WIDTH) / 2;
  const centerY = step.position.y + (step.size?.height ?? STEP_HEIGHT) / 2;
  const width = lane.size?.width ?? LANE_WIDTH;
  const height = lane.size?.height ?? LANE_HEIGHT;
  return (
    centerX >= lane.position.x &&
    centerX <= lane.position.x + width &&
    centerY >= lane.position.y &&
    centerY <= lane.position.y + height
  );
}

/**
 * Normalizes a node list into the structure the editor expects:
 * one container group holding all lanes, and free-standing steps rendered above them.
 */
export function prepareDiagram(nodes: DiagramNode[]): DiagramNode[] {
  const lanes = nodes
    .filter(isLaneNode)
    .sort((a, b) => a.position.y - b.position.y)
    .map((lane): ProcessLaneNode => ({ ...lane, groupId: GROUP_ID }));

  const steps = nodes.filter(isStepNode).map((step): ProcessStepNode => {
    const { groupId: _groupId, ...rest } = step;
    return { ...rest, zOrder: STEP_Z_ORDER };
  });

  if (lanes.length === 0) {
    return steps;
  }

  return [buildContainer(lanes), ...lanes, ...steps];
}

export function buildContainer(lanes: ProcessLaneNode[]): ProcessContainerNode {
  const minX = Math.min(...lanes.map((lane) => lane.position.x));
  const minY = Math.min(...lanes.map((lane) => lane.position.y));
  const maxX = Math.max(
    ...lanes.map((lane) => lane.position.x + (lane.size?.width ?? LANE_WIDTH)),
  );
  const maxY = Math.max(
    ...lanes.map((lane) => lane.position.y + (lane.size?.height ?? LANE_HEIGHT)),
  );

  return {
    id: GROUP_ID,
    type: GROUP_TYPE,
    isGroup: true,
    highlighted: false,
    autoSize: false,
    position: { x: minX - GROUP_PADDING, y: minY - GROUP_PADDING },
    size: {
      width: maxX - minX + GROUP_PADDING * 2,
      height: maxY - minY + GROUP_PADDING * 2,
    },
    data: { label: '' },
  };
}

/** Raw seed content: three stacked role lanes with one sample step in the first lane. */
export function seedProcessDiagram(): { nodes: DiagramNode[]; edges: Edge[] } {
  const lanes: DiagramNode[] = LANE_LABELS.map((label, index) => ({
    id: `lane-${index + 1}`,
    type: LANE_TYPE,
    isGroup: true,
    highlighted: false,
    autoSize: false,
    size: { width: LANE_WIDTH, height: LANE_HEIGHT },
    position: { x: 0, y: index * (LANE_HEIGHT + LANE_GAP) },
    data: { label },
  }));

  const step: DiagramNode = {
    id: 'step-1',
    type: STEP_TYPE,
    autoSize: false,
    zOrder: STEP_Z_ORDER,
    size: { width: STEP_WIDTH, height: STEP_HEIGHT },
    position: { x: LANE_PADDING_X, y: (LANE_HEIGHT - STEP_HEIGHT) / 2 },
    data: { label: 'Step 1' },
  };

  return { nodes: [...lanes, step], edges: [] };
}

/** Returns the stored diagram when the payload already carries a valid one, otherwise null. */
export function readStoredDiagram(value: unknown): StoredProcessDiagram | null {
  let candidate = value;
  if (typeof candidate === 'string') {
    try {
      candidate = JSON.parse(candidate);
    } catch {
      return null;
    }
  }
  if (candidate === null || typeof candidate !== 'object') {
    return null;
  }
  const diagram = candidate as { nodes?: unknown; edges?: unknown; metadata?: unknown };
  if (!Array.isArray(diagram.nodes)) {
    return null;
  }
  return {
    nodes: diagram.nodes as DiagramNode[],
    edges: Array.isArray(diagram.edges) ? (diagram.edges as Edge[]) : [],
    metadata:
      diagram.metadata !== null && typeof diagram.metadata === 'object'
        ? (diagram.metadata as Record<string, unknown>)
        : undefined,
  };
}
