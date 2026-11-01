import CaptureBar from '@/components/CaptureBar';
import Sidebar from '@/components/Sidebar';
import { getContext } from '@/lib/data';

export default async function SpaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ space: string }>;
}) {
  const { space: slug } = await params;
  const ctx = await getContext(slug);

  const { count } = await ctx.supabase
    .from('items')
    .select('id', { count: 'exact', head: true })
    .eq('space_id', ctx.space.id)
    .eq('status', 'inbox');

  return (
    <div className="shell">
      <Sidebar
        spaces={ctx.spaces}
        space={ctx.space}
        products={ctx.products}
        inboxCount={count ?? 0}
        email={ctx.user.email ?? ''}
      />
      <div className="main">
        <CaptureBar
          spaceSlug={ctx.space.slug}
          productKeys={ctx.products.filter((p) => !p.archived).map((p) => p.key)}
        />
        <div className="content">{children}</div>
      </div>
    </div>
  );
}
