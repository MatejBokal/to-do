import Link from 'next/link';
import { notFound } from 'next/navigation';
import PriorityMark from '@/components/PriorityMark';
import StatusSelect from '@/components/StatusSelect';
import TypeMark from '@/components/TypeMark';
import { getContext, rows } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import {
  ITEM_TYPES,
  OPEN_STATUSES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  isItemType,
  isStatus,
  itemKey,
  type Item,
  type Status,
} from '@/lib/types';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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

  const type = first(filters.type);
  const status = first(filters.status);
  const q = (first(filters.q) ?? '').trim();

  let query = ctx.supabase.from('items').select('*').eq('space_id', ctx.space.id);
  if (product) query = query.eq('product_id', product.id);
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
  if (q) query = query.ilike('title', `%${q}%`);

  const items = rows<Item>((await query.order('created_at', { ascending: false }).limit(500)).data);

  const releaseIds = Array.from(new Set(items.map((i) => i.release_id).filter((id): id is string => id !== null)));
  const releases =
    releaseIds.length > 0
      ? rows<{ id: string; version: string }>(
          (await ctx.supabase.from('releases').select('id, version').in('id', releaseIds)).data,
        )
      : [];

  const path = product ? `${base}/p/${product.key}` : mode === 'all' ? `${base}/all` : base;

  const groups: { status: Status | null; items: Item[] }[] =
    mode === 'inbox'
      ? [{ status: null, items }]
      : GROUP_ORDER.map((s) => ({ status: s as Status | null, items: items.filter((i) => i.status === s) })).filter(
          (g) => g.items.length > 0,
        );

  function renderRow(item: Item) {
    const ref = itemKey(item, ctx.products);
    const release = releases.find((r) => r.id === item.release_id);
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
        <span className="cell-effort">{item.effort ? item.effort.toUpperCase() : '–'}</span>
        <span className="cell-release">{release ? <span className="key">{release.version}</span> : '–'}</span>
        <span className="cell-created muted">{timeAgo(item.created_at)}</span>
        <StatusSelect id={item.id} status={item.status} />
      </li>
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

      {mode !== 'inbox' ? (
        <div className="filters">
          <div className="chips" role="group" aria-label="Filter by type">
            <Link className="chip-link" aria-current={!type ? 'true' : undefined} href={withParams(path, { status, q })}>
              All types
            </Link>
            {ITEM_TYPES.map((t) => (
              <Link
                key={t}
                className="chip-link"
                aria-current={type === t ? 'true' : undefined}
                href={withParams(path, { type: t, status, q })}
              >
                <TypeMark type={t} />
                {TYPE_LABEL[t]}
              </Link>
            ))}
          </div>
          <div className="chips" role="group" aria-label="Filter by status">
            <Link className="chip-link" aria-current={!status ? 'true' : undefined} href={withParams(path, { type, q })}>
              Open
            </Link>
            {STATUSES.map((s) => (
              <Link
                key={s}
                className="chip-link"
                aria-current={status === s ? 'true' : undefined}
                href={withParams(path, { type, status: s, q })}
              >
                {STATUS_LABEL[s]}
              </Link>
            ))}
            <Link
              className="chip-link"
              aria-current={status === 'all' ? 'true' : undefined}
              href={withParams(path, { type, status: 'all', q })}
            >
              Everything
            </Link>
          </div>
          <form method="get" action={path} role="search" className="search">
            {type ? <input type="hidden" name="type" value={type} /> : null}
            {status ? <input type="hidden" name="status" value={status} /> : null}
            <input className="input" type="search" name="q" defaultValue={q} placeholder="Search titles" aria-label="Search titles" />
          </form>
        </div>
      ) : null}

      {items.length === 0 ? (
        <div className="empty">
          {mode === 'inbox'
            ? 'Nothing waiting for triage. Press c to capture something.'
            : 'No items match. Press c to capture one, or loosen the filters.'}
        </div>
      ) : (
        groups.map((group) => (
          <section className="group" key={group.status ?? 'inbox'}>
            {group.status ? (
              <h2 className="group__title">
                {STATUS_LABEL[group.status]} <span className="muted">{group.items.length}</span>
              </h2>
            ) : null}
            <ul className="list">
              <li className="row row--head" aria-hidden="true">
                <span />
                <span>Key</span>
                <span>Title</span>
                <span className="cell-prio">Priority</span>
                <span className="cell-effort">Effort</span>
                <span className="cell-release">Release</span>
                <span className="cell-created">Created</span>
                <span>Status</span>
              </li>
              {group.items.map(renderRow)}
            </ul>
          </section>
        ))
      )}
    </>
  );
}
