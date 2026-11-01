import { createProduct } from '@/lib/actions';

export const metadata = { title: 'New product' };

export default async function NewProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>New product</h1>
          <p className="muted">
            The key is the short prefix on every item, like <span className="key">ACME-12</span>. You can type it into the
            capture bar as <span className="key">#ACME</span>.
          </p>
        </div>
      </header>

      {error ? (
        <p className="notice notice--error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      <form action={createProduct} className="card stack" style={{ maxWidth: 520 }}>
        <input type="hidden" name="space_slug" value={space} />
        <input type="hidden" name="return_to" value={`/s/${space}/new-product`} />
        <label className="field">
          <span className="field__label">Name</span>
          <input className="input" name="name" required placeholder="Acme app" autoFocus />
        </label>
        <label className="field">
          <span className="field__label">Key</span>
          <input
            className="input input--mono input--upper"
            name="key"
            required
            minLength={2}
            maxLength={8}
            pattern="[A-Za-z][A-Za-z0-9]{1,7}"
            placeholder="ACME"
          />
          <span className="field__hint">2 to 8 letters or digits, starting with a letter. Unique within this space.</span>
        </label>
        <label className="field">
          <span className="field__label">Description</span>
          <textarea className="input" name="description" rows={3} placeholder="Optional" />
        </label>
        <div>
          <button className="btn btn--primary" type="submit">
            Create product
          </button>
        </div>
      </form>
    </>
  );
}
