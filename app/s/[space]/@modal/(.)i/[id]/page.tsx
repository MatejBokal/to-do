import ItemDetail from '@/components/ItemDetail';
import ItemDialog from '@/components/ItemDialog';

export default async function ItemModal({
  params,
  searchParams,
}: {
  params: Promise<{ space: string; id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space, id } = await params;
  const query = await searchParams;
  const error = Array.isArray(query.error) ? query.error[0] : query.error;
  return (
    <ItemDialog>
      <ItemDetail slug={space} id={id} error={error} />
    </ItemDialog>
  );
}
