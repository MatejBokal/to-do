import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="login">
      <div className="login__card">
        <h1>Not found</h1>
        <p className="muted">That page or item does not exist, or it is in a space you do not have access to.</p>
        <Link className="btn" href="/">
          Back to Shiplog
        </Link>
      </div>
    </main>
  );
}
