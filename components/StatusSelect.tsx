'use client';

import { useTransition } from 'react';
import { setStatus } from '@/lib/actions';
import { STATUSES, STATUS_LABEL, type Status } from '@/lib/types';

export default function StatusSelect({ id, status }: { id: string; status: Status }) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      className="input select--inline"
      defaultValue={status}
      disabled={pending}
      aria-label="Status"
      onChange={(event) => {
        const next = event.target.value;
        startTransition(async () => {
          await setStatus(id, next);
        });
      }}
    >
      {STATUSES.map((s) => (
        <option key={s} value={s}>
          {STATUS_LABEL[s]}
        </option>
      ))}
    </select>
  );
}
