export type ReferenceTargetType = 'BusinessCapability' | 'UserGroup';

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

