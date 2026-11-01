'use client';

export default function SpaceError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="stack" role="alert" style={{ paddingTop: 24 }}>
      <h1>Something went wrong</h1>
      <p className="notice notice--error">{error.message}</p>
      <div>
        <button className="btn" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  );
}
