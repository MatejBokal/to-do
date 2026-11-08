import Link from 'next/link';
import { notFound } from 'next/navigation';
import EffortMark from '@/components/EffortMark';
import FilterForm from '@/components/FilterForm';
import PriorityMark from '@/components/PriorityMark';
import StatusSelect from '@/components/StatusSelect';
import TypeMark from '@/components/TypeMark';
import { getContext, rows } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import {
  DEFAULT_DIR,
  SORT_FIELDS,
  SORT_LABEL,
  nextSort,
  parseSort,
  sortItems,
  type SortField,
} from '@/lib/list-filters';
import {
  EFFORTS,
  ITEM_TYPES,
  OPEN_STATUSES,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  isEffort,
  isItemType,
  isPriority,
  isStatus,
  itemKey,
  type Item,
  type Status,
} from '@/lib/types';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  const v = Array.isArray(value) ? value[0] : value;
  return v === '' ? undefined : v;
}

function withParams(path: string, params: Record<string, string | undefined>): string {
  const search = new URLSearchParams();
  for (const [name, value] of Object.entries(params)) {
    if (value) search.set(name, value);
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
}

const GROUP_ORDER: Status[] = ['in_progress', 'planned', 'triaged', 'inbox', 'done', 'parked', 'rejected'];

/** Quotes a value for a PostgREST `or()` filter, where commas and parentheses would otherwise end it. */
function orPattern(q: string): string {
  return `"%${q.replace(/[\\"]/g, '\\$&')}%"`;
}

export default async function ItemsView({
  slug,
  filters,
  mode,
  productKey,
}: {
  slug: string;
  filters: SearchParams;
  mode: 'inbox' | 'all' | 'product';
  productKey?: string;
}) {
  const ctx = await getContext(slug);
  const base = `/s/${ctx.space.slug}`;

  const product = productKey ? ctx.products.find((p) => p.key === productKey.toUpperCase()) : undefined;
  if (productKey && !product) notFound();

  // Every filter is a query parameter, and an empty one means "any".
  const type = first(filters.type);
  const status = first(filters.status);
  const priority = first(filters.priority);
  const effort = first(filters.effort);
  const productFilter = product ? undefined : first(filters.product);
  const releaseFilter = first(filters.release);
  const assignee = first(filters.assignee);
  const q = (first(filters.q) ?? '').trim();
  const sort = parseSort(first(filters.sort), first(filters.dir));
  const ungrouped = mode === 'inbox' || first(filters.group) === 'none';

  let query = ctx.supabase.from('items').select('*').eq('space_id', ctx.space.id);
  if (product) query = query.eq('product_id', product.id);
  else if (productFilter === 'none') query = query.is('product_id', null);
  else if (productFilter && ctx.products.some((p) => p.id === productFilter)) query = query.eq('product_id', productFilter);

  if (mode === 'inbox') {
    query = query.eq('status', 'inbox');
  } else if (status === 'all') {
    // no status filter
  } else if (status && isStatus(status)) {
    query = query.eq('status', status);
  } else {
    query = query.in('status', OPEN_STATUSES);
  }
  if (type && isItemType(type)) query = query.eq('type', type);
  if (priority && isPriority(priority)) query = query.eq('priority', priority);
  if (effort === 'none') query = query.is('effort', null);
  else if (effort && isEffort(effort)) query = query.eq('effort', effort);
  if (releaseFilter === 'none') query = query.is('release_id', null);
  else if (releaseFilter) query = query.eq('release_id', releaseFilter);
  if (assignee === 'none') query = query.is('assignee_id', null);
  else if (assignee) query = query.eq('assignee_id', assignee);
  if (q) {
    const pattern = orPattern(q);
    query = query.or(`title.ilike.${pattern},description.ilike.${pattern},source.ilike.${pattern}`);
  }

  const fetched = rows<Item>((await query.order('created_at', { ascending: false }).limit(500)).data);

  // Releases for the filter menu as well as for the Release column.
  const releaseOptions = rows<{ id: string; version: string; product_id: string }>(
    (
      await ctx.supabase
        .from('releases')
        .select('id, version, product_id')
        .eq('space_id', ctx.space.id)
        .order('created_at', { ascending: false })
    ).data,
  ).filter((r) => !product || r.product_id === product.id);

  const items = sortItems(fetched, sort, { products: ctx.products, releases: releaseOptions, members: ctx.members });

  const path = product ? `${base}/p/${product.key}` : mode === 'all' ? `${base}/all` : base;

  const current: Record<string, string | undefined> = {
    q: q || undefined,
    type,
    status,
    priority,
    effort,
    product: productFilter,
    release: releaseFilter,
    assignee,
    sort: first(filters.sort),
    dir: first(filters.dir),
    group: first(filters.group),
  };
  const customised = Object.values(current).some(Boolean);
  // Status counts only when it differs from the default of showing open items.
  const filterCount = [type, status, priority, effort, productFilter, releaseFilter, assignee].filter(Boolean).length;

  const groups: { status: Status | null; items: Item[] }[] = ungrouped
    ? [{ status: null, items }]
    : GROUP_ORDER.map((s) => ({ status: s as Status | null, items: items.filter((i) => i.status === s) })).filter(
        (g) => g.items.length > 0,
      );

  function renderRow(item: Item) {
    const ref = itemKey(item, ctx.products);
    const release = releaseOptions.find((r) => r.id === item.release_id);
    return (
      <li className="row" key={item.id}>
        <TypeMark type={item.type} />
        <span className="key cell-key">{ref ?? '–'}</span>
        <Link href={`${base}/i/${item.id}`} className="row__title">
          {item.title}
        </Link>
        <span className="cell-prio">
          {item.priority !== 'none' ? (
            <span className="prio" data-priority={item.priority}>
              <PriorityMark priority={item.priority} />
              {PRIORITY_LABEL[item.priority]}
            </span>
          ) : (
            <span className="muted">–</span>
          )}
        </span>
        <span className="cell-effort">{item.effort ? <EffortMark effort={item.effort} /> : <span className="muted">–</span>}</span>
        <span className="cell-release">{release ? <span className="key">{release.version}</span> : '–'}</span>
        <span className="cell-created muted">{timeAgo(item.created_at)}</span>
        <StatusSelect id={item.id} status={item.status} />
      </li>
    );
  }

  /** A column header that sorts the list by its field. The active one shows the direction. */
  function headCell(field: SortField, label: string, className?: string) {
    const next = nextSort(sort, field);
    const on = sort.field === field;
    return (
      <Link
        className={`sort${className ? ` ${className}` : ''}`}
        href={withParams(path, { ...current, sort: next.field, dir: next.dir })}
        aria-label={`Sort by ${label.toLowerCase()}`}
        aria-sort={on ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
        replace
      >
        {label}
        {on ? <span aria-hidden="true">{sort.dir === 'asc' ? ' ↑' : ' ↓'}</span> : null}
      </Link>
    );
  }

  return (
    <>
      {product ? (
        <header className="page-head">
          <div>
            <h1>
              <span className="key key--lg">{product.key}</span>
              {product.name}
            </h1>
            {product.description ? <p className="muted">{product.description}</p> : null}
          </div>
          <div className="head-actions">
            <nav className="tabs" aria-label="Product views">
              <Link href={`${base}/p/${product.key}`} aria-current="page">
                Items
              </Link>
              <Link href={`${base}/p/${product.key}/releases`}>Releases</Link>
            </nav>
            <Link className="btn" href={`${base}/new?product=${product.key}`}>
              New item
            </Link>
          </div>
        </header>
      ) : mode === 'inbox' ? (
        <header className="page-head">
          <div>
            <h1>Inbox</h1>
            <p className="muted">New captures wait here until you triage them.</p>
          </div>
        </header>
      ) : (
        <header className="page-head">
          <div>
            <h1>All items</h1>
            <p className="muted">Everything in {ctx.space.name}.</p>
          </div>
        </header>
      )}

      <FilterForm path={path} defaultDirs={DEFAULT_DIR}>
        <details className="menu" data-menu>
          <summary className="btn">
            Filters{filterCount > 0 ? <span className="count">{filterCount}</span> : null}
          </summary>
          <div className="menu__panel">
            <label className="field">
              <span className="field__label">Type</span>
              <select className="input" name="type" defaultValue={type ?? ''} aria-label="Type">
                <option value="">All types</option>
                {ITEM_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {TYPE_LABEL[t]}
                  </option>
                ))}
              </select>
            </label>
            {mode !== 'inbox' ? (
              <label className="field">
                <span className="field__label">Status</span>
                <select className="input" name="status" defaultValue={status ?? ''} aria-label="Status">
                  <option value="">Open</option>
                  {STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {STATUS_LABEL[s]}
                    </option>
                  ))}
                  <option value="all">Everything</option>
                </select>
              </label>
            ) : null}
            <label className="field">
              <span className="field__label">Priority</span>
              <select className="input" name="priority" defaultValue={priority ?? ''} aria-label="Priority">
                <option value="">Any priority</option>
                {[...PRIORITIES].reverse().map((p) => (
                  <option key={p} value={p}>
                    {p === 'none' ? 'No priority' : PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Effort</span>
              <select className="input" name="effort" defaultValue={effort ?? ''} aria-label="Effort">
                <option value="">Any effort</option>
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e.toUpperCase()}
                  </option>
                ))}
                <option value="none">Not estimated</option>
              </select>
            </label>
            {!product ? (
              <label className="field">
                <span className="field__label">Product</span>
                <select className="input" name="product" defaultValue={productFilter ?? ''} aria-label="Product">
                  <option value="">All products</option>
                  {ctx.products
                    .filter((p) => !p.archived)
                    .map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.key} {p.name}
                      </option>
                    ))}
                  <option value="none">No product</option>
                </select>
              </label>
            ) : null}
            <label className="field">
              <span className="field__label">Release</span>
              <select className="input" name="release" defaultValue={releaseFilter ?? ''} aria-label="Release">
                <option value="">Any release</option>
                {releaseOptions.map((r) => (
                  <option key={r.id} value={r.id}>
                    {product ? r.version : `${ctx.products.find((p) => p.id === r.product_id)?.key ?? ''} ${r.version}`}
                  </option>
                ))}
                <option value="none">No release</option>
              </select>
            </label>
            <label className="field">
              <span className="field__label">Assignee</span>
              <select className="input" name="assignee" defaultValue={assignee ?? ''} aria-label="Assignee">
                <option value="">Anyone</option>
                {ctx.members.map((m) => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.name}
                  </option>
                ))}
                <option value="none">Unassigned</option>
              </select>
            </label>
          </div>
        </details>

        <input
          className="input toolbar__search"
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search title, description, source"
          aria-label="Search"
        />
        <label className="toolbar__label">
          Sort
          <select className="input" name="sort" defaultValue={sort.field} aria-label="Sort by">
            {SORT_FIELDS.map((f) => (
              <option key={f} value={f}>
                {SORT_LABEL[f]}
              </option>
            ))}
          </select>
        </label>
        <select className="input" name="dir" defaultValue={sort.dir} aria-label="Sort direction">
          <option value="asc">Ascending</option>
          <option value="desc">Descending</option>
        </select>
        {mode !== 'inbox' ? (
          <label className="toolbar__label">
            Group
            <select className="input" name="group" defaultValue={ungrouped ? 'none' : ''} aria-label="Group by">
              <option value="">By status</option>
              <option value="none">No grouping</option>
            </select>
          </label>
        ) : null}
        {customised ? (
          <Link className="btn btn--ghost" href={path} replace>
            Clear
          </Link>
        ) : null}
      </FilterForm>

      {items.length === 0 ? (
        <div className="empty">
          {mode === 'inbox' && !customised
            ? 'Nothing waiting for triage. Press c to capture something.'
            : 'No items match. Press c to capture one, or loosen the filters.'}
        </div>
      ) : (
        groups.map((group) => (
          <section className="group" key={group.status ?? 'all'}>
            {group.status ? (
              <h2 className="group__title">
                {STATUS_LABEL[group.status]} <span className="muted">{group.items.length}</span>
              </h2>
            ) : null}
            <ul className="list">
              <li className="row row--head">
                <span />
                {headCell('key', 'Key')}
                {headCell('title', 'Title')}
                {headCell('priority', 'Priority', 'cell-prio')}
                {headCell('effort', 'Effort', 'cell-effort')}
                {headCell('release', 'Release', 'cell-release')}
                {headCell('created', 'Created', 'cell-created')}
                {headCell('status', 'Status')}
              </li>
              {group.items.map(renderRow)}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
