'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { parseCapture } from '@/lib/parse-capture';
import {
  isEffort,
  isItemType,
  isPriority,
  isStatus,
  TYPE_LABEL,
  type CaptureResult,
} from '@/lib/types';

function text(value: FormDataEntryValue | null): string {
  return typeof value === 'string' ? value.trim() : '';
}

function optional(value: FormDataEntryValue | null): string | null {
  const s = text(value);
  return s === '' ? null : s;
}

function fail(message: string): never {
  throw new Error(message);
}

/** The page a form was submitted from. Only same-site paths are accepted. */
function returnPath(formData: FormData): string {
  const to = text(formData.get('return_to'));
  return to.startsWith('/') && !to.startsWith('//') ? to : '/';
}

/**
 * Sends the person back to the form with a message. Used for problems they can fix (a taken key,
 * a missing title), because errors thrown inside a server action are hidden in production builds.
 */
function back(formData: FormData, message: string): never {
  const path = returnPath(formData);
  redirect(`${path}${path.includes('?') ? '&' : '?'}error=${encodeURIComponent(message)}`);
}

function refresh(): void {
  revalidatePath('/', 'layout');
}

// ---------------------------------------------------------------------------
// Quick capture
// ---------------------------------------------------------------------------

export async function captureItem(
  raw: string,
  spaceSlug: string,
  contextProductKey: string | null,
): Promise<CaptureResult> {
  const supabase = await createClient();

  const { data: space } = await supabase.from('spaces').select('id').eq('slug', spaceSlug).maybeSingle();
  if (!space) return { ok: false, error: 'Space not found' };

  const { data: productData } = await supabase
    .from('products')
    .select('id, key')
    .eq('space_id', space.id)
    .eq('archived', false);
  const products = (Array.isArray(productData) ? productData : []) as { id: string; key: string }[];

  const parsed = parseCapture(raw, products.map((p) => p.key));
  if (!parsed.title) return { ok: false, error: 'Add a title first' };

  const wantedKey = (parsed.productKey ?? contextProductKey ?? '').toUpperCase();
  const product = wantedKey ? products.find((p) => p.key === wantedKey) ?? null : null;

  const { data, error } = await supabase
    .from('items')
    .insert({
      space_id: space.id,
      product_id: product ? product.id : null,
      type: parsed.type,
      title: parsed.title,
      description: parsed.description,
      priority: parsed.priority,
      effort: parsed.effort,
    })
    .select('id, number')
    .single();

  if (error || !data) return { ok: false, error: error?.message ?? 'Could not save that' };

  refresh();
  const label = product && data.number ? `${product.key}-${data.number}` : TYPE_LABEL[parsed.type];
  return { ok: true, id: data.id as string, label };
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

/** The "New item" form: the same fields as quick capture, chosen in the interface instead of typed. */
export async function createItem(formData: FormData): Promise<void> {
  const spaceSlug = text(formData.get('space_slug'));
  const title = text(formData.get('title'));
  const type = text(formData.get('type'));
  const priority = text(formData.get('priority')) || 'none';
  const effort = optional(formData.get('effort'));

  if (!title) back(formData, 'An item needs a title');
  if (!isItemType(type) || !isPriority(priority)) back(formData, 'Invalid type or priority');
  if (effort !== null && !isEffort(effort)) back(formData, 'Invalid effort');

  const supabase = await createClient();
  const { data: space } = await supabase.from('spaces').select('id').eq('slug', spaceSlug).maybeSingle();
  if (!space) fail('Space not found');

  const { data, error } = await supabase
    .from('items')
    .insert({
      space_id: space.id,
      product_id: optional(formData.get('product_id')),
      type,
      title,
      description: optional(formData.get('description')),
      priority,
      effort,
    })
    .select('id')
    .single();
  if (error || !data) back(formData, error?.message ?? 'Could not save that');

  refresh();
  redirect(`/s/${spaceSlug}/i/${data.id}`);
}

export async function updateItem(formData: FormData): Promise<void> {
  const id = text(formData.get('id'));
  const title = text(formData.get('title'));
  const type = text(formData.get('type'));
  const status = text(formData.get('status'));
  const priority = text(formData.get('priority'));
  const effort = optional(formData.get('effort'));

  if (!id) fail('Missing item');
  if (!title) back(formData, 'An item needs a title');
  if (!isItemType(type) || !isStatus(status) || !isPriority(priority)) back(formData, 'Invalid type, status or priority');
  if (effort !== null && !isEffort(effort)) back(formData, 'Invalid effort');

  const supabase = await createClient();
  const { data: current } = await supabase.from('items').select('product_id').eq('id', id).maybeSingle();
  if (!current) fail('Item not found');

  // A release belongs to one product, so changing the product clears the release.
  const productId = optional(formData.get('product_id'));
  const releaseId = productId === current.product_id ? optional(formData.get('release_id')) : null;

  const { error } = await supabase
    .from('items')
    .update({
      title,
      description: optional(formData.get('description')),
      type,
      status,
      priority,
      effort,
      product_id: productId,
      release_id: releaseId,
      assignee_id: optional(formData.get('assignee_id')),
      source: optional(formData.get('source')),
    })
    .eq('id', id);
  if (error) back(formData, error.message);
  refresh();
  redirect(returnPath(formData)); // clears any earlier error from the address
}

export async function setStatus(id: string, status: string): Promise<void> {
  if (!isStatus(status)) fail('Invalid status');
  const supabase = await createClient();
  const { error } = await supabase.from('items').update({ status }).eq('id', id);
  if (error) fail(error.message);
  refresh();
}

/** Turns an idea into a feature (or another type) in place, so its history and comments stay with it. */
export async function promoteItem(formData: FormData): Promise<void> {
  const id = text(formData.get('id'));
  const to = text(formData.get('to'));
  if (!id || !['feature', 'modification', 'task'].includes(to)) fail('Invalid promotion');

  const supabase = await createClient();
  const { data: current } = await supabase.from('items').select('status').eq('id', id).maybeSingle();
  if (!current) fail('Item not found');

  const { error } = await supabase
    .from('items')
    .update({ type: to, status: current.status === 'inbox' ? 'triaged' : current.status })
    .eq('id', id);
  if (error) fail(error.message);
  refresh();
}

export async function addComment(formData: FormData): Promise<void> {
  const itemId = text(formData.get('item_id'));
  const body = text(formData.get('body'));
  if (!itemId || !body) return;

  const supabase = await createClient();
  const { data: item } = await supabase.from('items').select('space_id').eq('id', itemId).maybeSingle();
  if (!item) fail('Item not found');

  const { error } = await supabase
    .from('item_events')
    .insert({ item_id: itemId, space_id: item.space_id, kind: 'comment', body });
  if (error) fail(error.message);
  refresh();
}

export async function deleteItem(formData: FormData): Promise<void> {
  const id = text(formData.get('id'));
  const spaceSlug = text(formData.get('space_slug'));
  if (!id) fail('Missing item');

  const supabase = await createClient();
  const { error } = await supabase.from('items').delete().eq('id', id);
  if (error) fail(error.message);
  refresh();
  redirect(`/s/${spaceSlug}`);
}

// ---------------------------------------------------------------------------
// Products
// ---------------------------------------------------------------------------

export async function createProduct(formData: FormData): Promise<void> {
  const spaceSlug = text(formData.get('space_slug'));
  const name = text(formData.get('name'));
  const key = text(formData.get('key')).toUpperCase();

  if (!name) back(formData, 'Give the product a name');
  if (!/^[A-Z][A-Z0-9]{1,7}$/.test(key)) back(formData, 'The key needs 2 to 8 letters or digits and must start with a letter');

  const supabase = await createClient();
  const { data: space } = await supabase.from('spaces').select('id').eq('slug', spaceSlug).maybeSingle();
  if (!space) fail('Space not found');

  const { error } = await supabase
    .from('products')
    .insert({ space_id: space.id, key, name, description: optional(formData.get('description')) });
  if (error) back(formData, error.code === '23505' ? `The key ${key} is already used in this space` : error.message);

  refresh();
  redirect(`/s/${spaceSlug}/p/${key}`);
}

// ---------------------------------------------------------------------------
// Releases
// ---------------------------------------------------------------------------

export async function createRelease(formData: FormData): Promise<void> {
  const productId = text(formData.get('product_id'));
  const version = text(formData.get('version'));
  if (!productId) fail('Missing product');
  if (!version) back(formData, 'A release needs a version');

  const supabase = await createClient();
  const { error } = await supabase.from('releases').insert({
    product_id: productId,
    version,
    title: optional(formData.get('title')),
    planned_for: optional(formData.get('planned_for')),
  });
  if (error) back(formData, error.code === '23505' ? `Version ${version} already exists for this product` : error.message);
  refresh();
  redirect(returnPath(formData));
}

/** Puts an item into a release. Items that were still waiting for triage become "planned". */
export async function assignToRelease(formData: FormData): Promise<void> {
  const itemId = text(formData.get('item_id'));
  const releaseId = text(formData.get('release_id'));
  if (!itemId || !releaseId) return;

  const supabase = await createClient();
  const { data: current } = await supabase.from('items').select('status').eq('id', itemId).maybeSingle();
  if (!current) fail('Item not found');

  const status = current.status === 'inbox' || current.status === 'triaged' ? 'planned' : current.status;
  const { error } = await supabase.from('items').update({ release_id: releaseId, status }).eq('id', itemId);
  if (error) fail(error.message);
  refresh();
}

export async function removeFromRelease(formData: FormData): Promise<void> {
  const itemId = text(formData.get('item_id'));
  if (!itemId) return;

  const supabase = await createClient();
  const { error } = await supabase.from('items').update({ release_id: null }).eq('id', itemId);
  if (error) fail(error.message);
  refresh();
}

/** Marks a release as shipped and closes every item in it that is still open. */
export async function markReleased(formData: FormData): Promise<void> {
  const releaseId = text(formData.get('release_id'));
  if (!releaseId) return;

  const supabase = await createClient();
  const { error } = await supabase
    .from('releases')
    .update({ status: 'released', released_at: new Date().toISOString() })
    .eq('id', releaseId);
  if (error) fail(error.message);

  const { error: itemsError } = await supabase
    .from('items')
    .update({ status: 'done' })
    .eq('release_id', releaseId)
    .in('status', ['inbox', 'triaged', 'planned', 'in_progress']);
  if (itemsError) fail(itemsError.message);
  refresh();
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
