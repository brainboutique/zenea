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
  OnInit,
  inject,
  ElementRef,
  signal,
  computed,
  effect,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { take } from 'rxjs';
import { MarkdownModule } from 'ngx-markdown';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatSliderModule } from '@angular/material/slider';
import { ListEntities200ResponseInner } from '../../services/api/model/listEntities200ResponseInner';
import {
  EntityListFilters,
  emptyEntityListFilters,
} from '../../models/entity-list-filters';
import {
  ListFiltersComponent,
  SUITABILITY_FILTER_EMPTY,
} from '../../components/list-filters/list-filters.component';
import { PageTitleService } from '../../services/page-title.service';
import {
  SUITABILITY_VALUES,
} from '../../components/suitability-rating/suitability-rating.component';
import { TIME_CLASSIFICATION_VALUES } from '../../components/time-classification/time-classification.component';
import { CRITICALITY_VALUES } from '../../components/suitability-rating/suitability-rating.component';
import { TranslatePipe } from '@ngx-translate/core';
import { ApplicationsService } from '../../services/ApplicationsService';

const QP = {
  name: 'name',
  techSuit: 'techSuit',
  bizSuit: 'bizSuit',
  timeClass: 'timeClass',
  bizCrit: 'bizCrit',
  bizCap: 'bizCap',
  userGroup: 'userGroup',
  project: 'project',
} as const;

