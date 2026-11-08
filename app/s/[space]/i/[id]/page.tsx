import ItemDetail from '@/components/ItemDetail';

export default async function ItemPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space, id } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  return <ItemDetail slug={space} id={id} error={error} />;
}
