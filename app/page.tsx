import { redirect } from 'next/navigation';
import { signOut } from '@/lib/actions';
import { createClient } from '@/lib/supabase/server';
import { rows } from '@/lib/data';
import type { Space } from '@/lib/types';

// The home route only decides where to land: your first space (Work), created on the very first sign-in.
export default async function Home() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect('/login');

  let spaces = rows<Space>((await supabase.from('spaces').select('id, name, slug, kind').order('created_at')).data);
  if (spaces.length === 0) {
    await supabase.rpc('ensure_default_spaces');
    spaces = rows<Space>((await supabase.from('spaces').select('id, name, slug, kind').order('created_at')).data);
  }
  if (spaces.length > 0) redirect(`/s/${spaces[0].slug}`);

  // Signed in, but not a member of any space yet (for example a coworker who has not been added).
  return (
    <main className="login">
      <div className="login__card">
        <h1>No spaces yet</h1>
        <p className="muted">
          You are signed in as {auth.user.email}, but you have not been added to a space. Ask the owner to add you, then
          reload this page.
        </p>
        <form action={signOut}>
          <button className="btn" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
