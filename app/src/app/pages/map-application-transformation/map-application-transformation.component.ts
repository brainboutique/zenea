import {
  Component,
  OnInit,
  inject,
  ElementRef,
  signal,
  computed,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, Params, Router } from '@angular/router';
import { take } from 'rxjs';
import { MarkdownModule } from 'ngx-markdown';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { EntityApiService } from '../../services/entity-api.service';
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
import { TranslateModule } from '@ngx-translate/core';

const QP = {
  name: 'name',
  techSuit: 'techSuit',
  bizSuit: 'bizSuit',
  timeClass: 'timeClass',
  bizCrit: 'bizCrit',
  bizCap: 'bizCap',
  userGroup: 'userGroup',
  project: 'project',
  platformTEMP: 'platformTEMP',
} as const;

@Component({
  selector: 'app-map-application-transformation',
  standalone: true,
  imports: [
    CommonModule,
    ListFiltersComponent,
    MarkdownModule,
    MatProgressSpinnerModule,
    MatIconModule,
    TranslateModule,
  ],
  templateUrl: './map-application-transformation.component.html',
  styleUrl: './map-application-transformation.component.scss',
})
export class MapApplicationTransformationComponent implements OnInit {
  private entityService = inject(EntityApiService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private pageTitleService = inject(PageTitleService);
  private hostEl = inject(ElementRef<HTMLElement>);

  /** Initial filters from URL, passed once into list-filters. */
  initialFilters = signal<Partial<EntityListFilters>>({});

  /** Raw entities from API according to current server-side filters. */
  private entities = signal<ListEntities200ResponseInner[]>([]);

  /** Current name filter (client-side only). */
  private nameFilter = signal('');

  /** Current TIME classification filter (client-side only). */
  private timeClassificationFilter = signal('');

  /** Current business criticality filter (client-side only). */
  private businessCriticalityFilter = signal('');

  /** Last server-side filters key to avoid unnecessary reloads. */
  private lastServerFilters = signal<string>('');

  loading = signal(false);
  error = signal<string | null>(null);

  /** Pure Mermaid definition for the flowchart (no ``` fences). */
  diagramMarkdown = signal<string>('');

  /** Whether the Mermaid definition editor is visible. */
  showEditor = signal(false);

  /** True when there are no migration relationships to display. */
  noRelationsToDisplay = computed(() => {
    return !this.loading() && !this.error() && this.diagramMarkdown().trim() === '';
  });

  /** Mermaid code block for preview (with ```mermaid fences). */
  diagramMarkdownCodeBlock = computed(() => {
    const body = this.diagramMarkdown().trim();
    if (!body) return '';
    return ['```mermaid', body, '```'].join('\n');
  });

  ngOnInit(): void {
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
      const platformTEMP = String(qp[QP.platformTEMP] ?? '').trim();
      if (platformTEMP) partial.platformTEMP = platformTEMP;
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
    if (filters.platformTEMP) params[QP.platformTEMP] = filters.platformTEMP;

    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: params,
      queryParamsHandling: '',
      replaceUrl: true,
    });

    this.nameFilter.set(filters.name?.trim() ?? '');
    this.timeClassificationFilter.set(filters.lxTimeClassification ?? '');
    this.businessCriticalityFilter.set(filters.businessCriticality ?? '');

