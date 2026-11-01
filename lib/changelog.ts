import { formatDate } from '@/lib/format';
import type { Item, ItemType, Release } from '@/lib/types';

const SECTIONS: { heading: string; types: ItemType[] }[] = [
  { heading: 'New', types: ['feature'] },
  { heading: 'Changed', types: ['modification'] },
  { heading: 'Fixed', types: ['bug'] },
  { heading: 'Other', types: ['task', 'idea'] },
];

/** Markdown release notes for one release. `keyOf` returns an item's key such as "ACME-12", or null. */
export function buildChangelog(release: Release, items: Item[], keyOf: (item: Item) => string | null): string {
  const date = release.released_at ? formatDate(release.released_at) : release.planned_for ? formatDate(release.planned_for) : '';
  let heading = `## ${release.version}`;
  if (release.title) heading += ` – ${release.title}`;
  if (date) heading += ` (${date})`;

  const lines: string[] = [heading, ''];
  for (const section of SECTIONS) {
    const inSection = items.filter((item) => section.types.includes(item.type));
    if (inSection.length === 0) continue;
    lines.push(`### ${section.heading}`);
    for (const item of inSection) {
      const key = keyOf(item);
      lines.push(`- ${item.title}${key ? ` (${key})` : ''}`);
    }
    lines.push('');
  }
  if (items.length === 0) lines.push('_No items yet._', '');
  return lines.join('\n').trimEnd() + '\n';
}
