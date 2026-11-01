'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { usePathname } from 'next/navigation';
import { captureItem } from '@/lib/actions';
import { parseCapture } from '@/lib/parse-capture';
import { PRIORITY_LABEL, TYPE_LABEL } from '@/lib/types';

export default function CaptureBar({ spaceSlug, productKeys }: { spaceSlug: string; productKeys: string[] }) {
  const [value, setValue] = useState('');
  const [note, setNote] = useState<{ ok: boolean; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();

  // On a product page, new captures go to that product unless the text says otherwise.
  const fromPath = pathname.match(/\/p\/([^/]+)/)?.[1]?.toUpperCase() ?? null;
  const contextKey = fromPath && productKeys.includes(fromPath) ? fromPath : null;

  // "c" (or Ctrl/Cmd+K) focuses the bar from anywhere.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const el = event.target as HTMLElement | null;
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      const shortcut = (event.key === 'c' && !typing && !event.metaKey && !event.ctrlKey && !event.altKey) ||
        (event.key === 'k' && (event.metaKey || event.ctrlKey));
      if (shortcut) {
        event.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  useEffect(() => {
    if (!note) return;
    const timer = setTimeout(() => setNote(null), 4000);
    return () => clearTimeout(timer);
  }, [note]);

  function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const raw = value;
    if (!raw.trim() || pending) return;
    setValue('');
    startTransition(async () => {
      const result = await captureItem(raw, spaceSlug, contextKey);
      if (result.ok) {
        setNote({ ok: true, message: `Saved ${result.label}` });
      } else {
        setValue(raw);
        setNote({ ok: false, message: result.error });
      }
    });
  }

  const parsed = value.trim() ? parseCapture(value, productKeys) : null;
  const target = parsed ? (parsed.productKey ?? contextKey) : null;

  return (
    <div className="capture">
      <div className="capture__inner">
        <form className="capture__form" onSubmit={submit}>
          <span className="capture__prompt" aria-hidden="true">
            +
          </span>
          <input
            ref={inputRef}
            className="capture__input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Capture anything and press Enter"
            aria-label="Quick capture"
            autoComplete="off"
            enterKeyHint="send"
          />
          <kbd className="capture__hint" aria-hidden="true">
            c
          </kbd>
        </form>

        <div className="capture__meta" aria-live="polite">
          {note ? (
            <span className={note.ok ? 'capture__note' : 'capture__note capture__note--error'}>{note.message}</span>
          ) : parsed ? (
            <>
              <span className="chip" data-type={parsed.type}>
                <span className="mark" data-type={parsed.type} aria-hidden="true" />
                {TYPE_LABEL[parsed.type]}
              </span>
              <span className="chip">{target ?? 'No product yet'}</span>
              {parsed.priority !== 'none' ? <span className="chip">{PRIORITY_LABEL[parsed.priority]}</span> : null}
              {parsed.effort ? <span className="chip">Effort {parsed.effort.toUpperCase()}</span> : null}
              {parsed.description ? <span className="chip">With notes</span> : null}
            </>
          ) : (
            <span>
              Try <code>bug: login fails on Safari #{productKeys[0] ?? 'KEY'} !high</code>. Add notes after <code>//</code>.
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
