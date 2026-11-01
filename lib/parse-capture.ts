import { isEffort, type Effort, type ItemType, type Priority } from '@/lib/types';

export interface ParsedCapture {
  type: ItemType;
  productKey: string | null;
  priority: Priority;
  effort: Effort | null;
  title: string;
  description: string | null;
}

const TYPE_ALIASES: Record<string, ItemType> = {
  bug: 'bug',
  fix: 'bug',
  feature: 'feature',
  feat: 'feature',
  idea: 'idea',
  mod: 'modification',
  modification: 'modification',
  change: 'modification',
  task: 'task',
  todo: 'task',
  chore: 'task',
};

const PRIORITY_ALIASES: Record<string, Priority> = {
  urgent: 'urgent',
  u: 'urgent',
  high: 'high',
  h: 'high',
  med: 'medium',
  medium: 'medium',
  m: 'medium',
  low: 'low',
  l: 'low',
};

/**
 * Turns one line of text into a structured item.
 *
 *   bug: login fails on Safari #ACME !high ~m // happens after password reset
 *
 *   "bug:" / "idea:" / "feature:" / "mod:" / "task:"  -> type (default: idea)
 *   "#ACME"                                           -> product key (only if it matches a real product)
 *   "!urgent" "!high" "!med" "!low"                   -> priority
 *   "~xs" "~s" "~m" "~l" "~xl"                        -> effort
 *   "// text"                                         -> description
 */
export function parseCapture(raw: string, productKeys: string[]): ParsedCapture {
  let text = raw.trim();
  let description: string | null = null;

  const split = text.indexOf(' // ');
  if (split !== -1) {
    description = text.slice(split + 4).trim() || null;
    text = text.slice(0, split).trim();
  }

  let type: ItemType = 'idea';
  const prefix = text.match(/^([a-z]+)\s*:\s*/i);
  if (prefix) {
    const found = TYPE_ALIASES[prefix[1].toLowerCase()];
    if (found) {
      type = found;
      text = text.slice(prefix[0].length);
    }
  }

  const keys = productKeys.map((k) => k.toUpperCase());
  let productKey: string | null = null;
  let priority: Priority = 'none';
  let effort: Effort | null = null;
  const kept: string[] = [];

  for (const token of text.split(/\s+/)) {
    if (token.startsWith('#') && keys.includes(token.slice(1).toUpperCase())) {
      productKey = token.slice(1).toUpperCase();
    } else if (token.startsWith('!') && PRIORITY_ALIASES[token.slice(1).toLowerCase()]) {
      priority = PRIORITY_ALIASES[token.slice(1).toLowerCase()];
    } else if (token.startsWith('~') && isEffort(token.slice(1).toLowerCase())) {
      effort = token.slice(1).toLowerCase() as Effort;
    } else if (token !== '') {
      kept.push(token);
    }
  }

  return { type, productKey, priority, effort, title: kept.join(' '), description };
}