@Component({
  selector: 'app-map-application-transformation',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    ListFiltersComponent,
    MarkdownModule,
    MatProgressSpinnerModule,
    MatIconModule,
    MatCheckboxModule,
    MatSliderModule,
    TranslatePipe,
  ],
  templateUrl: './map-application-transformation.component.html',
  styleUrl: './map-application-transformation.component.scss',
})
export class MapApplicationTransformationComponent implements OnInit {
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);
  private hostEl = inject(ElementRef<HTMLElement>);
  private applicationsService = inject(ApplicationsService);

  /** Initial filters from URL, passed once into list-filters. */
  initialFilters = signal<Partial<EntityListFilters>>({});

  /** Current active filters, kept in sync by onFiltersChange. */
  private currentFilters = signal<EntityListFilters>(emptyEntityListFilters());

  loading = signal(false);
  error = signal<string | null>(null);

  /** Whether the Mermaid definition editor is visible. */
  showEditor = signal(false);

  /** Whether to show application alternatives in the diagram. */
  showAlternatives = signal(true);

  /** Range slider values for migration paths depth control.
   * Left value (negative): apps migrating into current app
   * Right value (positive): apps that are migrated to
   * Range: -10 to +10, default: -1 to +1
   */
  migrationPathsLeft = signal(-1);
  migrationPathsRight = signal(1);

  /** Combined migration paths range for easy access. */
  migrationPathsRange = computed(() => ({
    left: this.migrationPathsLeft(),
    right: this.migrationPathsRight()
  }));

  /** Whether migration paths should be shown (based on slider values). */
  showMigrationPaths = computed(() => {
    const range = this.migrationPathsRange();
    return range.left !== 0 || range.right !== 0;
  });

  /** Pure Mermaid definition for the flowchart (no ``` fences). */
  diagramMarkdown = signal('');

  /** True when there are no migration relationships to display. */
  noRelationsToDisplay = computed(() => {
    return this.diagramMarkdown().trim() === '';
  });

  /** Mermaid code block for preview (with ```mermaid fences). */
  diagramMarkdownCodeBlock = computed(() => {
    const body = this.diagramMarkdown().trim();
    if (!body) return '';
    return ['```mermaid', body, '```'].join('\n');
  });

  constructor() {
    effect(() => {
      const allApps = this.applicationsService.applications();
      const filters = this.currentFilters();
      const migrationPathsRange = this.migrationPathsRange();
      const showAlternatives = this.showAlternatives();
      const filtered = this.applyClientSideFilters(
        allApps as unknown as ListEntities200ResponseInner[],
        filters,
      );
      this.diagramMarkdown.set(this.buildMermaidDiagram(filtered, allApps as unknown as ListEntities200ResponseInner[]));
    });
  }

  ngOnInit(): void {
    this.applicationsService.ensureLoaded();
    this.pageTitleService.setTitle('Application transformation map');
    this.route.queryParams.pipe(take(1)).subscribe((qp: Params) => {
      const partial: Partial<EntityListFilters> = { ...emptyEntityListFilters() };
      const name = String(qp[QP.name] ?? '').trim();
      if (name) partial.name = name;
      const tech = String(qp[QP.techSuit] ?? '').trim();
      if (
        tech &&
        (SUITABILITY_VALUES.includes(
          tech as (typeof SUITABILITY_VALUES)[number],
        ) ||
          tech === SUITABILITY_FILTER_EMPTY)
      ) {
        partial.technicalSuitability = tech;
      }
      const biz = String(qp[QP.bizSuit] ?? '').trim();
      if (
        biz &&
        (SUITABILITY_VALUES.includes(
          biz as (typeof SUITABILITY_VALUES)[number],
        ) ||
          biz === SUITABILITY_FILTER_EMPTY)
      ) {
        partial.functionalSuitability = biz;
      }
      const timeClass = String(qp[QP.timeClass] ?? '').trim();
      if (
        timeClass &&
        (TIME_CLASSIFICATION_VALUES.includes(
          timeClass as (typeof TIME_CLASSIFICATION_VALUES)[number],
        ) ||
          timeClass === SUITABILITY_FILTER_EMPTY)
      ) {
        partial.lxTimeClassification = timeClass;
      }
      const bizCrit = String(qp[QP.bizCrit] ?? '').trim();
      if (
        bizCrit &&
        (CRITICALITY_VALUES.includes(
          bizCrit as (typeof CRITICALITY_VALUES)[number],
        ) ||
          bizCrit === SUITABILITY_FILTER_EMPTY)
      ) {
        partial.businessCriticality = bizCrit;
      }
      const bizCap = String(qp[QP.bizCap] ?? '').trim();
      if (bizCap) partial.relApplicationToBusinessCapability = bizCap;
      const userGroup = String(qp[QP.userGroup] ?? '').trim();
      if (userGroup) partial.relApplicationToUserGroup = userGroup;
      const project = String(qp[QP.project] ?? '').trim();
      if (project) partial.relApplicationToProject = project;
      this.initialFilters.set(partial);
      // Trigger initial load
      this.onFiltersChange({
        ...emptyEntityListFilters(),
        ...partial,
      });
    });
  }

  /** Handler from list-filters component. */
  onFiltersChange(filters: EntityListFilters): void {
    const params: Record<string, string> = {};
    if (filters.name?.trim()) params[QP.name] = filters.name.trim();
    if (filters.technicalSuitability) params[QP.techSuit] = filters.technicalSuitability;
    if (filters.functionalSuitability) params[QP.bizSuit] = filters.functionalSuitability;
    if (filters.lxTimeClassification) params[QP.timeClass] = filters.lxTimeClassification;
    if (filters.businessCriticality) params[QP.bizCrit] = filters.businessCriticality;
    if (filters.relApplicationToBusinessCapability) params[QP.bizCap] = filters.relApplicationToBusinessCapability;
    if (filters.relApplicationToUserGroup) params[QP.userGroup] = filters.relApplicationToUserGroup;
    if (filters.relApplicationToProject) params[QP.project] = filters.relApplicationToProject;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: '',
      replaceUrl: true,
    });

    this.currentFilters.set(filters);
  }

   /** Handler for manual edits in the Mermaid textarea. */
   onDiagramInput(value: string): void {
     this.diagramMarkdown.set(value ?? '');
   }

   /** Handler for left slider change (negative depth for incoming migrations). */
   onLeftSliderChange(value: number): void {
     const constrainedValue = Math.min(value, 0);
     this.migrationPathsLeft.set(constrainedValue);
   }

   /** Handler for right slider change (positive depth for outgoing migrations). */
   onRightSliderChange(value: number): void {
     const constrainedValue = Math.max(value, 0);
     this.migrationPathsRight.set(constrainedValue);
   }

  /**
   * Workaround for Mermaid/Office escaping issues in SVG:
   * replace '&' occurrences with the requested placeholder `🙵`.
   * This targets node/block labels rendered into SVG <text>/<tspan>.
   */
  private normalizeMermaidSvgAmpToPlaceholder(svg: SVGElement): void {
    const targets = svg.querySelectorAll('text, tspan');
    targets.forEach((el) => {
      const txt = el.textContent ?? '';
      if (!txt.includes('&')) return;
      const normalized = txt.replace(/&amp;/g, '🙵').replace(/&/g, '🙵');
      if (normalized !== el.textContent) el.textContent = normalized;
    });
  }

  /**
   * Copy the currently rendered Mermaid diagram as a bitmap (PNG) to the clipboard.
   * This makes pasting behave like an image instead of textual SVG markup.
   */
  async copyMermaidSvg(): Promise<void> {
    const host = this.hostEl.nativeElement;

    // Mermaid renders an <svg> inside the `.preview-surface` container.
    const svg =
      (host.querySelector('.preview-surface svg') as SVGElement | null) ??
      (host.querySelector('svg.mermaid') as SVGElement | null) ??
      (host.querySelector('svg') as SVGElement | null);

    if (!svg) {
      // eslint-disable-next-line no-console
      console.log('[copyMermaidSvg] No svg found inside preview-surface.');
      return;
    }

    // Normalize block label ampersands before serializing/copying.
    this.normalizeMermaidSvgAmpToPlaceholder(svg);

    let svgMarkup = new XMLSerializer().serializeToString(svg);
    // Note: we copy PNG for Office compatibility, so SVG text encoding issues
    // should be handled by Mermaid config. Keep this section minimal.
    // Important: Office clipboard handling (and Chrome ClipboardItem) is picky about MIME.
    // Use the plain SVG mime without charset to avoid NotAllowedError.
    const svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml' });

    // eslint-disable-next-line no-console
    console.log('[copyMermaidSvg] SVG found:', {
      svgTag: svg.tagName,
      svgMime: svgBlob.type,
      svgMarkupLength: svgMarkup?.length ?? 0,
      viewBox: svg.getAttribute('viewBox'),
      boundingRect: svg.getBoundingClientRect().toJSON?.() ?? {
        w: svg.getBoundingClientRect().width,
        h: svg.getBoundingClientRect().height,
      },
      foreignObjectCount: svg.querySelectorAll('foreignObject').length,
      textElementCount: svg.querySelectorAll('text').length,
    });

    // eslint-disable-next-line no-console
    console.log('[copyMermaidSvg] SVG content counts:', {
      foreignObjectCount: svg.querySelectorAll('foreignObject').length,
      textElementCount: svg.querySelectorAll('text').length,
      svgTextNonEmptyCount: Array.from(svg.querySelectorAll('text'))
        .map((t) => (t.textContent ?? '').trim())
        .filter((v) => v.length > 0).length,
      hasForeignObject: svg.querySelectorAll('foreignObject').length > 0,
    });

    // Convert SVG -> PNG using a canvas so pasting yields an actual image.
    const svgUrl = URL.createObjectURL(svgBlob);
    try {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (ctx) {
        const rect = svg.getBoundingClientRect();
        // Use the rendered size (rect.width/height). Mermaid viewBox units can be huge and lead to
        // enormous canvases (Office apps then often paste as text / fail silently).
        const width = rect.width || 1200;
        const height = rect.height || 800;

        const dpr = window.devicePixelRatio || 1;
        const scale = 2; // Sharpness. Rect already accounts for layout scaling.

        // Clamp to avoid generating extremely large images.
        // Office clipboard image handling is sensitive; keep it smaller.
        const maxDim = 2000;
        let canvasW = Math.max(1, Math.round(width * scale * dpr));
        let canvasH = Math.max(1, Math.round(height * scale * dpr));
        const maxCurrent = Math.max(canvasW, canvasH);
        if (maxCurrent > maxDim) {
          const factor = maxDim / maxCurrent;
          canvasW = Math.max(1, Math.round(canvasW * factor));
          canvasH = Math.max(1, Math.round(canvasH * factor));
        }

        canvas.width = canvasW;
        canvas.height = canvasH;

        // eslint-disable-next-line no-console
        console.log('[copyMermaidSvg] Canvas size:', { width: canvas.width, height: canvas.height, dpr, rectWidth: rect.width, rectHeight: rect.height });

        // Draw a white background so the clipboard image doesn't look "transparent".
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        const img = new Image();
        img.decoding = 'async';

        const canvasToPngBlob = async (): Promise<{ pngBlob: Blob | null; pngError?: unknown }> => {
          try {
            // toBlob() is fast but can return null in some envs.
            const toBlobResult: Blob | null = await new Promise((resolve) => {
              canvas.toBlob((b) => resolve(b), 'image/png', 1);
            });
            if (toBlobResult) return { pngBlob: toBlobResult };

            // Fallback: dataURL -> Blob without fetch().
            const dataUrl = canvas.toDataURL('image/png', 1);
            const parts = dataUrl.split(',');
            if (parts.length !== 2) return { pngBlob: null };
            const mimeMatch = parts[0].match(/:(.*?);/);
            const mime = mimeMatch?.[1] ?? 'image/png';
            const b64 = parts[1];
            const byteChars = atob(b64);
            const byteNumbers = new Array(byteChars.length);
            for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
            const byteArray = new Uint8Array(byteNumbers);
            return { pngBlob: new Blob([byteArray], { type: mime }) };
          } catch (err) {
            // If toBlob() fails (e.g. tainted canvas), try toDataURL() once more as a last attempt.
            // It may still throw SecurityError.
            try {
              const dataUrl = canvas.toDataURL('image/png', 1);
              const parts = dataUrl.split(',');
              if (parts.length !== 2) return { pngBlob: null, pngError: err };
              const mimeMatch = parts[0].match(/:(.*?);/);
              const mime = mimeMatch?.[1] ?? 'image/png';
              const b64 = parts[1];
              const byteChars = atob(b64);
              const byteNumbers = new Array(byteChars.length);
              for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
              const byteArray = new Uint8Array(byteNumbers);
              return { pngBlob: new Blob([byteArray], { type: mime }) };
            } catch {
              return { pngBlob: null, pngError: err };
            }
          }
        };

        const canvasToBmpBlob = (): Blob | null => {
          try {
            const w = canvas.width;
            const h = canvas.height;
            if (!w || !h) return null;
            const imgData = ctx.getImageData(0, 0, w, h);
            const rowSize = Math.floor((24 * w + 31) / 32) * 4;
            const pixelArraySize = rowSize * h;
            const fileHeaderSize = 14;
            const dibHeaderSize = 40;
            const fileSize = fileHeaderSize + dibHeaderSize + pixelArraySize;

            const buffer = new ArrayBuffer(fileSize);
            const view = new DataView(buffer);

            // BITMAPFILEHEADER
            view.setUint8(0, 'B'.charCodeAt(0));
            view.setUint8(1, 'M'.charCodeAt(0));
            view.setUint32(2, fileSize, true);
            view.setUint16(6, 0, true);
            view.setUint16(8, 0, true);
            view.setUint32(10, fileHeaderSize + dibHeaderSize, true);

            // BITMAPINFOHEADER (DIB)
            view.setUint32(14, dibHeaderSize, true);
            view.setInt32(18, w, true);
            view.setInt32(22, h, true); // positive = bottom-up
            view.setUint16(26, 1, true); // planes
            view.setUint16(28, 24, true); // bitCount
            view.setUint32(30, 0, true); // compression (BI_RGB)
            view.setUint32(34, pixelArraySize, true);
            view.setInt32(38, 2835, true); // 72 DPI
            view.setInt32(42, 2835, true);
            view.setUint32(46, 0, true); // colors in color table
            view.setUint32(50, 0, true);

            let offset = fileHeaderSize + dibHeaderSize;
            const data = imgData.data;
            for (let y = h - 1; y >= 0; y--) {
              const rowStart = y * w * 4;
              for (let x = 0; x < w; x++) {
                const i = rowStart + x * 4;
                const r = data[i] ?? 0;
                const g = data[i + 1] ?? 0;
                const b = data[i + 2] ?? 0;
                // BMP stores BGR
                view.setUint8(offset++, b);
                view.setUint8(offset++, g);
                view.setUint8(offset++, r);
              }
              // padding
              const padding = rowSize - w * 3;
              for (let p = 0; p < padding; p++) view.setUint8(offset++, 0);
            }

            return new Blob([buffer], { type: 'image/bmp' });
          } catch {
            return null;
          }
        };

        const { pngBlob, pngError } = await new Promise<{ pngBlob: Blob | null; pngError?: unknown }>(
          (resolve) => {
            img.onload = async () => {
              try {
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                const res = await canvasToPngBlob();
                resolve(res);
              } catch (err) {
                resolve({ pngBlob: null, pngError: err });
              }
            };
            img.onerror = () => resolve({ pngBlob: null, pngError: new Error('Image load failed') });
            img.src = svgUrl;
          },
        );

        // eslint-disable-next-line no-console
        console.log('[copyMermaidSvg] PNG blob meta:', pngBlob ? { type: pngBlob.type, size: pngBlob.size } : null, 'pngError:', pngError);

        const ClipboardItemCtor = (window as unknown as { ClipboardItem?: new (items: Record<string, Blob>) => ClipboardItem }).ClipboardItem;
        // eslint-disable-next-line no-console
        console.log('[copyMermaidSvg] ClipboardItem:', {
          hasClipboardItem: !!ClipboardItemCtor,
          hasClipboardWrite: !!navigator.clipboard?.write,
          itemTypes: (() => {
            const types: string[] = [];
            if (pngBlob) types.push('image/png');
            return types;
          })(),
        });

        if (ClipboardItemCtor && navigator.clipboard?.write && pngBlob) {
          const itemInit: Record<string, Blob> = {};
          itemInit['image/png'] = pngBlob;
          const item = new ClipboardItemCtor(itemInit as Record<string, Blob>);
          try {
            await navigator.clipboard.write([item]);
            // eslint-disable-next-line no-console
            console.log('[copyMermaidSvg] clipboard.write succeeded.');
            return;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.log('[copyMermaidSvg] clipboard.write failed:', err);
          }
        } else if (ClipboardItemCtor && navigator.clipboard?.write) {
          // If canvas export is blocked (tainted canvas), fall back to putting the SVG itself
          // on the clipboard as image/svg+xml. (Some Office versions paste this as an image,
          // others may still treat it as text—at least the clipboard will change.)
          try {
            const svgBase64 = btoa(unescape(encodeURIComponent(svgMarkup)));
            const dataUrl = `data:image/svg+xml;base64,${svgBase64}`;
            const html = `<img src="${dataUrl}"/>`;

            const item = new ClipboardItemCtor(
              {
                'image/svg+xml': svgBlob,
                'text/html': new Blob([html], { type: 'text/html' }),
              } as Record<string, Blob>,
            );
            await navigator.clipboard.write([item]);
            // eslint-disable-next-line no-console
            console.log('[copyMermaidSvg] clipboard.write succeeded with image/svg+xml + text/html fallback.');
            return;
          } catch (err) {
            // eslint-disable-next-line no-console
            console.log('[copyMermaidSvg] svg fallback clipboard.write failed:', err);
          }
        }

        // eslint-disable-next-line no-console
        console.log('[copyMermaidSvg] Not writing to clipboard. Reasons:', {
          pngBlobPresent: !!pngBlob,
          clipboardWritePresent: !!navigator.clipboard?.write,
          ClipboardItemCtorPresent: !!ClipboardItemCtor,
        });
      }
    } finally {
      URL.revokeObjectURL(svgUrl);
    }

    // If we couldn't write an image payload, do not fall back to copying SVG text.
    // Office apps (PowerPoint/Word) will paste SVG markup as text, which isn't what we want.
  }

  private applyClientSideFilters(
    list: ListEntities200ResponseInner[],
    filters: EntityListFilters,
  ): ListEntities200ResponseInner[] {
    // Step 1: Use ApplicationsService.applyFilters() for the full filter logic (AND across all criteria).
    const seeds = this.applicationsService.applyFilters({
      name: filters.name,
      status: filters.status,
      technicalSuitability: filters.technicalSuitability,
      functionalSuitability: filters.functionalSuitability,
      lxTimeClassification: filters.lxTimeClassification,
      northStarClassification: filters.northStarClassification,
      businessCriticality: filters.businessCriticality,
      relApplicationToBusinessCapability: filters.relApplicationToBusinessCapability,
      relApplicationToBusinessCapabilityMode: filters.relApplicationToBusinessCapabilityMode,
      relApplicationToUserGroup: filters.relApplicationToUserGroup,
      relApplicationToUserGroupMode: filters.relApplicationToUserGroupMode,
      relApplicationToProject: filters.relApplicationToProject,
      relApplicationToDataProduct: filters.relApplicationToDataProduct,
      tags: filters.tags,
      customFields: filters.customFields,
    }) as unknown as ListEntities200ResponseInner[];

    // Step 2: Build migration + alternatives graph from the FULL entity list.
    // Only include ACTIVE entities so the transitive hull never reaches ARCHIVED apps.
    const activeIds = new Set<string>();
    for (const e of list) {
      if (e?.id && ((e as any).status ?? 'ACTIVE') === 'ACTIVE') {
        activeIds.add(e.id);
      }
    }

    const byId = new Map<string, ListEntities200ResponseInner>();
    for (const e of list) {
      if (e?.id) byId.set(e.id, e);
    }

    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    const addDirected = (a: string, b: string) => {
      if (!activeIds.has(a) || !activeIds.has(b)) return;
      if (!outgoing.has(a)) outgoing.set(a, new Set());
      outgoing.get(a)!.add(b);
      if (!incoming.has(b)) incoming.set(b, new Set());
      incoming.get(b)!.add(a);
    };

    if (this.showMigrationPaths()) {
      for (const e of list) {
        const sourceId = e?.id;
        if (!sourceId) continue;
        const targetIds = this.extractMigrationTargetIds(e.migrationTarget);
        for (const targetId of targetIds) {
          addDirected(sourceId, targetId);
        }
      }
    }

    if (this.showAlternatives()) {
      for (const e of list) {
        const sourceId = e?.id;
        if (!sourceId) continue;
        const targetIds = this.extractAlternativeIds(e.alternatives);
        for (const targetId of targetIds) {
          addDirected(sourceId, targetId);
        }
      }
    }

    // Step 3: Traverse from seeds to get the transitive hull.
    const seedIds = new Set<string>();
    for (const e of seeds) {
      if (e?.id) seedIds.add(e.id);
    }

    const traverse = (graph: Map<string, Set<string>>, maxDepth: number): Set<string> => {
      if (maxDepth === 0) {
        return new Set<string>(seedIds);
      }
      const visited = new Set<string>(seedIds);
      const queue: [string, number][] = Array.from(seedIds).map(id => [id, 0]);
      while (queue.length > 0) {
        const [cur, depth] = queue.shift()!;
        if (!cur) continue;
        if (depth >= maxDepth) continue;
        const next = graph.get(cur);
        if (!next) continue;
        for (const n of next) {
          if (visited.has(n)) continue;
          visited.add(n);
          queue.push([n, depth + 1]);
        }
      }
      return visited;
    };

    const range = this.migrationPathsRange();
    const predecessorsAndSeeds = traverse(incoming, Math.abs(range.left));
    const successorsAndSeeds = traverse(outgoing, range.right);

    // Step 4: Return seeds ∪ hull, looked up from the full entity list.
    const includedIds = new Set<string>([...predecessorsAndSeeds, ...successorsAndSeeds]);
    if (includedIds.size === 0) return [];
    return Array.from(includedIds)
      .map((id) => byId.get(id))
      .filter((e): e is ListEntities200ResponseInner => !!e);
  }

  /** Build mermaid flowchart for all applications that are source or target of a migrationTarget. */
  private buildMermaidDiagram(
    entities: ListEntities200ResponseInner[],
    allEntities: ListEntities200ResponseInner[],
  ): string {
    if (!entities || entities.length === 0) {
      return '';
    }

    const entityIds = new Set<string>();
    for (const e of entities) {
      if (e.id) entityIds.add(e.id);
    }

    const nodeLabels = new Map<string, string>();
    // Keep edges as structured data so we can order nodes/edges for a cleaner Mermaid layout.
    const migrationEdges: Array<{
      sourceId: string;
      targetId: string;
      edgeLine: string;
      lifecycle?: string | null;
    }> = [];
    const outgoingTargets = new Map<string, Set<string>>();
    const incomingSources = new Map<string, Set<string>>();

    // Collect alternatives for entities that have them and will be in the diagram.
    const alternativesByEntityId = new Map<string, Array<{ id: string; displayName: string; functionalOverlap?: number | null }>>();
    const alternativeTargetIds = new Set<string>();
    if (this.showAlternatives()) {
      for (const e of entities) {
        const alts = this.extractAlternativesEdges(e.alternatives);
        if (alts.length === 0) continue;
        if (!e.id) continue;
        const validAlts = alts.filter((a) => a?.id && a?.displayName);
        if (validAlts.length > 0) {
          alternativesByEntityId.set(
            e.id,
            validAlts.map((a) => ({ id: a.id!, displayName: a.displayName!, functionalOverlap: a.functionalOverlap })),
          );
          for (const a of validAlts) {
            alternativeTargetIds.add(a.id!);
          }
        }
      }
    }

    // Build entity lookup for displayName and TIME classification lookups.
    const entityById = new Map<string, ListEntities200ResponseInner>();
    for (const e of entities) {
      if (e.id) entityById.set(e.id, e);
    }

    // Helper to get displayName from entity list (fallback to provided name).
    const getDisplayName = (id: string, fallbackName: string): string => {
      const entity = entityById.get(id);
      return entity?.displayName ?? fallbackName;
    };

    // First pass: collect all target IDs from FILTERED entities to know which apps are targeted.
    const allTargetIds = new Set<string>();
    for (const e of entities) {
      for (const id of this.extractMigrationTargetIds(e.migrationTarget)) {
        allTargetIds.add(id);
      }
      for (const id of this.extractAlternativeIds(e.alternatives)) {
        allTargetIds.add(id);
      }
    }

    // Track which node IDs actually have at least one visible edge.
    const nodesWithEdges = new Set<string>();

    // Second pass: register nodes and edges.
    for (const e of entities) {
      const sourceId = e.id;
      const sourceName = e.displayName ?? e.id ?? '';
      if (!sourceId || !sourceName) continue;

      const migrationTargetEdges = this.extractMigrationTargetEdges(e.migrationTarget);
      const hasRawMigrationTargets = this.extractMigrationTargetIds(e.migrationTarget).length > 0;
      const entityHasMigrationTargets = this.showMigrationPaths() && (migrationTargetEdges.length > 0 || hasRawMigrationTargets);
      const alternativesEdges = this.extractAlternativesEdges(e.alternatives);
      const hasRawAlternatives = this.extractAlternativeIds(e.alternatives).length > 0;
      const entityHasAlternatives = this.showAlternatives() && (alternativesEdges.length > 0 || hasRawAlternatives);
      const isReferencedAsTarget = allTargetIds.has(sourceId);

      // Show node if it has outgoing visible edges OR is referenced by another app.
      if (!entityHasMigrationTargets && !entityHasAlternatives && !isReferencedAsTarget) {
        continue;
      }

      if (!nodeLabels.has(sourceId)) {
        nodeLabels.set(sourceId, sourceName);
      }

      // Also register alternative targets as nodes so they can be displayed with dotted arrows.
      if (entityHasAlternatives) {
        for (const alt of alternativesEdges) {
          if (!alt?.id || !alt?.displayName) continue;
          if (!nodeLabels.has(alt.id)) {
            nodeLabels.set(alt.id, getDisplayName(alt.id, alt.displayName));
          }
          nodesWithEdges.add(sourceId);
          nodesWithEdges.add(alt.id);
        }
      }

      if (entityHasMigrationTargets) {
        for (const m of migrationTargetEdges) {
          if (!m) continue;
          const targetId = m.id;
          const targetName = m.displayName ?? m.id;
          if (!targetId || !targetName) continue;
          if (!entityIds.has(targetId)) continue;

          if (!nodeLabels.has(targetId)) {
            nodeLabels.set(targetId, getDisplayName(targetId, targetName));
          }
          nodesWithEdges.add(sourceId);
          nodesWithEdges.add(targetId);

          if (!outgoingTargets.has(sourceId)) outgoingTargets.set(sourceId, new Set());
          outgoingTargets.get(sourceId)!.add(targetId);
          if (!incomingSources.has(targetId)) incomingSources.set(targetId, new Set());
          incomingSources.get(targetId)!.add(sourceId);

          const parts: string[] = [];
          if (m.lifecycle === 'Done') {
            parts.push('✅');
          }
          if (m.proportion != null && m.proportion !== 100) {
            parts.push(`${m.proportion}%`);
          }
          if (m.priority != null) {
          parts.push(`P${m.priority}`);
        }
        if (m.effort) {
          // Mermaid / Office clipboard have issues with rendering '>' reliably.
          // Documented limitation workaround: use '≥' instead of '>'.
          parts.push(String(m.effort).replace(/>/g, '≥'));
        }
        if (m.eta) {
          parts.push(String(m.eta));
        }
        const labelText = parts.join(', ');
        // Mermaid can HTML-escape ">" as `&gt;` when not quoted.
        // Wrap troublesome label strings in quotes so Mermaid treats them as plain text.
        const labelNeedsQuoting = /[<>&>]/.test(labelText);
        const label = parts.length
          ? ` ${labelNeedsQuoting ? `"${labelText}"` : labelText} `
          : '';

        const safeSourceId = this.toMermaidId(sourceId);
        const safeTargetId = this.toMermaidId(targetId);
        const edgeLine =
          label.trim().length > 0
            ? `${safeSourceId} -- ${label} --> ${safeTargetId}`
            : `${safeSourceId} --> ${safeTargetId}`;
        migrationEdges.push({ sourceId, targetId, edgeLine, lifecycle: m.lifecycle ?? null });
        }
      }
    }

    // Post-process: remove nodes that have no edges at all (free-floating).
    for (const id of Array.from(nodeLabels.keys())) {
      if (!nodesWithEdges.has(id)) {
        nodeLabels.delete(id);
      }
    }

    if (nodeLabels.size === 0) {
      return '';
    }

    // Build lookup: entity id -> TIME classification value.
    const timeByEntityId = new Map<string, string>();
    for (const e of entities) {
      if (e.id && e.lxTimeClassification) {
        timeByEntityId.set(e.id, e.lxTimeClassification.toString().trim().toLowerCase());
      }
    }
    for (const id of nodeLabels.keys()) {
      if (!timeByEntityId.has(id)) {
        const entity = entityById.get(id);
        if (entity?.lxTimeClassification) {
          timeByEntityId.set(id, entity.lxTimeClassification.toString().trim().toLowerCase());
        }
      }
    }

    // Order nodes topologically: start from source nodes (no incoming edges)
    // and traverse downstream so edges go left-to-right in graph LR layout.
    const labelOf = (id: string) => nodeLabels.get(id) ?? id;
    const compareByLabel = (a: string, b: string) =>
      labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: 'base' });

    const TIME_PRIORITY: Record<string, number> = {
      '': 0,
      'invest': 1,
      'migrate': 2,
      'tolerate': 3,
      'eliminate': 4,
    };

    const compareByTimePriority = (a: string, b: string): number => {
      const timeA = (timeByEntityId.get(a) ?? '').toLowerCase();
      const timeB = (timeByEntityId.get(b) ?? '').toLowerCase();
      const priorityA = TIME_PRIORITY[timeA] ?? 0;
      const priorityB = TIME_PRIORITY[timeB] ?? 0;
      if (priorityA !== priorityB) return priorityB - priorityA;
      return compareByLabel(a, b);
    };

    const nodeIds = Array.from(nodeLabels.keys());
    // Source nodes: no incoming edges (nothing migrates into them).
    const sourceNodeIds = nodeIds
      .filter((id) => !incomingSources.get(id) || incomingSources.get(id)!.size === 0)
      .sort(compareByTimePriority);

    const orderedNodeIds: string[] = [];
    const visited = new Set<string>();

    const dfsDownstream = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      orderedNodeIds.push(id);

      const downstream = Array.from(outgoingTargets.get(id) ?? []);
      downstream.sort(compareByTimePriority);
      downstream.forEach((targetId) => dfsDownstream(targetId));
    };

    // Start from source nodes (no incoming edges) — they appear leftmost.
    sourceNodeIds.forEach((id) => dfsDownstream(id));
    // Any remaining nodes (cycles or orphans) in priority order.
    nodeIds
      .filter((id) => !visited.has(id))
      .sort(compareByTimePriority)
      .forEach((id) => dfsDownstream(id));

    const rank = new Map<string, number>();
    orderedNodeIds.forEach((id, i) => rank.set(id, i));

    const safeIds = orderedNodeIds.map((id) => this.toMermaidId(id));
    const nodeLines: string[] = orderedNodeIds.map((id, idx) => {
      const safeId = safeIds[idx];
      const safeLabel = this.escapeMermaidLabel(labelOf(id).replace(/&/g, '🙵'));
      return `${safeId}["${safeLabel}"]`;
    });

    // Also sort edge lines so they roughly follow the same layer order as nodes.
    migrationEdges.sort((a, b) => {
      const ta = rank.get(a.targetId) ?? Number.POSITIVE_INFINITY;
      const tb = rank.get(b.targetId) ?? Number.POSITIVE_INFINITY;
      if (ta !== tb) return ta - tb;
      const sa = rank.get(a.sourceId) ?? Number.POSITIVE_INFINITY;
      const sb = rank.get(b.sourceId) ?? Number.POSITIVE_INFINITY;
      if (sa !== sb) return sa - sb;
      return a.edgeLine.localeCompare(b.edgeLine);
    });

    const lines: string[] = ['graph LR'];

    // Write nodes
    for (let i = 0; i < orderedNodeIds.length; i++) {
      lines.push(nodeLines[i]);
    }

    // Collect alternative node definitions first (only if not already defined as a regular node).
    const alternativeNodes: string[] = [];
    if (this.showAlternatives()) {
      for (const e of entities) {
        if (!e.id) continue;
        const alts = alternativesByEntityId.get(e.id);
        if (!alts || alts.length === 0) continue;
        if (!nodeLabels.has(e.id)) continue;

        for (const alt of alts) {
          if (nodeLabels.has(alt.id)) continue;
          const safeAltId = this.toMermaidId(alt.id);
          const altDisplayName = getDisplayName(alt.id, alt.displayName);
          const safeAltLabel = this.escapeMermaidLabel(altDisplayName.replace(/&/g, '🙵'));
          alternativeNodes.push(`${safeAltId}["${safeAltLabel}"]`);
        }
      }
    }

    // Add alternative nodes inside subgraph
    if (alternativeNodes.length > 0) {
      lines.push('subgraph "Alternatives"');
      lines.push('direction TB');
      lines.push(...alternativeNodes);
      // Add invisible links between consecutive alternative nodes to improve layout
      for (let i = 0; i < alternativeNodes.length - 1; i++) {
        const match1 = alternativeNodes[i].match(/^([^\[]+)\[/);
        const match2 = alternativeNodes[i + 1].match(/^([^\[]+)\[/);
        if (match1 && match2) {
          lines.push(`${match1[1]} ~~~ ${match2[1]}`);
        }
      }
      lines.push('end');
    } else {
      lines.push(...alternativeNodes);
    }

    // Mermaid class definitions per TIME classification value.
    const TIME_COLORS: Record<string, { fill: string; stroke: string; color: string }> = {
      tolerate:  { fill: '#12cbed', stroke: '#0ea8c7', color: '#fff' },
      invest:    { fill: '#19c822', stroke: '#15a71d', color: '#fff' },
      migrate:   { fill: '#ed8702', stroke: '#c67302', color: '#fff' },
      eliminate:  { fill: '#c62828', stroke: '#a52020', color: '#fff' },
    };
    const defaultClassName = 'appNode';

    for (const [tv, tc] of Object.entries(TIME_COLORS)) {
      lines.push(
        `classDef time_${tv} fill:${tc.fill},stroke:${tc.stroke},stroke-width:1px,color:${tc.color},rx:5,ry:5;`,
      );
    }
    lines.push(
      `classDef ${defaultClassName} fill:#E8F6FF,stroke:#7BBFE6,stroke-width:1px,color:#0E1B4F,rx:5,ry:5;`,
    );

    // Assign each node to the class matching its TIME classification (or default).
    for (let i = 0; i < orderedNodeIds.length; i++) {
      const timeVal = timeByEntityId.get(orderedNodeIds[i]);
      const cls = (timeVal && TIME_COLORS[timeVal]) ? `time_${timeVal}` : defaultClassName;
      lines.push(`class ${safeIds[i]} ${cls};`);
    }

    // Assign class for alternative nodes (only if not already defined as a regular node).
    // Alternatives use appNode since TIME classification is not available in alternatives data.
    if (this.showAlternatives()) {
      for (const e of entities) {
        if (!e.id) continue;
        const alts = alternativesByEntityId.get(e.id);
        if (!alts || alts.length === 0) continue;
        if (!nodeLabels.has(e.id)) continue;

        for (const alt of alts) {
          if (nodeLabels.has(alt.id)) continue;
          const safeAltId = this.toMermaidId(alt.id);
          lines.push(`class ${safeAltId} ${defaultClassName};`);
        }
      }
    }

    const invisibleLinksCount = (this.showAlternatives() && alternativeNodes.length > 0)
      ? alternativeNodes.length - 1
      : 0;
    let linkIdx = invisibleLinksCount;
    for (const e of migrationEdges) {
      lines.push(e.edgeLine);
      if (e.lifecycle === 'Done') {
        lines.push(`linkStyle ${linkIdx} stroke:#16a34a,stroke-width:3px`);
      }
      linkIdx++;
    }

    // Add alternative edges (dotted arrows) if showAlternatives is enabled.
    if (this.showAlternatives()) {
      for (const e of entities) {
        if (!e.id) continue;
        const alts = alternativesByEntityId.get(e.id);
        if (!alts || alts.length === 0) continue;
        if (!nodeLabels.has(e.id)) continue;

        const safeSourceId = this.toMermaidId(e.id);
        for (const alt of alts) {
          const safeAltId = this.toMermaidId(alt.id);

          if (alt.functionalOverlap != null && alt.functionalOverlap !== 100) {
            lines.push(`${safeSourceId} -. "${alt.functionalOverlap}%" .-> ${safeAltId}`);
          } else {
            lines.push(`${safeSourceId} -..-> ${safeAltId}`);
          }
        }
      }
    }

    return lines.join('\n');
  }

  /** Convert GUID / arbitrary id into a mermaid-safe identifier (letters, digits, underscores only). */
  private toMermaidId(id: string): string {
    if (!id) return '';
    return id.replace(/[^a-zA-Z0-9_]/g, '_');
  }

  /** Escape label so it is safe inside quotes for mermaid. */
  private escapeMermaidLabel(label: string): string {
    if (!label) return '';
    return label.replace(/"/g, '\\"');
  }

  /** Extract migration target IDs from either flat array or edges notation. */
  private extractMigrationTargetIds(raw: unknown): string[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((m: any) => m?.id as string).filter((id: string) => !!id);
    }
    if (typeof raw === 'object' && Array.isArray((raw as any).edges)) {
      return (raw as any).edges
        .map((e: any) => e?.node?.factSheet?.id as string)
        .filter((id: string) => !!id);
    }
    return [];
  }

  /** Extract alternative target IDs from either flat array or edges notation. */
  private extractAlternativeIds(raw: unknown): string[] {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((a: any) => a?.id as string).filter((id: string) => !!id);
    }
    if (typeof raw === 'object' && Array.isArray((raw as any).edges)) {
      return (raw as any).edges
        .map((e: any) => e?.node?.factSheet?.id as string)
        .filter((id: string) => !!id);
    }
    return [];
  }

  /** Extract migrationTarget items from flat array or edges notation. */
  private extractMigrationTargetEdges(raw: unknown): Array<{ id: string; displayName: string; proportion?: number; priority?: number; effort?: string; eta?: string; lifecycle?: string | null }> {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((m: any) => ({
        id: m?.id ?? '',
        displayName: m?.displayName ?? '',
        proportion: m?.proportion,
        priority: m?.priority,
        effort: m?.effort,
        eta: m?.eta,
        lifecycle: m?.lifecycle ?? null,
      })).filter((m) => m.id && m.displayName);
    }
    if (typeof raw === 'object' && Array.isArray((raw as any).edges)) {
      const o = raw as Record<string, unknown>;
      const edges = o['edges'] as any[];
      return edges.map((edge: any) => {
        const fs = edge?.node?.factSheet ?? {};
        return {
          id: fs?.id ?? '',
          displayName: fs?.displayName ?? '',
          proportion: edge?.proportion,
          priority: edge?.priority,
          effort: edge?.effort,
          eta: edge?.eta,
          lifecycle: edge?.lifecycle ?? null,
        };
      }).filter((m) => m.id && m.displayName);
    }
    return [];
  }

  /** Extract alternatives items from flat array or edges notation. */
  private extractAlternativesEdges(raw: unknown): Array<{ id: string; displayName: string; functionalOverlap?: number }> {
    if (raw == null) return [];
    if (Array.isArray(raw)) {
      return raw.map((a: any) => ({
        id: a?.id ?? '',
        displayName: a?.displayName ?? '',
        functionalOverlap: a?.functionalOverlap,
      })).filter((a) => a.id && a.displayName);
    }
    if (typeof raw === 'object' && Array.isArray((raw as any).edges)) {
      const o = raw as Record<string, unknown>;
      const edges = o['edges'] as any[];
      return edges.map((edge: any) => {
        const fs = edge?.node?.factSheet ?? {};
        return {
          id: fs?.id ?? '',
          displayName: fs?.displayName ?? '',
          functionalOverlap: edge?.functionalOverlap,
        };
      }).filter((a) => a.id && a.displayName);
    }
    return [];
  }
}
