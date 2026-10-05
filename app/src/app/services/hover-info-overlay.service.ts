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

import { ComponentRef, Injectable, Injector, OnDestroy, OutputRefSubscription, inject } from '@angular/core';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { ComponentPortal } from '@angular/cdk/portal';
import {
  ApplicationComment,
  HoverInfoOverlayComponent,
} from '../components/hover-info-overlay/hover-info-overlay.component';
import { AttributePermissionsService } from './attribute-permissions.service';
import { AuthService } from './auth.service';
import { AuthorizationService } from './authorization.service';
import { EntityApiService } from './entity-api.service';

/** Minimum distance kept between the panel and the viewport edges. */
const EDGE_MARGIN = 8;

/** Gap between the hovered label and the panel. */
const LABEL_GAP = 6;

/** Below this available height the panel is flipped above the label. */
const MIN_PANEL_HEIGHT = 200;

/** Grace period after leaving the label so the pointer can travel onto the panel. */
const HIDE_DELAY_MS = 150;

/** Debounce before comment changes are PATCHed (same as list cell edits). */
const COMMENT_PATCH_DEBOUNCE_MS = 400;

/** Application entity as far as the panel is concerned (row entity / application item). */
export interface HoverInfoEntity {
  id?: string;
  description?: unknown;
  comments?: unknown;
  [key: string]: unknown;
}

/**
 * Shows a floating panel right below a hovered application name (application
 * list, transformation/migration map) with the application description and the
 * comment log. The panel stays visible while the pointer is over the panel
 * itself and hides once the pointer leaves both the name and the panel.
 *
 * Comments are appended locally (immediate UI) and persisted through the
 * debounced Application PATCH endpoint as the root-level `comments` property.
 */
@Injectable({ providedIn: 'root' })
export class HoverInfoOverlayService implements OnDestroy {
  private readonly overlay = inject(Overlay);
  private readonly injector = inject(Injector);
  private readonly auth = inject(AuthService);
  private readonly authorization = inject(AuthorizationService);
  private readonly attributes = inject(AttributePermissionsService);
  private readonly entityApi = inject(EntityApiService);

  private overlayRef: OverlayRef | null = null;
  private componentRef: ComponentRef<HoverInfoOverlayComponent> | null = null;
  /** Entity the currently shown panel belongs to (used to reuse an open panel). */
  private shownEntity: HoverInfoEntity | null = null;
  /** Element the currently shown panel is anchored to. */
  private anchor: Element | null = null;
  /** Host element of the currently shown panel. */
  private panelEl: HTMLElement | null = null;
  /** True while the pointer is over the panel. */
  private pointerInPanel = false;
  /** Pending hide (started when the pointer left the anchor). */
  private hideTimer: ReturnType<typeof setTimeout> | null = null;
  /** Output subscription of the currently shown panel. */
  private submitSub: OutputRefSubscription | null = null;

  /** Draft comment text kept per entity while the panel is closed. */
  private readonly drafts = new Map<string, string>();
  /** Comment log queued for save, per entity id. */
  private readonly pendingComments = new Map<string, ApplicationComment[]>();
  /** Debounce timers of queued comment saves, per entity id. */
  private readonly commentTimers = new Map<string, ReturnType<typeof setTimeout>>();
  /** Entity id whose last comment save failed (re-shown as error until the next save). */
  private saveFailedFor: string | null = null;

