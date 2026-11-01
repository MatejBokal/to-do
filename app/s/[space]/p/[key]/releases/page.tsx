import Link from 'next/link';
import { notFound } from 'next/navigation';
import CopyButton from '@/components/CopyButton';
import TypeMark from '@/components/TypeMark';
import { assignToRelease, createRelease, markReleased, removeFromRelease } from '@/lib/actions';
import { buildChangelog } from '@/lib/changelog';
import { getContext, rows } from '@/lib/data';
import { formatDate } from '@/lib/format';
import { OPEN_STATUSES, STATUS_LABEL, itemKey, type Item, type Release } from '@/lib/types';

export const metadata = { title: 'Releases' };

function sortReleases(list: Release[]): Release[] {
  const planned = list
    .filter((r) => r.status === 'planned')
    .sort((a, b) => (a.planned_for ?? '9999-12-31').localeCompare(b.planned_for ?? '9999-12-31') || a.created_at.localeCompare(b.created_at));
  const released = list
    .filter((r) => r.status === 'released')
    .sort((a, b) => (b.released_at ?? '').localeCompare(a.released_at ?? ''));
  return [...planned, ...released];
}

export default async function ReleasesPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string; key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space: slug, key } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;

  const ctx = await getContext(slug);
  const base = `/s/${ctx.space.slug}`;
  const product = ctx.products.find((p) => p.key === key.toUpperCase());
  if (!product) notFound();

  const releases = sortReleases(
    rows<Release>((await ctx.supabase.from('releases').select('*').eq('product_id', product.id)).data),
  );
  const items = rows<Item>(
    (await ctx.supabase.from('items').select('*').eq('product_id', product.id).order('number', { ascending: true }).limit(2000)).data,
  );

  // Ideas are not shippable until they are promoted, so they are not offered here.
  const candidates = items.filter((i) => !i.release_id && i.type !== 'idea' && OPEN_STATUSES.includes(i.status));
  const keyOf = (item: Item) => itemKey(item, ctx.products);
  const returnTo = `${base}/p/${product.key}/releases`;

  return (
    <>
      <header className="page-head">
        <div>
          <h1>
            <span className="key key--lg">{product.key}</span>
            {product.name}
          </h1>
          {product.description ? <p className="muted">{product.description}</p> : null}
        </div>
        <nav className="tabs" aria-label="Product views">
          <Link href={`${base}/p/${product.key}`}>Items</Link>
          <Link href={`${base}/p/${product.key}/releases`} aria-current="page">
            Releases
          </Link>
        </nav>
      </header>

      {error ? (
        <p className="notice notice--error" role="alert" style={{ marginBottom: 14 }}>
          {error}
        </p>
      ) : null}

      <form action={createRelease} className="card form-row">
        <input type="hidden" name="product_id" value={product.id} />
        <input type="hidden" name="return_to" value={returnTo} />
        <label className="field">
          <span className="field__label">Version</span>
          <input className="input input--mono" name="version" required placeholder="1.0.0" />
        </label>
        <label className="field">
          <span className="field__label">Name</span>
          <input className="input" name="title" placeholder="Optional" />
        </label>
        <label className="field">
          <span className="field__label">Planned for</span>
          <input className="input" type="date" name="planned_for" />
        </label>
        <button className="btn btn--primary" type="submit">
          Add release
        </button>
      </form>

      {releases.length === 0 ? (
        <div className="empty" style={{ marginTop: 22 }}>
          No releases yet. Add the next version above, then plan items into it from here or from an item&rsquo;s page.
        </div>
      ) : null}

      {releases.map((release) => {
        const inRelease = items.filter((i) => i.release_id === release.id);
        const openCount = inRelease.filter((i) => OPEN_STATUSES.includes(i.status)).length;
        const changelog = buildChangelog(release, inRelease, keyOf);
        const planned = release.status === 'planned';

        return (
          <section className="release" key={release.id} aria-label={`Release ${release.version}`}>
            <div className="release__head">
              <h2>
                <span className="key">{release.version}</span>
                {release.title ? <span>{release.title}</span> : null}
              </h2>
              <span className="badge" data-status={release.status}>
                {planned
                  ? release.planned_for
                    ? `Planned for ${formatDate(release.planned_for)}`
                    : 'Planned'
                  : `Released ${formatDate(release.released_at)}`}
              </span>
            </div>

            <div className="release__body">
              {inRelease.length === 0 ? (
                <p className="release__none">Nothing in this release yet.</p>
              ) : (
                <ul className="list" style={{ border: 0, borderRadius: 0 }}>
                  {inRelease.map((item) => (
                    <li className="row" key={item.id}>
                      <TypeMark type={item.type} />
                      <div className="row__main">
                        <Link href={`${base}/i/${item.id}`} className="row__title">
                          {item.title}
                        </Link>
                        <div className="row__meta">
                          <span className="key">{keyOf(item)}</span>
                          <span>{STATUS_LABEL[item.status]}</span>
                        </div>
                      </div>
                      {planned ? (
                        <form action={removeFromRelease}>
                          <input type="hidden" name="item_id" value={item.id} />
                          <button className="btn btn--ghost" type="submit" aria-label={`Remove ${item.title} from ${release.version}`}>
                            Remove
                          </button>
                        </form>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="release__foot">
              {planned && candidates.length > 0 ? (
                <form action={assignToRelease} className="inline-form">
                  <input type="hidden" name="release_id" value={release.id} />
                  <select className="input" name="item_id" aria-label={`Add an item to ${release.version}`}>
                    {candidates.map((c) => (
                      <option key={c.id} value={c.id}>
                        {`${keyOf(c) ?? ''} ${c.title}`.trim()}
                      </option>
                    ))}
                  </select>
                  <button className="btn" type="submit">
                    {`Add to ${release.version}`}
                  </button>
                </form>
              ) : (
                <span className="muted small">
                  {planned ? 'No unplanned features, bugs or modifications to add.' : 'This release has shipped.'}
                </span>
              )}

              <div className="inline-form">
                <CopyButton text={changelog} />
                {planned ? (
                  <form action={markReleased}>
                    <input type="hidden" name="release_id" value={release.id} />
                    <button className="btn btn--primary" type="submit" title={`Marks ${openCount} open item${openCount === 1 ? '' : 's'} as done`}>
                      Mark released
                    </button>
                  </form>
                ) : null}
              </div>
            </div>
          </section>
        );
      })}
    </>
  );
}
