import {
  EFFORTS,
  PRIORITIES,
  STATUSES,
  type Effort,
  type Item,
  type Member,
  type Priority,
  type Product,
  type Status,
} from '@/lib/types';

export const SORT_FIELDS = [
  'created',
  'updated',
  'title',
  'key',
  'type',
  'status',
  'priority',
  'effort',
  'release',
  'assignee',
  'source',
] as const;
export type SortField = (typeof SORT_FIELDS)[number];

export const SORT_LABEL: Record<SortField, string> = {
  created: 'Created',
  updated: 'Last updated',
  title: 'Title',
  key: 'Key',
  type: 'Type',
  status: 'Status',
  priority: 'Priority',
  effort: 'Effort',
  release: 'Release',
  assignee: 'Assignee',
  source: 'Source',
};

export type SortDir = 'asc' | 'desc';

/** The direction that puts the most interesting items first when a column is sorted for the first time. */
export const DEFAULT_DIR: Record<SortField, SortDir> = {
  created: 'desc',
  updated: 'desc',
  title: 'asc',
  key: 'asc',
  type: 'asc',
  status: 'asc',
  priority: 'desc',
  effort: 'asc',
  release: 'asc',
  assignee: 'asc',
  source: 'asc',
};

export function isSortField(v: string | undefined): v is SortField {
  return !!v && (SORT_FIELDS as readonly string[]).includes(v);
}

export interface ListSort {
  field: SortField;
  dir: SortDir;
}

export function parseSort(sort: string | undefined, dir: string | undefined): ListSort {
  const field = isSortField(sort) ? sort : 'created';
  return { field, dir: dir === 'asc' || dir === 'desc' ? dir : DEFAULT_DIR[field] };
}

/** Where a column's header link goes: the same field flips the direction, a new field starts at its default. */
export function nextSort(current: ListSort, field: SortField): ListSort {
  if (current.field === field) return { field, dir: current.dir === 'asc' ? 'desc' : 'asc' };
  return { field, dir: DEFAULT_DIR[field] };
}

const STATUS_RANK = Object.fromEntries(STATUSES.map((s, i) => [s, i])) as Record<Status, number>;
const PRIORITY_RANK = Object.fromEntries(PRIORITIES.map((p, i) => [p, i])) as Record<Priority, number>;
const EFFORT_RANK = Object.fromEntries(EFFORTS.map((e, i) => [e, i])) as Record<Effort, number>;

type Cmp = number;

/** Missing values always sink to the bottom, whichever way the column is sorted. */
function compareValues<T extends string | number>(a: T | null, b: T | null, dir: SortDir): Cmp {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const result = typeof a === 'string' && typeof b === 'string' ? a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) : a < b ? -1 : a > b ? 1 : 0;
  return dir === 'asc' ? result : -result;
}

export function sortItems(
  items: Item[],
  sort: ListSort,
  lookup: { products: Product[]; releases: { id: string; version: string }[]; members: Member[] },
): Item[] {
  const keyOf = (i: Item): string | null => {
    const p = lookup.products.find((x) => x.id === i.product_id);
    return p && i.number ? `${p.key}-${String(i.number).padStart(6, '0')}` : null;
  };
  const value = (i: Item): string | number | null => {
    switch (sort.field) {
      case 'created':
        return i.created_at;
      case 'updated':
        return i.updated_at;
      case 'title':
        return i.title;
      case 'key':
        return keyOf(i);
      case 'type':
        return i.type;
      case 'status':
        return STATUS_RANK[i.status];
      case 'priority':
        return i.priority === 'none' ? null : PRIORITY_RANK[i.priority];
      case 'effort':
        return i.effort ? EFFORT_RANK[i.effort] : null;
      case 'release':
        return lookup.releases.find((r) => r.id === i.release_id)?.version ?? null;
      case 'assignee':
        return lookup.members.find((m) => m.user_id === i.assignee_id)?.name ?? null;
      case 'source':
        return i.source?.trim() ? i.source : null;
    }
  };
  return [...items].sort((a, b) => compareValues(value(a), value(b), sort.dir) || b.created_at.localeCompare(a.created_at));
}