  /**
   * Show the panel for the given anchor element (display name / diagram node).
   * Nothing is shown when the entity has no description, no comments and the
   * user cannot comment.
   */
  show(anchor: Element, entity: HoverInfoEntity | null | undefined): void {
    if (!entity) {
      this.hide();
      return;
    }
    const description = this.readDescription(entity);
    const comments = this.readComments(entity);
    const readOnly = this.isReadOnly();
    if (!description && comments.length === 0 && readOnly) {
      this.hide();
      return;
    }
    // Same anchor and entity already shown (e.g. pointer returned from the panel): keep it.
    if (this.overlayRef && this.anchor === anchor && this.shownEntity === entity) {
      this.clearHideTimer();
      return;
    }
    this.hide();

    const anchorRect = anchor.getBoundingClientRect();
    if (anchorRect.width === 0 && anchorRect.height === 0) return;

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const width = this.resolveWidth(viewportWidth);
    const left = Math.min(
      Math.max(anchorRect.left, EDGE_MARGIN),
      Math.max(EDGE_MARGIN, viewportWidth - width - EDGE_MARGIN),
    );

    const spaceBelow = viewportHeight - anchorRect.bottom - LABEL_GAP - EDGE_MARGIN;
    const spaceAbove = anchorRect.top - LABEL_GAP - EDGE_MARGIN;
    const showAbove = spaceBelow < MIN_PANEL_HEIGHT && spaceAbove > spaceBelow;

    const positionStrategy = this.overlay.position().global().left(`${left}px`);
    if (showAbove) {
      positionStrategy.bottom(`${viewportHeight - anchorRect.top + LABEL_GAP}px`);
    } else {
      positionStrategy.top(`${anchorRect.bottom + LABEL_GAP}px`);
    }

    const overlayRef = this.overlay.create({
      positionStrategy,
      scrollStrategy: this.overlay.scrollStrategies.noop(),
      disposeOnNavigation: true,
    });
    const componentRef = overlayRef.attach(
      new ComponentPortal(HoverInfoOverlayComponent, undefined, this.injector),
    );
    componentRef.setInput('description', description);
    componentRef.setInput('comments', comments);
    componentRef.setInput('readOnly', readOnly);
    componentRef.setInput('saveFailed', this.saveFailedFor !== null && this.saveFailedFor === this.entityId(entity));
    componentRef.setInput('draft', this.readDraft(entity));
    componentRef.setInput('width', width);
    componentRef.setInput('maxHeight', Math.max(MIN_PANEL_HEIGHT, showAbove ? spaceAbove : spaceBelow));

    this.overlayRef = overlayRef;
    this.componentRef = componentRef;
    this.shownEntity = entity;
    this.anchor = anchor;
    this.pointerInPanel = false;
    this.submitSub = componentRef.instance.submitComment.subscribe((text) =>
      this.submitComment(entity, text),
    );
    this.panelEl = componentRef.location.nativeElement as HTMLElement;
    this.panelEl.addEventListener('mouseenter', this.onPanelEnter);
    this.panelEl.addEventListener('mouseleave', this.onPanelLeave);
    window.addEventListener('scroll', this.hideListener, true);
    window.addEventListener('resize', this.hideListener);
  }

  /**
   * Hide shortly after the pointer left `anchor` (the display name / node).
   * The panel stays open when the pointer moves onto the panel instead.
   */
  scheduleHide(anchor?: Element): void {
    if (anchor && this.anchor && anchor !== this.anchor) return;
    if (!this.overlayRef || this.pointerInPanel) return;
    this.clearHideTimer();
    this.hideTimer = setTimeout(() => {
      this.hideTimer = null;
      if (!this.pointerInPanel) this.hide();
    }, HIDE_DELAY_MS);
  }

  /** Hide the panel immediately. */
  hide(): void {
    this.clearHideTimer();
    this.storeDraft();
    this.submitSub?.unsubscribe();
    this.submitSub = null;
    if (this.panelEl) {
      this.panelEl.removeEventListener('mouseenter', this.onPanelEnter);
      this.panelEl.removeEventListener('mouseleave', this.onPanelLeave);
      this.panelEl = null;
    }
    this.pointerInPanel = false;
    window.removeEventListener('scroll', this.hideListener, true);
    window.removeEventListener('resize', this.hideListener);
    this.anchor = null;
    this.componentRef = null;
    this.shownEntity = null;
    if (!this.overlayRef) return;
    this.overlayRef.dispose();
    this.overlayRef = null;
  }

  /** Hide the panel when its anchor element has been removed from the DOM. */
  hideIfDetached(): void {
    if (this.anchor && !this.anchor.isConnected) this.hide();
  }

  ngOnDestroy(): void {
    this.hide();
    this.commentTimers.forEach((timer) => clearTimeout(timer));
    this.commentTimers.clear();
    this.pendingComments.clear();
  }

  private readonly hideListener = (event: Event): void => {
    // Scrolling inside the panel (long descriptions) must not close it.
    const target = event.target as Node | null;
    if (target && this.panelEl && (target === this.panelEl || this.panelEl.contains(target))) return;
    // Keep the panel while focus is inside it (e.g. typing a comment).
    const active = document.activeElement;
    if (this.panelEl && active && this.panelEl.contains(active)) return;
    this.hide();
  };

  /** Pointer arrived on the panel: keep it open. */
  private readonly onPanelEnter = (): void => {
    this.pointerInPanel = true;
    this.clearHideTimer();
  };

