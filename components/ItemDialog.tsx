'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

/** Shows an item over the list. Closing goes back, so the list underneath stays where it was. */
export default function ItemDialog({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      className="item-dialog"
      aria-label="Item"
      onClose={() => router.back()}
      onClick={(event) => {
        // A click on the backdrop lands on the dialog element itself, not on its content.
        if (event.target === ref.current) ref.current?.close();
      }}
    >
      <button className="btn btn--ghost item-dialog__close" type="button" onClick={() => ref.current?.close()}>
        Close
      </button>
      {children}
    </dialog>
  );
}
