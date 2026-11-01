import ItemsView from '@/components/ItemsView';

export const metadata = { title: 'Inbox' };

export default async function InboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ space: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { space } = await params;
  const filters = await searchParams;
  return <ItemsView slug={space} filters={filters} mode="inbox" />;
}