  /** Pointer left the panel: close. */
  private readonly onPanelLeave = (): void => {
    this.pointerInPanel = false;
    this.hide();
  };

  private clearHideTimer(): void {
    if (this.hideTimer == null) return;
    clearTimeout(this.hideTimer);
    this.hideTimer = null;
  }

  /**
   * Append a comment to the entity, update the panel immediately and queue the
   * debounced save of the root-level `comments` property.
   */
  private submitComment(entity: HoverInfoEntity, text: string): void {
    const comment: ApplicationComment = {
      author: this.auth.getEmail(),
      datetime: new Date().toISOString(),
      comment: text,
    };
    const comments = [...this.readComments(entity), comment];
    // Local first so the panel and any later hover show it right away.
    entity['comments'] = comments;
    this.saveFailedFor = null;
    this.componentRef?.setInput('comments', comments);
    this.componentRef?.setInput('saveFailed', false);

    const id = this.entityId(entity);
    if (!id) return;
    this.drafts.delete(id);
    this.pendingComments.set(id, comments);
    const timer = this.commentTimers.get(id);
    if (timer) clearTimeout(timer);
    this.commentTimers.set(
      id,
      setTimeout(() => {
        this.commentTimers.delete(id);
        const queued = this.pendingComments.get(id);
        this.pendingComments.delete(id);
        if (queued === undefined) return;
        this.entityApi.patchEntity(id, { comments: queued }, 'Application').subscribe({
          next: () => this.setSaveFailed(id, false),
          error: () => this.setSaveFailed(id, true),
        });
      }, COMMENT_PATCH_DEBOUNCE_MS),
    );
  }

  /** Update the error flag of the shown entity. */
  private setSaveFailed(id: string, failed: boolean): void {
    if (failed) this.saveFailedFor = id;
    else if (this.saveFailedFor === id) this.saveFailedFor = null;
    if (this.entityId(this.shownEntity) !== id) return;
    this.componentRef?.setInput('saveFailed', failed);
  }

  /** Keep the unsent draft of the currently shown entity while the panel is closed. */
  private storeDraft(): void {
    const id = this.entityId(this.shownEntity);
    const draft = this.componentRef?.instance.draft();
    if (!id || !draft || !draft.trim()) {
      if (id) this.drafts.delete(id);
      return;
    }
    this.drafts.set(id, draft);
  }

  private readDraft(entity: HoverInfoEntity): string {
    const id = this.entityId(entity);
    if (!id) return '';
    return this.drafts.get(id) ?? '';
  }

  /** Entity id used for saves and draft storage (null when missing). */
  private entityId(entity: HoverInfoEntity | null): string | null {
    const id = entity?.['id'];
    return typeof id === 'string' && id ? id : null;
  }

  /** Application description shown in the panel (trimmed, may be empty). */
  private readDescription(entity: HoverInfoEntity): string {
    const description = entity['description'];
    return typeof description === 'string' ? description.trim() : '';
  }

  /** Comment log of the entity; malformed entries are dropped. */
  private readComments(entity: HoverInfoEntity): ApplicationComment[] {
    const raw = entity['comments'];
    if (!Array.isArray(raw)) return [];
    const comments: ApplicationComment[] = [];
    for (const value of raw) {
      const comment = this.toComment(value);
      if (comment) comments.push(comment);
    }
    return comments;
  }

  private toComment(value: unknown): ApplicationComment | null {
    if (typeof value !== 'object' || value === null) return null;
    const record = value as Record<string, unknown>;
    if (typeof record['comment'] !== 'string') return null;
    const author = record['author'];
    const datetime = record['datetime'];
    return {
      author: typeof author === 'string' && author.trim() ? author : null,
      // Unparseable values become '' so the date pipe never throws.
      datetime: typeof datetime === 'string' && !Number.isNaN(Date.parse(datetime)) ? datetime : '',
      comment: record['comment'],
    };
  }

  /** The comment editor is hidden when the user may not edit or write `comments`. */
  private isReadOnly(): boolean {
    return !this.authorization.canEdit() || !this.attributes.isWritable('comments');
  }

  /**
   * Panel width: 50% of the screen, capped at 1000px.
   * On screens narrower than ~1000px use the screen width minus 30px.
   */
  private resolveWidth(viewportWidth: number): number {
    if (viewportWidth < 1000) return Math.max(viewportWidth - 30, 240);
    return Math.min(Math.round(viewportWidth / 2), 1000);
  }
}
