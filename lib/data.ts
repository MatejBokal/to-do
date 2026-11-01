import { cache } from 'react';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Member, Product, Space } from '@/lib/types';

/** Supabase returns loosely typed rows here, so every query result goes through this to get a real type. */
export function rows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

/**
 * Everything a page inside a space needs: who is signed in, which spaces they have,
 * the current space, its products and its members. Cached per request, so the layout
 * and the page share one set of queries.
 */
export const getContext = cache(async (slug: string) => {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;
  if (!user) redirect('/login');

  let spaces = rows<Space>((await supabase.from('spaces').select('id, name, slug, kind').order('created_at')).data);
  if (spaces.length === 0) {
    // First sign-in: create the Work and Personal spaces.
    await supabase.rpc('ensure_default_spaces');
    spaces = rows<Space>((await supabase.from('spaces').select('id, name, slug, kind').order('created_at')).data);
  }

  const space = spaces.find((s) => s.slug === slug);
  if (!space) notFound();

  const products = rows<Product>(
    (await supabase.from('products').select('*').eq('space_id', space.id).order('name')).data,
  );

  const memberRows = rows<{ user_id: string; role: string }>(
    (await supabase.from('space_members').select('user_id, role').eq('space_id', space.id)).data,
  );
  const profiles =
    memberRows.length > 0
      ? rows<{ id: string; email: string | null; display_name: string | null }>(
          (
            await supabase
              .from('profiles')
              .select('id, email, display_name')
              .in(
                'id',
                memberRows.map((m) => m.user_id),
              )
          ).data,
        )
      : [];
  const members: Member[] = memberRows.map((m) => {
    const profile = profiles.find((p) => p.id === m.user_id);
    return { user_id: m.user_id, role: m.role, name: profile?.display_name || profile?.email || 'Unknown' };
  });

  return { supabase, user, spaces, space, products, members };
});
