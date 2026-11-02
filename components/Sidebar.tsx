import Link from 'next/link';
import NavLink from '@/components/NavLink';
import { signOut } from '@/lib/actions';
import type { Product, Space } from '@/lib/types';

export default function Sidebar({
  spaces,
  space,
  products,
  inboxCount,
  email,
}: {
  spaces: Space[];
  space: Space;
  products: Product[];
  inboxCount: number;
  email: string;
}) {
  const base = `/s/${space.slug}`;

  return (
    <aside className="sidebar">
      <div className="brand">Shiplog</div>

      <nav className="spaces" aria-label="Spaces">
        {spaces.map((s) => (
          <Link key={s.id} href={`/s/${s.slug}`} className="space-tab" aria-current={s.id === space.id ? 'true' : undefined}>
            {s.name}
          </Link>
        ))}
      </nav>

      <Link href={`${base}/new`} className="btn">
        New item
      </Link>

      <nav className="nav" aria-label="Views">
        <NavLink href={base} exact>
          Inbox
          {inboxCount > 0 ? <span className="count">{inboxCount}</span> : null}
        </NavLink>
        <NavLink href={`${base}/all`}>All items</NavLink>
      </nav>

      <div className="nav">
        <div className="nav-heading">Products</div>
        {products
          .filter((p) => !p.archived)
          .map((p) => (
            <NavLink key={p.id} href={`${base}/p/${p.key}`}>
              <span className="key">{p.key}</span>
              {p.name}
            </NavLink>
          ))}
        <NavLink href={`${base}/new-product`}>New product</NavLink>
      </div>

      <form action={signOut} className="signout">
        <span className="small muted" title={email}>
          {email}
        </span>
        <button className="btn btn--ghost" type="submit">
          Sign out
        </button>
      </form>
    </aside>
  );
}
