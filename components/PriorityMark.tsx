import { PRIORITY_LABEL, type Priority } from '@/lib/types';

/**
 * Flag next to a priority label. Low is an outline, Medium is filled in ink, High and Urgent are filled
 * in the priority accent. Priority is the only other thing allowed colour, and it never reuses a type colour.
 */
export default function PriorityMark({ priority }: { priority: Priority }) {
  if (priority === 'none') return null;
  return (
    <svg
      className="flag"
      data-priority={priority}
      viewBox="0 0 12 12"
      width="12"
      height="12"
      role="img"
      aria-label={PRIORITY_LABEL[priority]}
    >
      <path d="M2.5 1v10" strokeLinecap="round" />
      <path d="M2.5 1.5h7l-1.8 2.6 1.8 2.6h-7z" strokeLinejoin="round" />
    </svg>
  );
}
