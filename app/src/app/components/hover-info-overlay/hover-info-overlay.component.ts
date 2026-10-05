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

import { DatePipe } from '@angular/common';
import { Component, ElementRef, ViewChild, input, model, output } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';
import { TranslatePipe } from '@ngx-translate/core';

/** One entry of an application's comment log (root-level `comments` property). */
export interface ApplicationComment {
  /** Authenticated user (email / login name); null when not authenticated. */
  author: string | null;
  /** ISO 8601 UTC timestamp, rendered in the viewer's local timezone. */
  datetime: string;
  comment: string;
}

/** Maximum draft height before the textarea scrolls. */
const MAX_DRAFT_HEIGHT = 120;

/**
 * Floating panel that shows additional information (application description,
 * comment log and comment editor) while a display name is hovered.
 * Positioning is done by HoverInfoOverlayService; this component only renders
 * the panel frame and its content.
 */
@Component({
  selector: 'app-hover-info-overlay',
  standalone: true,
  imports: [DatePipe, MatIconModule, TranslatePipe],
  template: `
    <div
      class="hover-info-panel"
      [attr.role]="readOnly() ? 'tooltip' : 'dialog'"
      [attr.aria-label]="readOnly() ? null : ('Comment' | translate)"
      [style.width.px]="width()"
      [style.max-height.px]="maxHeight()"
    >
      @if (description()) {
        <p class="hover-info-panel__description">{{ description() }}</p>
      }

      @if (comments().length > 0) {
        <ul class="hover-info-panel__comments">
          @for (comment of comments(); track $index) {
            <li class="hover-info-panel__comment">
              {{ comment.author ?? ('Anonymous' | translate) }} ({{ comment.datetime | date }}):
              {{ comment.comment }}
            </li>
          }
        </ul>
      }

      @if (!readOnly()) {
        <div class="hover-info-panel__composer">
          <textarea
            #commentInput
            class="hover-info-panel__draft"
            rows="1"
            [placeholder]="'Comment' | translate"
            [value]="draft()"
            (input)="onDraftInput($event)"
            (keydown.enter)="onEnterKeydown($event)"
          ></textarea>
          <button
            type="button"
            class="hover-info-panel__submit"
            [title]="'Submit comment' | translate"
            [attr.aria-label]="'Submit comment' | translate"
            [disabled]="!canSubmit()"
            (click)="submit()"
          >
            <mat-icon>send</mat-icon>
          </button>
        </div>

        @if (saveFailed()) {
          <p class="hover-info-panel__error">{{ 'Save failed. Please try again.' | translate }}</p>
        }
      }
    </div>
  `,
  styles: [`
    :host {
      display: block;
    }

    .hover-info-panel {
      box-sizing: border-box;
      display: flex;
      flex-direction: column;
      padding: 14px 16px;
      overflow: hidden;
      background: linear-gradient(180deg, #ffffff 0%, #f2f7fc 100%);
      border: 1px solid #bcd8f2;
      border-radius: 10px;
      box-shadow:
        0 14px 34px rgba(14, 27, 79, 0.2),
        0 3px 10px rgba(14, 27, 79, 0.1);
      animation: hover-info-in 130ms ease-out;
    }

    .hover-info-panel__description {
      flex: 0 1 auto;
      min-height: 0;
      margin: 0;
      overflow: auto;
      font-size: 13px;
      line-height: 1.55;
      color: #1c2b4a;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .hover-info-panel__comments {
      flex: 1 1 auto;
      min-height: 0;
      margin: 0;
      padding: 10px 0 0;
      overflow-y: auto;
      list-style: none;
      border-top: 1px solid #d7e6f5;
    }

    .hover-info-panel__comments:first-child {
      padding-top: 0;
      border-top: none;
    }

    .hover-info-panel__comment {
      padding: 3px 0;
      font-size: 12.5px;
      line-height: 1.5;
      color: #2b3a57;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }

    .hover-info-panel__composer {
      flex: 0 0 auto;
      display: flex;
      align-items: flex-end;
      gap: 8px;
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #d7e6f5;
    }

    .hover-info-panel__composer:first-child {
      margin-top: 0;
      padding-top: 0;
      border-top: none;
    }

    .hover-info-panel__draft {
      flex: 1 1 auto;
      box-sizing: border-box;
      min-width: 0;
      min-height: 28px;
      max-height: ${MAX_DRAFT_HEIGHT}px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: 12.5px;
      line-height: 1.45;
      color: #1c2b4a;
      resize: none;
      overflow-y: auto;
      background: #ffffff;
      border: 1px solid #bcd8f2;
      border-radius: 6px;
      outline: none;
    }

    .hover-info-panel__draft:focus {
      border-color: #4a90d9;
      box-shadow: 0 0 0 2px rgba(74, 144, 217, 0.22);
    }

    .hover-info-panel__draft::placeholder {
      color: #8797b1;
      opacity: 1;
    }

    .hover-info-panel__submit {
      flex: 0 0 auto;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      box-sizing: border-box;
      width: 30px;
      height: 30px;
      padding: 0;
      color: #ffffff;
      background: #2f6fb4;
      border: none;
      border-radius: 6px;
      cursor: pointer;
    }

    .hover-info-panel__submit:hover:not(:disabled) {
      background: #255d9b;
    }

    .hover-info-panel__submit:focus-visible {
      outline: 2px solid #2f6fb4;
      outline-offset: 2px;
    }

    .hover-info-panel__submit:disabled {
      background: #9db6d1;
      cursor: default;
    }

    .hover-info-panel__submit mat-icon {
      font-size: 17px;
      width: 17px;
      height: 17px;
      line-height: 17px;
    }

    .hover-info-panel__error {
      flex: 0 0 auto;
      margin: 8px 0 0;
      font-size: 11.5px;
      line-height: 1.4;
      color: #b42318;
    }

    @keyframes hover-info-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
      to {
        opacity: 1;
        transform: translateY(0);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .hover-info-panel {
        animation: none;
      }
    }
  `],
})
export class HoverInfoOverlayComponent {
  /** Description text of the hovered application. */
  description = input.required<string>();

