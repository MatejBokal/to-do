export const ITEM_TYPES = ['bug', 'feature', 'idea', 'modification', 'task'] as const;
export type ItemType = (typeof ITEM_TYPES)[number];

export const STATUSES = ['inbox', 'triaged', 'planned', 'in_progress', 'done', 'parked', 'rejected'] as const;
export type Status = (typeof STATUSES)[number];

export const PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type Priority = (typeof PRIORITIES)[number];

export const EFFORTS = ['xs', 's', 'm', 'l', 'xl'] as const;
export type Effort = (typeof EFFORTS)[number];

/** Statuses that still need work. Used for the default "open" view and for release candidates. */
export const OPEN_STATUSES: string[] = ['inbox', 'triaged', 'planned', 'in_progress'];

export const TYPE_LABEL: Record<ItemType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  idea: 'Idea',
  modification: 'Modification',
  task: 'Task',
};

export const STATUS_LABEL: Record<Status, string> = {
  inbox: 'Inbox',
  triaged: 'Triaged',
  planned: 'Planned',
  in_progress: 'In progress',
  done: 'Done',
  parked: 'Parked',
  rejected: 'Rejected',
};

export const PRIORITY_LABEL: Record<Priority, string> = {
  none: 'No priority',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  urgent: 'Urgent',
};

export function isItemType(v: string): v is ItemType {
  return (ITEM_TYPES as readonly string[]).includes(v);
}
export function isStatus(v: string): v is Status {
  return (STATUSES as readonly string[]).includes(v);
}
export function isPriority(v: string): v is Priority {
  return (PRIORITIES as readonly string[]).includes(v);
}
export function isEffort(v: string): v is Effort {
  return (EFFORTS as readonly string[]).includes(v);
}

export interface Space {
  id: string;
  name: string;
  slug: string;
  kind: 'work' | 'personal';
}

export interface Product {
  id: string;
  space_id: string;
  key: string;
  name: string;
  description: string | null;
  archived: boolean;
}

export interface Release {
  id: string;
  space_id: string;
  product_id: string;
  version: string;
  title: string | null;
  status: 'planned' | 'released';
  planned_for: string | null;
  released_at: string | null;
  notes: string | null;
  created_at: string;
}

export interface Item {
  id: string;
  space_id: string;
  product_id: string | null;
  number: number | null;
  type: ItemType;
  title: string;
  description: string | null;
  status: Status;
  priority: Priority;
  effort: Effort | null;
  source: string | null;
  release_id: string | null;
  assignee_id: string | null;
  created_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ItemEvent {
  id: number;
  item_id: string;
  actor_id: string | null;
  kind: 'created' | 'changed' | 'comment';
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  body: string | null;
  created_at: string;
}

export interface Member {
  user_id: string;
  role: string;
  name: string;
}

export type CaptureResult = { ok: true; id: string; label: string } | { ok: false; error: string };

/** "ACME-12" for items that belong to a product, otherwise null. */
export function itemKey(item: Pick<Item, 'product_id' | 'number'>, products: Product[]): string | null {
  if (!item.product_id || !item.number) return null;
  const product = products.find((p) => p.id === item.product_id);
  return product ? `${product.key}-${item.number}` : null;
}
