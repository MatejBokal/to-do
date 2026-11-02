import { createItem } from '@/lib/actions';
import { getContext } from '@/lib/data';
import TypeMark from '@/components/TypeMark';
import { EFFORTS, ITEM_TYPES, PRIORITIES, PRIORITY_LABEL, TYPE_LABEL } from '@/lib/types';

export const metadata = { title: 'New item' };

export default async function NewItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space } = await params;
  const query = await searchParams;
  const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const error = first(query.error);
  const ctx = await getContext(space);
  const products = ctx.products.filter((p) => !p.archived);
  const wanted = (first(query.product) ?? '').toUpperCase();
  const preselected = products.find((p) => p.key === wanted)?.id ?? '';

  return (
    <>
      <header className="page-head">
        <div>
          <h1>New item</h1>
          <p className="muted">Only the title is required. Leave the product empty to put it in the Inbox.</p>
        </div>
      </header>

      {error ? (
        <p className="notice notice--error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      <form action={createItem} className="card stack" style={{ maxWidth: 520 }}>
        <input type="hidden" name="space_slug" value={space} />
        <input type="hidden" name="return_to" value={`/s/${space}/new`} />
        <label className="field">
          <span className="field__label">Title</span>
          <input className="input" name="title" required autoFocus placeholder="What is it?" />
        </label>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend className="field__label">Type</legend>
          <div className="chips">
            {ITEM_TYPES.map((t) => (
              <label key={t} className="chip chip--pick">
                <input type="radio" name="type" value={t} defaultChecked={t === 'idea'} />
                <TypeMark type={t} />
                {TYPE_LABEL[t]}
              </label>
            ))}
          </div>
        </fieldset>
        <label className="field">
          <span className="field__label">Product</span>
          <select className="input" name="product_id" defaultValue={preselected}>
            <option value="">No product yet (Inbox)</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.key} {p.name}
              </option>
            ))}
          </select>
        </label>
        <details>
          <summary className="muted">More</summary>
          <div className="stack" style={{ marginTop: 12 }}>
            <label className="field">
              <span className="field__label">Priority</span>
              <select className="input" name="priority" defaultValue="none">
                {PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {p === 'none' ? 'No priority' : PRIORITY_LABEL[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Effort</span>
              <select className="input" name="effort" defaultValue="">
                <option value="">Not estimated</option>
                {EFFORTS.map((e) => (
                  <option key={e} value={e}>
                    {e.toUpperCase()}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span className="field__label">Description</span>
              <textarea className="input" name="description" rows={3} placeholder="What happened, what you expected, links, notes" />
            </label>
          </div>
        </details>
        <div>
          <button className="btn btn--primary" type="submit">
            Create item
          </button>
        </div>
      </form>
    </>
  );
}
