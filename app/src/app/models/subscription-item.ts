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

/** Subscription item for a fact sheet (Application, etc.). */
export interface SubscriptionItem {
  /** Edge ID (existing subscriptions have a real ID; new ones get a generated GUID). */
  id: string;
  /** Subscription type: 'RESPONSIBLE' | 'OBSERVER' | etc. */
  type: string;
  /** User display name. */
  displayName: string;
  /** User email (optional, used when adding new subscriptions). */
  email?: string;
  /** User ID (optional, present for existing subscriptions). */
  userId?: string;
}

/** Subscription type options. */
export const SUBSCRIPTION_TYPE_OPTIONS = ['RESPONSIBLE', 'OBSERVER'] as const;

/** Color for subscription pills based on type. */
export function subscriptionTypeColor(type: string): string {
  if (type === 'RESPONSIBLE') return '#ffcdd2';
  return '#e0e0e0';
}