  /** Comment log entries of the hovered application (root-level `comments`). */
  comments = input<ApplicationComment[]>([]);

  /** When true the comment editor is hidden (read-only user / attribute). */
  readOnly = input(false);

  /** True while the last comment save failed (shown below the editor). */
  saveFailed = input(false);

  /** Panel width in px (computed by HoverInfoOverlayService). */
  width = input(500);

  /** Panel height cap in px so it stays inside the viewport. */
  maxHeight = input(400);

  /** Draft comment text; kept by HoverInfoOverlayService while the panel is closed. */
  draft = model('');

  /** Emitted with the trimmed draft text when the user submits a comment. */
  readonly submitComment = output<string>();

  @ViewChild('commentInput') private commentInput?: ElementRef<HTMLTextAreaElement>;

  canSubmit(): boolean {
    return this.draft().trim().length > 0;
  }

  /** Keep the draft and grow the textarea with its content. */
  onDraftInput(event: Event): void {
    const textarea = event.target as HTMLTextAreaElement;
    this.draft.set(textarea.value);
    this.resize(textarea);
  }

  /** Enter submits the comment; Shift+Enter inserts a line break. */
  onEnterKeydown(event: Event): void {
    if ((event as KeyboardEvent).shiftKey) return;
    // Must not let the textarea insert the newline before submitting.
    event.preventDefault();
    this.submit();
  }

  submit(): void {
    const text = this.draft().trim();
    if (!text) return;
    this.draft.set('');
    const textarea = this.commentInput?.nativeElement;
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }
    this.submitComment.emit(text);
  }

  /** Auto-grow the textarea up to MAX_DRAFT_HEIGHT (then it scrolls). */
  private resize(textarea: HTMLTextAreaElement): void {
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_DRAFT_HEIGHT)}px`;
  }
}
