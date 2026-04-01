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

import {
  Component,
  ViewChild,
  ElementRef,
  AfterViewInit,
  OnInit,
  OnDestroy,
  inject,
  signal,
  computed,
} from '@angular/core';
import { Router, ActivatedRoute, Params } from '@angular/router';
import { CommonModule } from '@angular/common';
import { take } from 'rxjs';
import { EntityApiService } from '../../services/entity-api.service';
import { FacetsService, FacetRelationItem } from '../../services/FacetsService';
import { JaccardService } from '../../services/jaccard.service';
import { ListEntities200ResponseInner } from '../../services/api/model/listEntities200ResponseInner';
import { EntityListFilters } from '../../models/entity-list-filters';
import { ListFiltersComponent, SUITABILITY_FILTER_EMPTY } from '../../components/list-filters/list-filters.component';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { TranslateModule } from '@ngx-translate/core';
import { PageTitleService } from '../../services/page-title.service';
import { SUITABILITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import {Material, MeshBasicMaterial} from 'three';
import {ForceGraph3DInstance, LinkObject} from '3d-force-graph';

/** Min similarity (Jaccard) to draw a link between applications */
const THRESHOLD = 0.45;

const LINK_RELATED='rgba(100,100,255,0.3)';
const LINK_RELATED_DIMMED='rgba(21,21,55,0.4)';
const LINK_MIGRATION='rgba(255, 0, 0, 1)';
const LINK_MIGRATION_DIMMED='rgba(120, 30, 30, 0.3)';
const LINK_ALTERNATIVES='rgba(255,255,0,0.7)';
const LINK_ALTERNATIVES_DIMMED='rgba(255,255,0,0.3)';
const LINK_RELATED_HIGHLIGHTED='rgba(0,255,0,1)';
const LINK_ALTERNATIVES_HIGHLIGHTED='rgba(255,255,0,1)';

/** Application nodes that will get similarApplications filled from Jaccard */
interface AppNode {
  displayName: string;
  id:string;
  description: string;
  regions: Set<string>;
  /** Capability displayNames (for Jaccard; same key as facets/clusters). */
  capabilityNames: Set<string>;
  similarApplications: Record<string, number>;
  clusters: Record<string, number>;
  revenue?: number;
  type?: string;
  relApplicationToBusinessCapability?: { id?: string; displayName?: string }[];
  earmarkingsTEMP?: string;
}

/** Graph node for 3d-force-graph */
export interface GraphNode {
  searchText: string;
  id: string;
  guid?:string;
  label?: string;
  regions?: Set<string>;
  revenue?: number;
  cluster?: string;
  /** All business capability displayNames grouped under this cluster (only set for cluster nodes). */
  businessCapabilities?: string[];
  material?: Material;
}

/** Graph link for 3d-force-graph */
export interface GraphLink {
  source: string;
  target: string;
  value: number;
  linkType: 'similarity' | 'migrationPaths' | 'alternatives';
}

export interface GraphData {
  nodes: GraphNode[];
  links: GraphLink[];
}

/** Root region names used for node coloring */
const ALLOWED_ROOTS = new Set([
  'Europe',
  'Asia Pacific',
  'Middle East and Africa',
  'Latin America',
  'Group',
]);

@Component({
  selector: 'app-universe',
  standalone: true,
  imports: [CommonModule, ListFiltersComponent, MatProgressSpinnerModule, MatCheckboxModule, TranslateModule],
  templateUrl: './universe.component.html',
  styleUrl: './universe.component.scss',
})
export class UniverseComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('graphContainer', { static: false }) graphContainer!: ElementRef<HTMLDivElement>;

  private entityService = inject(EntityApiService);
  private facetsService = inject(FacetsService);
  private jaccardService = inject(JaccardService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);

  initialFilters = signal<Partial<EntityListFilters>>({});
  entities = signal<ListEntities200ResponseInner[]>([]);
  /** Current name filter (client-side only). */
  private nameFilter = signal('');
  /** Display names of entities with TIME classification "invest" (North Star highlight). */
  private northStarDisplayNames = new Set<string>();
  /** Last filters sent to API (excluding name) to avoid refetch when only name changes. */
  private lastServerFilters = signal<string>('');
  loading = signal(false);
  error = signal<string | null>(null);
  graphData = signal<GraphData | null>(null);

  /** Which link types are displayed in the graph. */
  linkTypeVisibility = signal<{ similarity: boolean; migrationPaths: boolean; alternatives: boolean }>({
    similarity: true,
    migrationPaths: false,
    alternatives: false,
  });

  /** Currently focused node id (set by click handler). */
  private focusedNodeId: string | null = null;
  /** Focused node's computed link-set (only includes enabled link types). */
  private currentFocusedLinkSet?: Set<string>;

  /** True when load completed with zero nodes to display (e.g. filters matched nothing). */
  noResultsToDisplay = computed(() => {
    const g = this.graphData();
    return g !== null && (g.nodes?.length ?? 0) === 0;
  });

  private graphInstance?: ForceGraph3DInstance;

  readonly QP = {
    name: 'name',
    techSuit: 'techSuit',
    bizSuit: 'bizSuit',
    bizCap: 'bizCap',
    userGroup: 'userGroup',
    project: 'project',
  } as const;

  ngOnInit(): void {
    this.pageTitleService.setTitle('Universe');
    this.route.queryParams.pipe(take(1)).subscribe((qp: Params) => {
      const partial: Partial<EntityListFilters> = {};
      //const name = String(qp[this.QP.name] ?? '').trim();
      //if (name) partial.name = name;
      const tech = String(qp[this.QP.techSuit] ?? '').trim();
      if (tech && (SUITABILITY_VALUES.includes(tech as (typeof SUITABILITY_VALUES)[number]) || tech === SUITABILITY_FILTER_EMPTY)) {
        partial.technicalSuitability = tech;
      }
      const biz = String(qp[this.QP.bizSuit] ?? '').trim();
      if (biz && (SUITABILITY_VALUES.includes(biz as (typeof SUITABILITY_VALUES)[number]) || biz === SUITABILITY_FILTER_EMPTY)) {
        partial.functionalSuitability = biz;
      }
      const bizCap = String(qp[this.QP.bizCap] ?? '').trim();
      if (bizCap) partial.relApplicationToBusinessCapability = bizCap;
      const userGroup = String(qp[this.QP.userGroup] ?? '').trim();
      if (userGroup) partial.relApplicationToUserGroup = userGroup;
      const project = String(qp[this.QP.project] ?? '').trim();
      if (project) partial.relApplicationToProject = project;
      this.initialFilters.set(partial);
    });
  }

  ngAfterViewInit(): void {
    this.initGraph();
  }

  ngOnDestroy(): void {
    this.pageTitleService.clearTitle();
    this.graphInstance = undefined;
  }

  onFiltersChange(filters: EntityListFilters): void {
    const params: Record<string, string> = {};
    // No server side filtering: if (filters.name?.trim()) params[this.QP.name] = filters.name.trim();
    if (filters.technicalSuitability) params[this.QP.techSuit] = filters.technicalSuitability;
    if (filters.functionalSuitability) params[this.QP.bizSuit] = filters.functionalSuitability;
    if (filters.relApplicationToBusinessCapability)
      params[this.QP.bizCap] = filters.relApplicationToBusinessCapability;
    if (filters.relApplicationToUserGroup)
      params[this.QP.userGroup] = filters.relApplicationToUserGroup;
    if (filters.relApplicationToProject)
      params[this.QP.project] = filters.relApplicationToProject;
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: '',
      replaceUrl: true,
    });
    this.nameFilter.set(filters.name?.trim() ?? '');
    const serverKey = `${filters.technicalSuitability}|${filters.functionalSuitability}|${filters.relApplicationToBusinessCapability}|${filters.relApplicationToUserGroup}|${filters.relApplicationToProject}`;
    if (this.lastServerFilters() !== serverKey) {
      this.lastServerFilters.set(serverKey);
      this.loadEntities(filters);
    } else {
      this.applyNameFilterToGraph();
    }
  }

  private isLinkTypeVisible(type: GraphLink['linkType']): boolean {
    const vis = this.linkTypeVisibility();
    return !!vis[type];
  }

  private computeFocusedLinkSet(nodeId: string): Set<string> {
    const g = this.graphInstance;
    const graph = g?.graphData();
    if (!g || !graph) return new Set([nodeId]);

    const set = new Set<string>();
    (graph.links ?? []).forEach((l) => {
      const link = l as GraphLink;
      if (!this.isLinkTypeVisible(link.linkType)) return;

      const src =
        typeof link.source === 'object' && link.source != null && 'id' in link.source
          ? String((link.source as GraphNode).id)
          : String(link.source ?? '');
      const tgt =
        typeof link.target === 'object' && link.target != null && 'id' in link.target
          ? String((link.target as GraphNode).id)
          : String(link.target ?? '');

      if (src === nodeId || tgt === nodeId) {
        set.add(src);
        set.add(tgt);
      }
    });
    set.add(nodeId);
    return set;
  }

  onLinkTypeVisibilityChange(type: GraphLink['linkType'], checked: boolean): void {
    const next = { ...this.linkTypeVisibility() };
    next[type] = checked;
    this.linkTypeVisibility.set(next);

    // Only update link visibility/highlights; do not touch graph data.
    if (this.focusedNodeId) {
      this.currentFocusedLinkSet = this.computeFocusedLinkSet(this.focusedNodeId);
    } else {
      this.currentFocusedLinkSet = undefined;
    }
    this.applyHighlights(this.currentFocusedLinkSet);
  }

  /** Match entity by displayName, earmarkingsTEMP, business capabilities' displayName, or userGroup displayName containing the text (case-insensitive). */
  private filterEntitiesByName(
    list: ListEntities200ResponseInner[],
    nameText: string
  ): ListEntities200ResponseInner[] {
    const q = (nameText ?? '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((entity) => {
      const displayName = (entity.displayName ?? '').toLowerCase();
      if (displayName.includes(q)) return true;
      const earmarkings = (entity.earmarkingsTEMP ?? '').toLowerCase();
      if (earmarkings.includes(q)) return true;
      const caps = entity.relApplicationToBusinessCapability ?? [];
      if (caps.some((c) => (c.displayName ?? '').toLowerCase().includes(q))) return true;
      const groups = entity.relApplicationToUserGroup ?? [];
      if (groups.some((g) => (g.displayName ?? g.fullName ?? '').toLowerCase().includes(q))) return true;
      return false;
    });
  }

  private isNameFilterNotMatched(entity:GraphNode) {
    const q = (this.nameFilter() ?? '').trim().toLowerCase();
    if (!q) return false;

    const t = (entity.searchText ?? '').toLowerCase();
    if (t.includes(q)) return false;
    return true;
  }

  private applyNameFilterToGraph(): void {
    /*const filtered = this.filterEntitiesByName(this.entities(), this.nameFilter());
    const data = this.buildGraphFromEntities(filtered);
    this.graphData.set(data);
    if (this.graphInstance && typeof (this.graphInstance as { graphData: (d: GraphData) => void }).graphData === 'function') {
      (this.graphInstance as { graphData: (d: GraphData) => void }).graphData(data);
    }*/
    this.applyHighlights(this.currentFocusedLinkSet);
  }

  private loadEntities(filters: EntityListFilters): void {
    this.loading.set(true);
    this.error.set(null);
    this.entityService
      .listEntities(
        undefined,
        filters.technicalSuitability || undefined,
        filters.functionalSuitability || undefined,
        filters.relApplicationToBusinessCapability || undefined,
        filters.relApplicationToUserGroup || undefined,
        filters.relApplicationToProject || undefined
      )
      .subscribe({
        next: (list) => {
          this.entities.set(list ?? []);
          const filtered = this.filterEntitiesByName(list ?? [], this.nameFilter());
          const data = this.buildGraphFromEntities(filtered);
          // When the graph content changes, reset click focus because the focused node might disappear.
          this.focusedNodeId = null;
          this.currentFocusedLinkSet = undefined;
          this.graphData.set(data);
          if (this.graphInstance && typeof (this.graphInstance as { graphData: (d: GraphData) => void }).graphData === 'function') {
            (this.graphInstance as { graphData: (d: GraphData) => void }).graphData(data);
          }
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message ?? 'Failed to load entities.');
          this.entities.set([]);
          this.graphData.set(null);
          this.loading.set(false);
        },
      });
  }

  /** Build transient app nodes with capability sets, then compute Jaccard and build graph */
  private buildGraphFromEntities(entities: ListEntities200ResponseInner[]): GraphData {
    this.northStarDisplayNames = new Set(
      entities
        .filter((e) => (e.lxTimeClassification ?? '').toString().toLowerCase() === 'invest')
        .map((e) => e.displayName ?? e.id ?? '')
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );
    const apps: AppNode[] = entities.map((e) => {
      const caps = e.relApplicationToBusinessCapability ?? [];
      const capabilityNames = new Set(
        caps.map((c) => (c.displayName ?? c.fullName ?? c.id ?? '').trim()).filter((s) => s.length > 0)
      );
      const regions = new Set(
        (e.relApplicationToUserGroup??[]).map((c) => c.displayName).filter((id): id is string => typeof id === 'string' && id.length > 0)
      );

      return {
        displayName: e.displayName ?? e.id ?? '—',
        id:e.id ?? "",
        description: '',
        regions,
        capabilityNames,
        similarApplications: {},
        clusters: {},
        type: e.type,
        relApplicationToBusinessCapability: caps,
        earmarkingsTEMP: e.earmarkingsTEMP ?? '',
      };
    });

    // Jaccard: similarity(A,B) = |A ∩ B| / |A ∪ B| (using capability displayNames)
    for (let i = 0; i < apps.length; i++) {
      for (let j = i + 1; j < apps.length; j++) {
        const sim = this.jaccardService.similarity(apps[i].capabilityNames, apps[j].capabilityNames);
        if (sim >= THRESHOLD) {
          apps[i].similarApplications[apps[j].displayName] = sim;
          apps[j].similarApplications[apps[i].displayName] = sim;
        }
      }
    }

    // First-level business capability clusters from /facets (displayName before first "/")
    const facetCaps = (this.facetsService.getFacet('relApplicationToBusinessCapability') ?? []) as FacetRelationItem[];
    const clusterMap = new Map<string, { capabilityNames: Set<string>; businessCapabilities: string[] }>();
    for (const cap of facetCaps) {
      const displayName = (cap.displayName ?? cap.fullName ?? '').trim();
      if (!displayName) continue;
      const firstLevel = displayName.includes('/') ? displayName.split('/')[0].trim() : displayName;
      if (!firstLevel) continue;
      let entry = clusterMap.get(firstLevel);
      if (!entry) {
        entry = { capabilityNames: new Set(), businessCapabilities: [] };
        clusterMap.set(firstLevel, entry);
      }
      entry.capabilityNames.add(displayName);
      entry.businessCapabilities.push(displayName);
    }
    const simDataClusters = [...clusterMap.entries()].map(([displayName, entry]) => ({
      displayName,
      capabilityNames: entry.capabilityNames,
      businessCapabilities: [...entry.businessCapabilities],
    }));

    const nodes: GraphNode[] = apps.map((a) => ({
      id: a.displayName,
      guid: a.id,
      regions: a.regions,
      searchText: [a.displayName, [...a.capabilityNames].join(' '), a.earmarkingsTEMP ?? ''].filter(Boolean).join(' '),
      label: [
        `<b>${a.displayName}</b>`,
        `<br/><hr/>${a.description || a.type || ''}`,
        `<br/><hr/>${[...a.regions].join(', ') || '—'}`,
        `<br/><hr/>${[...a.capabilityNames].join(', ') || '-'}`,
        `<br/><hr/>${this.revenueForApp(a)}`,
      ].join(''),
      revenue: this.revenueForApp(a),
    }));

    nodes.push(...simDataClusters.map((o) => ({
      id: o.displayName,
      label: `<b>${o.displayName}</b><br/><hr/>${(o.businessCapabilities ?? []).join('<br/>') || '—'}`,
      cluster: o.displayName,
      searchText: o.displayName + ' ' + (o.businessCapabilities ?? []).join(' '),
      businessCapabilities: o.businessCapabilities ?? [],
    })));

    // Jaccard app–cluster: link app to cluster when similarity >= THRESHOLD (displayName vs displayName)
    for (const app of apps) {
      for (const cl of simDataClusters) {
        const sim = this.jaccardService.similarity(app.capabilityNames, cl.capabilityNames);
        if (sim >= THRESHOLD) {
          app.clusters[cl.displayName] = sim;
        }
      }
    }

    const existingIds = new Set(nodes.map((n) => n.id));
    const appIds = new Set(apps.map((a) => a.displayName));
    const links: GraphLink[] = [];
    for (const app of apps) {
      for (const [target, value] of Object.entries(app.similarApplications)) {
        if (app.displayName < target && existingIds.has(target)) {
          links.push({ source: app.displayName, target, value, linkType: 'similarity' });
        }
      }
      for (const [clusterName, value] of Object.entries(app.clusters)) {
        if (existingIds.has(clusterName)) {
          links.push({ source: app.displayName, target: clusterName, value, linkType: 'similarity' });
        }
      }
    }

    // Migration Target arrows: from app to each migration target (by displayName)
    for (const e of entities) {
      const targets = e.migrationTarget;
      const sourceName = e.displayName ?? e.id ?? '';
      if (!sourceName) continue;
      const arr = Array.isArray(targets) ? targets : [];
      for (const mt of arr) {
        const targetName = mt?.displayName;
        if (targetName && appIds.has(targetName) && sourceName !== targetName) {
          links.push({
            source: sourceName,
            target: targetName,
            value: 0,
            linkType: 'migrationPaths',
          });
        }
      }
    }

    // Alternative links: from app to each alternative target (by displayName).
    // Functional overlap is normalized to [0..1] so it works with the distance function.
    for (const e of entities) {
      const sourceName = e.displayName ?? e.id ?? '';
      if (!sourceName || !appIds.has(sourceName)) continue;
      const arr = e.alternatives;
      const altArr = Array.isArray(arr) ? arr : [];
      for (const alt of altArr) {
        const targetName = alt?.displayName;
        if (!targetName || !appIds.has(targetName) || sourceName === targetName) continue;

        const overlapRaw = alt?.functionalOverlap;
        const overlap = typeof overlapRaw === 'number' && !Number.isNaN(overlapRaw) ? overlapRaw : 100;
        const normalized = Math.min(1, Math.max(0, overlap / 100));

        links.push({
          source: sourceName,
          target: targetName,
          value: normalized,
          linkType: 'alternatives',
        });
      }
    }

    return { nodes, links };
  }

  private revenueForApp(app: AppNode): number {
    return 1 + (app.capabilityNames.size || 0);
  }

  private initGraph(): void {
    const el = this.graphContainer?.nativeElement;
    if (!el || typeof window === 'undefined') return;

    import('3d-force-graph').then((module) => {
      const ForceGraph3D = module.default;
      import('three').then((THREEMod) => {
        const THREE = THREEMod;
        const g = new ForceGraph3D(el);
        this.graphInstance = g;

        g.nodeLabel((node) => {
          const n = node as GraphNode;
          return String(n.label ?? n.id ?? '');
        })
          .linkOpacity(1)
          .linkColor((link: LinkObject) => {
            const l = link as GraphLink;
            if (!this.isLinkTypeVisible(l.linkType)) return 'transparent';
            switch (l.linkType) {
              case 'migrationPaths':
                return LINK_MIGRATION;
              case 'alternatives':
                return LINK_ALTERNATIVES;
              case 'similarity':
              default:
                return LINK_RELATED;
            }
          })
          .linkWidth((link: LinkObject) => {
            const l = link as GraphLink;
            if (l.linkType === 'migrationPaths') return 4;
            if (l.linkType === 'alternatives') return 2;
            return 1;
          })
          .linkDirectionalArrowLength((link: LinkObject) => {
            const l = link as GraphLink;
            return l.linkType === 'migrationPaths' && this.isLinkTypeVisible(l.linkType) ? 28 : 0;
          })
          .linkDirectionalArrowRelPos((link: LinkObject) => {
            const l = link as GraphLink;
            return l.linkType === 'migrationPaths' ? 1 : 0.5;
          })
          .linkDirectionalArrowColor((link: LinkObject) => {
            const l = link as GraphLink;
            return l.linkType === 'migrationPaths' && this.isLinkTypeVisible(l.linkType) ? LINK_MIGRATION : 'transparent';
          })
        //  .cooldownTicks(600)
          .cooldownTime(30000)
        ;

        const linkForce = g.d3Force('link');
        const linkForceWithDistance = linkForce as unknown as { distance: (fn: (l: GraphLink) => number) => void };
        if (linkForceWithDistance && typeof linkForceWithDistance.distance === 'function') {
          linkForceWithDistance.distance((link: GraphLink) => 200 * (1 - link.value));
        }

        g.nodeThreeObject((node) => {
          const n = node as unknown as GraphNode & { cluster?: string };
          const isClusterNode = !!(n.cluster && n.id === n.cluster);
          if (isClusterNode) {
            const geometry = new THREE.OctahedronGeometry(8, 0).toNonIndexed();
            // Slightly different yellows per face for a 3D look (warm, saturated)
            const yellowShades = [
              0xffd54f, 0xffca28, 0xffc107, 0xffb300,
              0xf9a825, 0xedb900, 0xe6af00, 0xd4a810,
            ].map((hex) => {
              const r = ((hex >> 16) & 255) / 255;
              const g = ((hex >> 8) & 255) / 255;
              const b = (hex & 255) / 255;
              return [r, g, b];
            });
            const colorArray = new Float32Array(geometry.attributes['position'].count * 3);
            for (let f = 0; f < 8; f++) {
              const [r, g, b] = yellowShades[f];
              const base = f * 9;
              for (let v = 0; v < 3; v++) {
                colorArray[base + v * 3] = r;
                colorArray[base + v * 3 + 1] = g;
                colorArray[base + v * 3 + 2] = b;
              }
            }
            geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorArray, 3));
            const material = new THREE.MeshBasicMaterial({
              vertexColors: true,
              transparent: true,
              opacity: 0.9,
            });
            n.material = material;
            const mesh = new THREE.Mesh(geometry, material);
            return mesh;
          }
          const colors = this.nodeColorsByRegions(n.regions ? [...n.regions] : []);

          const size = 256;
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = size;
          const ctx = canvas.getContext('2d');

          const cells = 8;
          const cellSize = size / cells;

          ctx!.fillStyle = 'rgba(230,230,230,0.8)';
          ctx!.fillRect(0, 0, size, size/2)

          let parts = colors.length;
          for (let i = 0; i < parts *3; i++) {
            ctx!.fillStyle = colors[(i % parts)];
            ctx!.fillRect((i) * size / parts / 3, 4 * cellSize, size / parts / 3, 7 * cellSize);
          }


          ctx!.font = "bold 18px Arial, sans-serif";  // Height ~20px, adjust family
          ctx!.fillStyle = "#000000";                 // Black text (or "#FFFFFF" for white)
          ctx!.textBaseline = "top";                  // Align Y=21 to text top
          ctx!.textAlign = "center";                    // Align X=1 to text left
          ctx!.fillText(typeof node.id === "string" ? node.id : "", size/4,90);               // Position (1,21)
          if (this.northStarDisplayNames.has(typeof node.id === "string" ? node.id : "")) {
            ctx!.fillStyle = "#0cff1f";
            ctx!.fillRect(0, size / 2 - 5, size, 10);
          }

          const texture = new THREE.CanvasTexture(canvas);
          texture.wrapS = texture.wrapT = THREE.RepeatWrapping;

          // 2) Build a sphere mesh using that texture
          const mat = new THREE.MeshLambertMaterial({map: texture, transparent: true, opacity: 1});
          n.material = mat;
          const geometry = new THREE.SphereGeometry(1,32,32);
          const mesh = new THREE.Mesh(geometry, mat);

          let s = 10;
          if (!(<AppNode>node).revenue) {
            s = ((<AppNode>node).revenue || 0) / 1000; // or any scaling you like
            if (s < 7) s = 7;
          }
          mesh.scale.set(s, s, s);


          return mesh;
        }).nodeThreeObjectExtend(false);

        g.onNodeRightClick((node)=>{
          const guid = (node as GraphNode).guid;
          if (guid) {
            window.open(`/entity/Application/${guid}`, "_blank");
          }
        })
        g.onNodeClick((node) => {
          const n = node as GraphNode;
          const id = String(n.id ?? '');
          if (this.focusedNodeId === id) {
            this.focusedNodeId = null;
            this.currentFocusedLinkSet = undefined;
            this.applyHighlights(this.currentFocusedLinkSet);
            return;
          }
          /*g.nodeColor((nodeObj) =>
            linkSet.has(String(nodeObj.id ?? '')) ? '' : 'rgba(80,80,80,0.08)'
          );*/
          this.focusedNodeId = id;
          this.currentFocusedLinkSet = this.computeFocusedLinkSet(id);
          this.applyHighlights(this.currentFocusedLinkSet);
        });

        const data = this.graphData();
        if (data) {
          g.graphData(data);
          this.applyHighlights(this.currentFocusedLinkSet);
        }
      });
    });
  }

  private applyHighlights(linkSet?:Set<string>) {
    const g=this.graphInstance;
    if (!g) return;
    const graph = g.graphData();
    graph.nodes.forEach((node) => {
      let n = node as GraphNode;

      let opacity=0.8;
      if (this.isNameFilterNotMatched(n))
        opacity=0.1;
      if (!!linkSet && !(linkSet.has("" + node.id)))
        opacity=n.cluster ? 0.01 : 0.3;

      if (n.material && n.material.opacity) {
        n.material.opacity = opacity;
        n.material.needsUpdate = true;
      }
    });
    const getLinkColor=(l:LinkObject) => {
      const link = l as GraphLink;
      if (!this.isLinkTypeVisible(link.linkType)) return 'transparent';

      if (!linkSet) {
        if (link.linkType === 'migrationPaths') {
          return (this.isNameFilterNotMatched(l.source as GraphNode) && this.isNameFilterNotMatched(l.target as GraphNode))
            ? LINK_MIGRATION_DIMMED
            : LINK_MIGRATION;
        }
        if (link.linkType === 'alternatives') {
          return (this.isNameFilterNotMatched(l.source as GraphNode) && this.isNameFilterNotMatched(l.target as GraphNode))
            ? LINK_ALTERNATIVES_DIMMED
            : LINK_ALTERNATIVES;
        }
        return (this.isNameFilterNotMatched(l.source as GraphNode) && this.isNameFilterNotMatched(l.target as GraphNode))
          ? LINK_RELATED_DIMMED
          : LINK_RELATED;
      }


      const src = typeof l.source === 'object' && l.source != null && 'id' in l.source
        ? String((l.source as GraphNode).id)
        : String(l.source ?? '');
      const tgt = typeof l.target === 'object' && l.target != null && 'id' in l.target
        ? String((l.target as GraphNode).id)
        : String(l.target ?? '');


      if (link.linkType === 'migrationPaths')
        return ((linkSet.has(src) && linkSet.has(tgt))) ? LINK_MIGRATION : LINK_MIGRATION_DIMMED;
      if (link.linkType === 'alternatives')
        return ((linkSet.has(src) && linkSet.has(tgt))) ? LINK_ALTERNATIVES_HIGHLIGHTED : LINK_ALTERNATIVES_DIMMED;
      return ((linkSet.has(src) && linkSet.has(tgt))) ? LINK_RELATED_HIGHLIGHTED : LINK_RELATED_DIMMED;
    };

    g.linkColor(getLinkColor);
    g.linkDirectionalArrowColor(getLinkColor);
  }

  private nodeColorsByRegions(regions: string[]): string[] {
    const roots = new Set(
      (regions || [])
        .map((r) => (r || '').split('/')[0].trim())
        .filter((root) => ALLOWED_ROOTS.has(root))
    );
    const colors: string[] = [];
    roots.forEach((root) => {
      if (root === 'Europe') colors.push('#1e90ffc0');
      if (root === 'Asia Pacific') colors.push('#ff8b4dc0');
      if (root === 'Middle East and Africa') colors.push('#8b4513c0');
      if (root === 'Latin America') colors.push('#5b6523c0');
      if (root === 'Group') colors.push('#00c853c0');
    });
    if (colors.length === 0) return ['#808080c0'];
    return colors;
  }
}
