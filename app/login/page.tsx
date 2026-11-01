import { signInWithEmail } from './actions';

type SearchParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

export default async function LoginPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const sent = first(params.sent) === '1';
  const error = first(params.error);

  return (
    <main className="login">
      <div className="login__card">
        <h1>Shiplog</h1>
        <p className="muted">Bugs, features, ideas and releases for your products.</p>

        {sent ? (
          <p className="notice" role="status">
            Check your inbox. The sign-in link is on its way.
          </p>
        ) : (
          <form action={signInWithEmail} className="stack">
            <label className="field">
              <span className="field__label">Email</span>
              <input className="input" type="email" name="email" required autoComplete="email" autoFocus />
            </label>
            <button className="btn btn--primary" type="submit">
              Email me a sign-in link
            </button>
          </form>
        )}

        {error ? (
          <p className="notice notice--error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </main>
  );
}
