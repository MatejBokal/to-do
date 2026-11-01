import Link from 'next/link';
import { notFound } from 'next/navigation';
import TypeMark from '@/components/TypeMark';
import { addComment, deleteItem, promoteItem, updateItem } from '@/lib/actions';
import { getContext, rows } from '@/lib/data';
import { timeAgo } from '@/lib/format';
import {
  EFFORTS,
  ITEM_TYPES,
  PRIORITIES,
  PRIORITY_LABEL,
  STATUSES,
  STATUS_LABEL,
  TYPE_LABEL,
  itemKey,
  type Item,
  type ItemEvent,
  type ItemType,
  type Priority,
  type Release,
  type Status,
} from '@/lib/types';

const FIELD_LABEL: Record<string, string> = {
  type: 'Type',
  status: 'Status',
  priority: 'Priority',
  effort: 'Effort',
  product: 'Product',
  release: 'Release',
  assignee: 'Assignee',
};

function valueLabel(field: string | null, value: string | null): string {
  if (value === null || value === '') return 'none';
  if (field === 'type') return TYPE_LABEL[value as ItemType] ?? value;
  if (field === 'status') return STATUS_LABEL[value as Status] ?? value;
  if (field === 'priority') return PRIORITY_LABEL[value as Priority] ?? value;
  if (field === 'effort') return value.toUpperCase();
  return value;
}

