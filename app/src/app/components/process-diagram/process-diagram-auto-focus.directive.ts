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

import { AfterViewInit, Directive, ElementRef, inject } from '@angular/core';

/**
 * Focuses and selects its input as soon as it is created.
 *
 * Used by the inline rename fields of the process diagram node templates.
 * Focus must not be driven by an effect() reading a viewChild(): node template
 * components created by ngDiagram never resolve that query (the input renders,
 * the viewChild() signal stays undefined), so the effect would fire once with
 * no element and never again.
 */
@Directive({
  selector: 'input[appAutoFocus]',
  standalone: true,
})
export class ProcessDiagramAutoFocusDirective implements AfterViewInit {
  private readonly el = inject(ElementRef<HTMLInputElement>);

  ngAfterViewInit(): void {
    this.el.nativeElement.focus();
    this.el.nativeElement.select();
  }
}
