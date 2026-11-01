import { TYPE_LABEL, type ItemType } from '@/lib/types';

/** Small shape in the type's colour. Shape and label carry the meaning too, so it never relies on colour alone. */
export default function TypeMark({ type }: { type: ItemType }) {
  return <span className="mark" data-type={type} role="img" aria-label={TYPE_LABEL[type]} title={TYPE_LABEL[type]} />;
}
