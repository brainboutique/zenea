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

export type ReferenceTargetType = 'BusinessCapability' | 'DataProduct' | 'UserGroup' | 'Platform';

export interface ReferenceEditorItem {
  id: string;
  type: ReferenceTargetType;
  displayName: string;
  fullName: string | undefined;
  description: string | undefined;
}

export interface ReferenceEditorDialogData {
  targetType: ReferenceTargetType;
  /** Current selected items to show as selected (order preserved). */
  currentSelection: ReferenceEditorItem[];
}

