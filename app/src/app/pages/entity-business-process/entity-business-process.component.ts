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

import { Component, input, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { ProcessDiagramComponent } from '../../components/process-diagram/process-diagram.component';

export interface ProcessCapabilityItem {
  stableEaId?: string;
  name?: string;
  typeName?: string;
  description?: string;
  type?: string;
  ID?: string;
  enterpriseDomainsStableId?: string;
  [key: string]: unknown;
}

export interface ProcessHierarchyNode {
  genericBPRefId?: string;
  genericBPRefName?: string;
  entityType?: string;
  type?: string;
  name?: string;
  hierarchy?: ProcessHierarchyNode[];
  businessCapabilityList?: ProcessCapabilityItem[];
  description?: string;
  rbaEntityId?: string;
  stableEaId?: string;
  id?: string;
  [key: string]: unknown;
}

export interface BusinessProcessData {
  type?: string;
  name?: string;
  genericBPRefName?: string;
  genericBPRefId?: string;
  description?: string;
  entityType?: string;
  category?: string;
  hierarchy?: ProcessHierarchyNode[];
  rbaEntityId?: string;
  stableEaId?: string;
  id?: string;
  [key: string]: unknown;
}

@Component({
  selector: 'app-entity-business-process',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule, MatTooltipModule, ProcessDiagramComponent],
  templateUrl: './entity-business-process.component.html',
  styleUrl: './entity-business-process.component.scss',
})
export class EntityBusinessProcessComponent {
  guid = input.required<string>();
  data = input.required<BusinessProcessData | null>();
  onDataMutated = input<() => void>(() => {});
  readOnly = input<boolean>(false);

  expandLevel = signal<number>(1);
  nodeOverrides = signal<Map<string, boolean>>(new Map());

  title = computed(() => {
    const d = this.data();
    return d?.name ?? '';
  });

  topHierarchy = computed(() => this.data()?.hierarchy ?? []);

  nodeKey(node: ProcessHierarchyNode): string {
    return node.rbaEntityId ?? node.stableEaId ?? node.id ?? node.name ?? '';
  }

  private nodeLevel(node: ProcessHierarchyNode): number {
    switch (node.type) {
      case 'MBP': return 1;
      case 'BPS': return 2;
      case 'BA': return 3;
      default: return 1;
    }
  }

  isExpanded(node: ProcessHierarchyNode): boolean {
    const key = this.nodeKey(node);
    const overrides = this.nodeOverrides();
    if (key && overrides.has(key)) {
      return overrides.get(key)!;
    }
    return this.nodeLevel(node) < this.expandLevel();
  }

  toggleNode(node: ProcessHierarchyNode): void {
    const key = this.nodeKey(node);
    if (!key) return;
    this.nodeOverrides.update(map => {
      const next = new Map(map);
      next.set(key, !this.isExpanded(node));
      return next;
    });
  }

  setLevel(level: number): void {
    this.nodeOverrides.set(new Map());
    this.expandLevel.set(level);
  }

  isLevelActive(level: number): boolean {
    return this.expandLevel() === level && this.nodeOverrides().size === 0;
  }

  getEntityIcon(entityType?: string): string {
    switch (entityType) {
      case 'BusinessProcess':
        return 'fast_forward';
      case 'BusinessActivity':
        return 'play_arrow';
      default:
        return 'chevron_right';
    }
  }

  getNodeLabel(node: ProcessHierarchyNode): string {
    return node.genericBPRefName ?? node.name ?? '';
  }

  hasChildren(node: ProcessHierarchyNode): boolean {
    return (node.hierarchy?.length ?? 0) > 0 || (node.businessCapabilityList?.length ?? 0) > 0;
  }

  getChildren(node: ProcessHierarchyNode): ProcessHierarchyNode[] {
    return node.hierarchy ?? [];
  }

  getCapabilities(node: ProcessHierarchyNode): ProcessCapabilityItem[] {
    return node.businessCapabilityList ?? [];
  }
}