function describeEvent(event: ItemEvent): string {
  if (event.kind === 'created') {
    return `Created as ${valueLabel('type', event.new_value).toLowerCase()}`;
  }
  if (event.field === 'type' && event.old_value === 'idea') {
    return `Promoted from idea to ${valueLabel('type', event.new_value).toLowerCase()}`;
  }
  const label = FIELD_LABEL[event.field ?? ''] ?? event.field ?? 'Field';
  return `${label} changed from ${valueLabel(event.field, event.old_value)} to ${valueLabel(event.field, event.new_value)}`;
}

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space: slug, id } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  const ctx = await getContext(slug);
  const base = `/s/${ctx.space.slug}`;

  const { data } = await ctx.supabase.from('items').select('*').eq('id', id).eq('space_id', ctx.space.id).maybeSingle();
  const item = (data ?? null) as Item | null;
  if (!item) notFound();

  const product = ctx.products.find((p) => p.id === item.product_id) ?? null;
  const releases = product
    ? rows<Release>(
        (await ctx.supabase.from('releases').select('*').eq('product_id', product.id).order('created_at', { ascending: false }))
          .data,
      )
    : [];
  const events = rows<ItemEvent>(
    (await ctx.supabase.from('item_events').select('*').eq('item_id', item.id).order('created_at', { ascending: true })).data,
  );

  const ref = itemKey(item, ctx.products);
  const returnTo = `${base}/i/${item.id}`;
  const actorName = (actorId: string | null) => ctx.members.find((m) => m.user_id === actorId)?.name ?? 'Someone';

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <Link href={product ? `${base}/p/${product.key}` : base}>{product ? product.name : 'Inbox'}</Link>
        <span aria-hidden="true">/</span>
        <span>{ref ?? 'Unsorted'}</span>
      </nav>

      <header className="item-head">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <TypeMark type={item.type} />
          <span>{TYPE_LABEL[item.type]}</span>
          {ref ? <span className="key key--lg">{ref}</span> : null}
        </h1>
        <div className="item-head__actions">
          {item.type === 'idea' ? (
            <>
              <form action={promoteItem}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="to" value="feature" />
                <button className="btn btn--primary" type="submit">
                  Promote to feature
                </button>
              </form>
              <form action={promoteItem}>
                <input type="hidden" name="id" value={item.id} />
                <input type="hidden" name="to" value="modification" />
                <button className="btn" type="submit">
                  Make it a modification
                </button>
              </form>
            </>
          ) : null}
        </div>
      </header>

      {error ? (
        <p className="notice notice--error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      {/* key={updated_at} remounts the form after a save or a promotion, so the fields show the saved values */}
      <form action={updateItem} className="detail" key={item.updated_at}>
        <input type="hidden" name="id" value={item.id} />
        <input type="hidden" name="return_to" value={returnTo} />

        <div className="detail__main">
          <label className="field">
            <span className="field__label">Title</span>
            <input className="input input--title" name="title" defaultValue={item.title} required />
          </label>
          <label className="field">
            <span className="field__label">Description</span>
            <textarea
              className="input"
              name="description"
              rows={12}
              defaultValue={item.description ?? ''}
              placeholder="What happened, what you expected, links, notes"
            />
          </label>
          <div>
            <button className="btn btn--primary" type="submit">
              Save changes
            </button>
          </div>
        </div>

        <div className="detail__side">
          <label className="field">
            <span className="field__label">Type</span>
            <select className="input" name="type" defaultValue={item.type}>
              {ITEM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Status</span>
            <select className="input" name="status" defaultValue={item.status}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Priority</span>
            <select className="input" name="priority" defaultValue={item.priority}>
              {PRIORITIES.map((p) => (
                <option key={p} value={p}>
                  {PRIORITY_LABEL[p]}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Effort</span>
            <select className="input" name="effort" defaultValue={item.effort ?? ''}>
              <option value="">Not estimated</option>
              {EFFORTS.map((e) => (
                <option key={e} value={e}>
                  {e.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Product</span>
            <select className="input" name="product_id" defaultValue={item.product_id ?? ''}>
              <option value="">No product yet</option>
              {ctx.products
                .filter((p) => !p.archived || p.id === item.product_id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {`${p.key}  ${p.name}`}
                  </option>
                ))}
            </select>
            <span className="field__hint">Changing the product clears the release.</span>
          </label>
          {product ? (
            <label className="field">
              <span className="field__label">Release</span>
              <select className="input" name="release_id" defaultValue={item.release_id ?? ''}>
                <option value="">No release</option>
                {releases.map((r) => (
                  <option key={r.id} value={r.id}>
                    {`${r.version}${r.status === 'released' ? ' (released)' : ''}`}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <input type="hidden" name="release_id" value="" />
          )}
          <label className="field">
            <span className="field__label">Assignee</span>
            <select className="input" name="assignee_id" defaultValue={item.assignee_id ?? ''}>
              <option value="">Unassigned</option>
              {ctx.members.map((m) => (
                <option key={m.user_id} value={m.user_id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span className="field__label">Source</span>
            <input className="input" name="source" defaultValue={item.source ?? ''} placeholder="Customer, support email, me" />
          </label>
        </div>
      </form>

      <section className="timeline-wrap" aria-labelledby="activity-heading">
        <h2 id="activity-heading">Activity</h2>
        <ol className="timeline">
          {events.map((event) => (
            <li key={event.id}>
              {event.kind === 'comment' ? (
                <>
                  <span>
                    <strong>{actorName(event.actor_id)}</strong> commented
                  </span>{' '}
                  <span className="when">{timeAgo(event.created_at)}</span>
                  <div className="comment">{event.body}</div>
                </>
              ) : (
                <>
                  <span>{describeEvent(event)}</span> <span className="when">by {actorName(event.actor_id)}, {timeAgo(event.created_at)}</span>
                </>
              )}
            </li>
          ))}
        </ol>

        <form action={addComment} className="stack">
          <input type="hidden" name="item_id" value={item.id} />
          <label className="field">
            <span className="field__label">Add a note</span>
            <textarea className="input" name="body" rows={3} required placeholder="Progress, decisions, links" />
          </label>
          <div>
            <button className="btn" type="submit">
              Add note
            </button>
          </div>
        </form>
      </section>

      <details className="danger">
        <summary>Delete this item</summary>
        <form action={deleteItem}>
          <input type="hidden" name="id" value={item.id} />
          <input type="hidden" name="space_slug" value={ctx.space.slug} />
          <p className="muted small">This removes the item, its notes and its history. It cannot be undone.</p>
          <button className="btn btn--danger" type="submit">
            Delete item
          </button>
        </form>
      </details>
    </>
  );
}