    const serverKey = `${filters.technicalSuitability}|${filters.functionalSuitability}|${filters.relApplicationToBusinessCapability}|${filters.relApplicationToUserGroup}|${filters.relApplicationToProject}|${filters.platformTEMP}`;
    if (this.lastServerFilters() !== serverKey) {
      this.lastServerFilters.set(serverKey);
      this.loadEntities(filters);
    } else {
      this.applyClientSideFiltersAndBuildDiagram();
    }
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
        filters.relApplicationToProject || undefined,
        filters.platformTEMP || undefined,
      )
      .subscribe({
        next: (list) => {
          this.entities.set(list ?? []);
          this.applyClientSideFiltersAndBuildDiagram();
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err?.message ?? 'Failed to load entities.');
          this.entities.set([]);
          this.diagramMarkdown.set('');
          this.loading.set(false);
        },
      });
  }

  /** Apply client-side filters (name, TIME, business criticality) and rebuild the mermaid diagram. */
  private applyClientSideFiltersAndBuildDiagram(): void {
    const filtered = this.applyClientSideFilters(
      this.entities(),
      this.nameFilter(),
      this.timeClassificationFilter(),
      this.businessCriticalityFilter(),
    );
    const markdown = this.buildMermaidDiagram(filtered);
    this.diagramMarkdown.set(markdown);
  }

  /** Handler for manual edits in the Mermaid textarea. */
  onDiagramInput(value: string): void {
    this.diagramMarkdown.set(value ?? '');
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
    nameText: string,
    timeClassification: string,
    businessCriticality: string,
  ): ListEntities200ResponseInner[] {
    const timeBizFiltered = (() => {
      let result = list;
      if (timeClassification) {
        if (timeClassification === SUITABILITY_FILTER_EMPTY) {
          result = result.filter(
            (e) =>
              !e.lxTimeClassification ||
              (e.lxTimeClassification as string).trim() === '',
          );
        } else {
          const desired = timeClassification.toLowerCase();
          result = result.filter(
            (e) => (e.lxTimeClassification ?? '').toString().toLowerCase() === desired,
          );
        }
      }
      if (businessCriticality) {
        if (businessCriticality === SUITABILITY_FILTER_EMPTY) {
          result = result.filter(
            (e) =>
              !e.businessCriticality ||
              (e.businessCriticality as string).trim() === '',
          );
        } else {
          const desired = businessCriticality.toLowerCase();
          result = result.filter(
            (e) => (e.businessCriticality ?? '').toString().toLowerCase() === desired,
          );
        }
      }
      return result;
    })();

    const q = (nameText ?? '').trim();
    if (!q) return timeBizFiltered;

    const seeds = this.filterEntitiesByName(timeBizFiltered, q);
    if (seeds.length === 0) return [];

    // Expand to directional transitive hull from the name-matched seeds:
    // all predecessors (incoming closure) and all successors (outgoing closure),
    // restricted to entities remaining after other client-side filters.
    // This avoids lateral inclusion across siblings (e.g. A->B and A->D, seed B should not include D).
    const byId = new Map<string, ListEntities200ResponseInner>();
    for (const e of timeBizFiltered) {
      if (!e?.id) continue;
      byId.set(e.id, e);
    }

    const outgoing = new Map<string, Set<string>>();
    const incoming = new Map<string, Set<string>>();
    const addDirected = (a: string, b: string) => {
      if (!outgoing.has(a)) outgoing.set(a, new Set());
      outgoing.get(a)!.add(b);
      if (!incoming.has(b)) incoming.set(b, new Set());
      incoming.get(b)!.add(a);
    };

    for (const e of timeBizFiltered) {
      const sourceId = e?.id;
      if (!sourceId) continue;
      const arr = e.migrationTarget;
      if (!Array.isArray(arr) || arr.length === 0) continue;
      for (const m of arr) {
        const targetId = m?.id;
        if (!targetId) continue;
        if (!byId.has(targetId)) continue;
        addDirected(sourceId, targetId);
      }
    }

    const seedIds = new Set<string>();
    for (const e of seeds) {
      if (!e?.id) continue;
      seedIds.add(e.id);
    }
    if (seedIds.size === 0) return [];

    const traverse = (graph: Map<string, Set<string>>): Set<string> => {
      const visited = new Set<string>(seedIds);
      const queue = Array.from(seedIds);
      while (queue.length > 0) {
        const cur = queue.shift();
        if (!cur) continue;
        const next = graph.get(cur);
        if (!next) continue;
        for (const n of next) {
          if (visited.has(n)) continue;
          visited.add(n);
          queue.push(n);
        }
      }
      return visited;
    };

    const predecessorsAndSeeds = traverse(incoming);
    const successorsAndSeeds = traverse(outgoing);
    const includedIds = new Set<string>([
      ...predecessorsAndSeeds,
      ...successorsAndSeeds,
    ]);

    return timeBizFiltered.filter((e) => !!e?.id && includedIds.has(e.id));
  }

  /** Match entity by displayName ++ earmarkingsTEMP, business capabilities' displayName, or userGroup displayName containing the text (case-insensitive). */
  private filterEntitiesByName(
    list: ListEntities200ResponseInner[],
    nameText: string,
  ): ListEntities200ResponseInner[] {
    const q = (nameText ?? '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((entity) => {
      const nameAndEarmarkings = [
        entity.displayName ?? '',
        entity.earmarkingsTEMP ?? '',
      ]
        .filter(Boolean)
        .join(' ');
      if (nameAndEarmarkings.toLowerCase().includes(q)) return true;
      const caps = entity.relApplicationToBusinessCapability ?? [];
      if (
        caps.some((c) =>
          (c.displayName ?? '').toLowerCase().includes(q),
        )
      )
        return true;
      const groups = entity.relApplicationToUserGroup ?? [];
      if (
        groups.some((g) =>
          (g.displayName ?? g.fullName ?? '')
            .toLowerCase()
            .includes(q),
        )
      )
        return true;
      return false;
    });
  }

  /** Build mermaid flowchart for all applications that are source or target of a migrationTarget. */
  private buildMermaidDiagram(
    entities: ListEntities200ResponseInner[],
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
    }> = [];
    const outgoingTargets = new Map<string, Set<string>>();
    const incomingSources = new Map<string, Set<string>>();

    // First pass: collect nodes and edges from migrationTarget.
    for (const e of entities) {
      const sourceId = e.id;
      const sourceName = e.displayName ?? e.id ?? '';
      if (!sourceId || !sourceName) continue;

      // Always register node for any entity that has at least one migrationTarget edge.
      const arr = e.migrationTarget;
      if (!Array.isArray(arr) || arr.length === 0) {
        continue;
      }

      if (!nodeLabels.has(sourceId)) {
        nodeLabels.set(sourceId, sourceName);
      }

      for (const m of arr) {
        if (!m) continue;
        const targetId = m.id;
        const targetName = m.displayName ?? m.id;
        if (!targetId || !targetName) continue;
        if (!entityIds.has(targetId)) continue;

        if (!nodeLabels.has(targetId)) {
          nodeLabels.set(targetId, targetName);
        }

        if (!outgoingTargets.has(sourceId)) outgoingTargets.set(sourceId, new Set());
        outgoingTargets.get(sourceId)!.add(targetId);
        if (!incomingSources.has(targetId)) incomingSources.set(targetId, new Set());
        incomingSources.get(targetId)!.add(sourceId);

        const parts: string[] = [];
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
        migrationEdges.push({ sourceId, targetId, edgeLine });
      }
    }

    if (nodeLabels.size === 0 || migrationEdges.length === 0) {
      return '';
    }

    // Order nodes to work "backwards": start from final targets (no outgoing migration edges),
    // then recursively include all apps that migrate to them.
    const labelOf = (id: string) => nodeLabels.get(id) ?? id;
    const compareByLabel = (a: string, b: string) =>
      labelOf(a).localeCompare(labelOf(b), undefined, { sensitivity: 'base' });

    const nodeIds = Array.from(nodeLabels.keys());
    const sinkNodeIds = nodeIds
      .filter((id) => !outgoingTargets.get(id) || outgoingTargets.get(id)!.size === 0)
      .sort(compareByLabel);

    const orderedNodeIds: string[] = [];
    const visited = new Set<string>();

    const dfsUpstream = (id: string): void => {
      if (visited.has(id)) return;
      visited.add(id);
      orderedNodeIds.push(id);

      const upstream = Array.from(incomingSources.get(id) ?? []);
      upstream.sort(compareByLabel);
      upstream.forEach((sourceId) => dfsUpstream(sourceId));
    };

    sinkNodeIds.forEach((id) => dfsUpstream(id));
    // Handle cycles / graphs without obvious sinks: append any remaining nodes deterministically.
    nodeIds
      .filter((id) => !visited.has(id))
      .sort(compareByLabel)
      .forEach((id) => dfsUpstream(id));

    const rank = new Map<string, number>();
    orderedNodeIds.forEach((id, i) => rank.set(id, i));

    // Build lookup: entity id -> TIME classification value.
    const timeByEntityId = new Map<string, string>();
    for (const e of entities) {
      if (e.id && e.lxTimeClassification) {
        timeByEntityId.set(e.id, e.lxTimeClassification.toString().trim().toLowerCase());
      }
    }

    console.log("### Mapped ",entities,timeByEntityId);

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
    lines.push(...nodeLines);

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

    lines.push(...migrationEdges.map((e) => e.edgeLine));

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
    // Escape embedded double quotes to avoid breaking the node declaration.
    return label.replace(/"/g, '\\"');
  }
}

