'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useRef, useTransition } from 'react';

/**
 * The filter and sort controls for a list. Any change rebuilds the address from the form, leaving out
 * empty values, so a list's filters live in its URL. Changing the sort field resets the direction to that field's default.
 * When the address changes some other way (a column header, Clear, back), the controls follow it.
 */
export default function FilterForm({
  path,
  defaultDirs,
  children,
}: {
  path: string;
  defaultDirs: Record<string, string>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const sort = searchParams.get('sort') ?? 'created';
    for (const element of Array.from(form.elements)) {
      if (!(element instanceof HTMLInputElement || element instanceof HTMLSelectElement) || !element.name) continue;
      if (element === document.activeElement) continue;
      const wanted =
        element.name === 'sort' ? sort : element.name === 'dir' ? (searchParams.get('dir') ?? defaultDirs[sort] ?? 'desc') : (searchParams.get(element.name) ?? '');
      if (element.value !== wanted) element.value = wanted;
    }
  }, [searchParams, defaultDirs]);

  function go() {
    const form = ref.current;
    if (!form) return;
    const params = new URLSearchParams();
    for (const [name, value] of new FormData(form)) {
      if (typeof value === 'string' && value !== '') params.set(name, value);
    }
    // Leave out the default sort, so an untouched list keeps a clean address.
    if (params.get('sort') === 'created') params.delete('sort');
    if (params.get('dir') === (defaultDirs[params.get('sort') ?? 'created'] ?? 'desc')) params.delete('dir');
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${path}?${qs}` : path));
  }

  return (
    <form
      ref={ref}
      className="toolbar"
      role="search"
      aria-busy={pending}
      onSubmit={(event) => {
        event.preventDefault();
        go();
      }}
      onChange={(event) => {
        const target = event.target as unknown as HTMLInputElement | HTMLSelectElement;
        if (target.type === 'search') return; // the search box submits on Enter
        if (target.name === 'sort') {
          const dir = ref.current?.elements.namedItem('dir') as HTMLSelectElement | null;
          if (dir) dir.value = defaultDirs[target.value] ?? 'desc';
        }
        go();
      }}
    >
      {children}
    </form>
  );
}
