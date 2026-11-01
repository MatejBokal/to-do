import ItemsView from '@/components/ItemsView';

export default async function ProductPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string; key: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space, key } = await params;
  const filters = await searchParams;
  return <ItemsView slug={space} filters={filters} mode="product" productKey={key} />;
}
