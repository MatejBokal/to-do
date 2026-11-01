import ItemsView from '@/components/ItemsView';

export const metadata = { title: 'All items' };

export default async function AllItemsPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space } = await params;
  const filters = await searchParams;
  return <ItemsView slug={space} filters={filters} mode="all" />;
}
