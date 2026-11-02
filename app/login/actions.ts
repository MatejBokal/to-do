'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signInWithPassword(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  const password = String(formData.get('password') ?? '');
  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Enter your email address and password'));
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    redirect('/login?error=' + encodeURIComponent('Wrong email or password'));
  }
  redirect('/');
}

export async function signInWithEmail(formData: FormData): Promise<void> {
  const email = String(formData.get('email') ?? '').trim();
  if (!email) {
    redirect('/login?error=' + encodeURIComponent('Enter your email address'));
  }

  const requestHeaders = await headers();
  const origin = process.env.NEXT_PUBLIC_SITE_URL ?? requestHeaders.get('origin') ?? '';

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    // Accounts are created by hand in the Supabase dashboard; the sign-in form never makes one.
    options: { emailRedirectTo: `${origin}/auth/confirm`, shouldCreateUser: false },
  });

  if (error) {
    const message = error.code === 'otp_disabled' ? 'No account for that email. Accounts are added by the owner.' : error.message;
    redirect('/login?error=' + encodeURIComponent(message));
  }
  redirect('/login?sent=1');
}
