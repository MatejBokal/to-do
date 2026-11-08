import { EFFORTS, type Effort } from '@/lib/types';

/** Effort label followed by five level bars, filled up to the size. Ink only, so colour keeps its meaning. */
export default function EffortMark({ effort }: { effort: Effort }) {
  const level = EFFORTS.indexOf(effort) + 1;
  return (
    <span className="effort" title={`Effort ${effort.toUpperCase()}`}>
      {effort.toUpperCase()}
      <span className="bars" role="img" aria-label={`${level} of ${EFFORTS.length}`}>
        {EFFORTS.map((e, i) => (
          <span key={e} className="bars__bar" data-on={i < level ? 'true' : undefined} />
        ))}
      </span>
    </span>
  );
}
