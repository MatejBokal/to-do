-- Shiplog schema
-- Run this once in the Supabase SQL editor (or with `supabase db push`).
-- Requires Postgres 15+ (every current Supabase project has it).
--
-- Model:  Space (Work / Personal)  ->  Product  ->  Item (bug, feature, idea, modification, task)
--                                       Product  ->  Release (version)  <-  Item.release_id
-- Access is by space membership, so adding a coworker later is one row in space_members.

-- ---------------------------------------------------------------------------
-- Profiles (one per auth user, filled automatically at sign-up)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text,
  display_name text,
  created_at   timestamptz not null default now()
);

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name)
  values (new.id, new.email, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Users that already exist in this Supabase project
insert into public.profiles (id, email, display_name)
select u.id, u.email, split_part(u.email, '@', 1) from auth.users u
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- Spaces and membership
-- ---------------------------------------------------------------------------
create table public.spaces (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  slug       text not null check (slug ~ '^[a-z0-9][a-z0-9-]*$'),
  kind       text not null default 'work' check (kind in ('work', 'personal')),
  owner_id   uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (owner_id, slug)
);

create table public.space_members (
  space_id   uuid not null references public.spaces (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'admin', 'member')),
  created_at timestamptz not null default now(),
  primary key (space_id, user_id)
);
create index space_members_user_idx on public.space_members (user_id);

create function public.is_space_member(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id and m.user_id = (select auth.uid())
  );
$$;

create function public.is_space_admin(p_space_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.space_members m
    where m.space_id = p_space_id and m.user_id = (select auth.uid()) and m.role in ('owner', 'admin')
  );
$$;

create function public.add_space_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.space_members (space_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict do nothing;
  return new;
end;
$$;

create trigger spaces_add_owner
  after insert on public.spaces
  for each row execute function public.add_space_owner();

-- Called by the app on sign-in. Creates the Work and Personal spaces for the very first user only.
-- Anyone who signs in later (a coworker) starts with no spaces until the owner adds them to one.
create function public.ensure_default_spaces()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
begin
  if uid is null then
    raise exception 'Not authenticated';
  end if;
  if exists (select 1 from public.spaces) then
    return;
  end if;
  insert into public.profiles (id, email, display_name)
  select u.id, u.email, split_part(u.email, '@', 1) from auth.users u where u.id = uid
  on conflict (id) do nothing;
  insert into public.spaces (name, slug, kind, owner_id)
  values ('Work', 'work', 'work', uid), ('Personal', 'personal', 'personal', uid);
end;
$$;

revoke all on function public.is_space_member(uuid)   from public, anon;
revoke all on function public.is_space_admin(uuid)    from public, anon;
revoke all on function public.ensure_default_spaces() from public, anon;
grant execute on function public.is_space_member(uuid)   to authenticated;
grant execute on function public.is_space_admin(uuid)    to authenticated;
grant execute on function public.ensure_default_spaces() to authenticated;

-- ---------------------------------------------------------------------------
-- Products and releases
-- ---------------------------------------------------------------------------
create table public.products (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces (id) on delete cascade,
  key          text not null check (key ~ '^[A-Z][A-Z0-9]{1,7}$'),
  name         text not null check (length(btrim(name)) > 0),
  description  text,
  archived     boolean not null default false,
  item_counter integer not null default 0,
  created_at   timestamptz not null default now(),
  unique (space_id, key)
);

create table public.releases (
  id          uuid primary key default gen_random_uuid(),
  space_id    uuid not null references public.spaces (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete cascade,
  version     text not null check (length(btrim(version)) > 0),
  title       text,
  status      text not null default 'planned' check (status in ('planned', 'released')),
  planned_for date,
  released_at timestamptz,
  notes       text,
  created_at  timestamptz not null default now(),
  unique (product_id, version),
  unique (product_id, id)
);

-- Keeps space_id in step with the product, so access checks stay simple.
create function public.releases_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid;
begin
  select p.space_id into v_space from public.products p where p.id = new.product_id;
  if v_space is null then
    raise exception 'Unknown product';
  end if;
  new.space_id := v_space;
  return new;
end;
$$;

create trigger releases_a_before_write
  before insert or update on public.releases
  for each row execute function public.releases_before_write();

-- ---------------------------------------------------------------------------
-- Items
-- ---------------------------------------------------------------------------
create table public.items (
  id           uuid primary key default gen_random_uuid(),
  space_id     uuid not null references public.spaces (id) on delete cascade,
  product_id   uuid references public.products (id) on delete cascade,  -- null = unsorted inbox item
  number       integer,                                                  -- per-product counter: ACME-12
  type         text not null default 'idea'
               check (type in ('bug', 'feature', 'idea', 'modification', 'task')),
  title        text not null check (length(btrim(title)) > 0),
  description  text,
  status       text not null default 'inbox'
               check (status in ('inbox', 'triaged', 'planned', 'in_progress', 'done', 'parked', 'rejected')),
  priority     text not null default 'none'
               check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  effort       text check (effort in ('xs', 's', 'm', 'l', 'xl')),
  source       text,
  release_id   uuid,
  assignee_id  uuid references public.profiles (id) on delete set null,
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  completed_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  -- an item can only join a release of its own product
  foreign key (product_id, release_id)
    references public.releases (product_id, id) on delete set null (release_id)
);

create unique index items_product_number_key on public.items (product_id, number) where number is not null;
create index items_space_status_idx   on public.items (space_id, status);
create index items_product_status_idx on public.items (product_id, status);
create index items_release_idx        on public.items (release_id);
create index items_assignee_idx       on public.items (assignee_id);

create function public.items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_space uuid;
  v_num   integer;
begin
  if new.product_id is not null then
    select p.space_id into v_space from public.products p where p.id = new.product_id;
    if v_space is null then
      raise exception 'Unknown product';
    end if;
    new.space_id := v_space;
  end if;

  if tg_op = 'INSERT' then
    if new.product_id is not null then
      update public.products set item_counter = item_counter + 1
      where id = new.product_id
      returning item_counter into v_num;
      new.number := v_num;
    else
      new.number := null;
    end if;
    if new.status = 'done' then
      new.completed_at := now();
    end if;
  else
    if new.space_id is distinct from old.space_id then
      raise exception 'Items cannot move between spaces';
    end if;
    if new.product_id is distinct from old.product_id then
      if new.product_id is null then
        new.number := null;
      else
        update public.products set item_counter = item_counter + 1
        where id = new.product_id
        returning item_counter into v_num;
        new.number := v_num;
      end if;
    else
      new.number := old.number;
    end if;
    if new.status = 'done' and old.status is distinct from 'done' then
      new.completed_at := now();
    elsif new.status <> 'done' then
      new.completed_at := null;
    end if;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create trigger items_a_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();

-- ---------------------------------------------------------------------------
-- History and comments (one table, so the item page shows one timeline)
-- ---------------------------------------------------------------------------
create table public.item_events (
  id         bigint generated always as identity primary key,
  item_id    uuid not null references public.items (id) on delete cascade,
  space_id   uuid not null references public.spaces (id) on delete cascade,
  actor_id   uuid default auth.uid() references public.profiles (id) on delete set null,
  kind       text not null check (kind in ('created', 'changed', 'comment')),
  field      text,
  old_value  text,
  new_value  text,
  body       text,
  created_at timestamptz not null default now()
);
create index item_events_item_idx on public.item_events (item_id, created_at);

create function public.log_item_changes()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := (select auth.uid());
  v_old text;
  v_new text;
begin
  if tg_op = 'INSERT' then
    insert into public.item_events (item_id, space_id, actor_id, kind, field, new_value)
    values (new.id, new.space_id, uid, 'created', 'type', new.type);
    return new;
  end if;

  if new.type is distinct from old.type then
    insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
    values (new.id, new.space_id, uid, 'changed', 'type', old.type, new.type);
  end if;
  if new.status is distinct from old.status then
    insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
    values (new.id, new.space_id, uid, 'changed', 'status', old.status, new.status);
  end if;
  if new.priority is distinct from old.priority then
    insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
    values (new.id, new.space_id, uid, 'changed', 'priority', old.priority, new.priority);
  end if;
  if new.effort is distinct from old.effort then
    insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
    values (new.id, new.space_id, uid, 'changed', 'effort', old.effort, new.effort);
  end if;
  if new.product_id is distinct from old.product_id then
    select p.key into v_old from public.products p where p.id = old.product_id;
    select p.key into v_new from public.products p where p.id = new.product_id;
    insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
    values (new.id, new.space_id, uid, 'changed', 'product', v_old, v_new);
  end if;
  if new.release_id is distinct from old.release_id then
    select r.version into v_old from public.releases r where r.id = old.release_id;
    select r.version into v_new from public.releases r where r.id = new.release_id;
    -- Deleting a release clears release_id; both sides then resolve to nothing, which is not worth a history row.
    if v_old is distinct from v_new then
      insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
      values (new.id, new.space_id, uid, 'changed', 'release', v_old, v_new);
    end if;
  end if;
  if new.assignee_id is distinct from old.assignee_id then
    select coalesce(p.display_name, p.email) into v_old from public.profiles p where p.id = old.assignee_id;
    select coalesce(p.display_name, p.email) into v_new from public.profiles p where p.id = new.assignee_id;
    insert into public.item_events (item_id, space_id, actor_id, kind, field, old_value, new_value)
    values (new.id, new.space_id, uid, 'changed', 'assignee', v_old, v_new);
  end if;
  return new;
end;
$$;

create trigger items_log_changes
  after insert or update on public.items
  for each row execute function public.log_item_changes();

-- ---------------------------------------------------------------------------
-- Row level security: everything is scoped to spaces you belong to
-- ---------------------------------------------------------------------------
alter table public.profiles      enable row level security;
alter table public.spaces        enable row level security;
alter table public.space_members enable row level security;
alter table public.products      enable row level security;
alter table public.releases      enable row level security;
alter table public.items         enable row level security;
alter table public.item_events   enable row level security;

create policy profiles_select on public.profiles for select to authenticated using (
  id = (select auth.uid())
  or exists (
    select 1
    from public.space_members a
    join public.space_members b on b.space_id = a.space_id
    where a.user_id = (select auth.uid()) and b.user_id = profiles.id
  )
);
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy spaces_select on public.spaces for select to authenticated
  using (public.is_space_member(id));
create policy spaces_update on public.spaces for update to authenticated
  using (public.is_space_admin(id)) with check (public.is_space_admin(id));

create policy space_members_select on public.space_members for select to authenticated
  using (public.is_space_member(space_id));
create policy space_members_insert on public.space_members for insert to authenticated
  with check (public.is_space_admin(space_id));
create policy space_members_update on public.space_members for update to authenticated
  using (public.is_space_admin(space_id)) with check (public.is_space_admin(space_id));
create policy space_members_delete on public.space_members for delete to authenticated
  using (public.is_space_admin(space_id));

create policy products_select on public.products for select to authenticated
  using (public.is_space_member(space_id));
create policy products_insert on public.products for insert to authenticated
  with check (public.is_space_member(space_id));
create policy products_update on public.products for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy products_delete on public.products for delete to authenticated
  using (public.is_space_admin(space_id));

create policy releases_select on public.releases for select to authenticated
  using (public.is_space_member(space_id));
create policy releases_insert on public.releases for insert to authenticated
  with check (public.is_space_member(space_id));
create policy releases_update on public.releases for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy releases_delete on public.releases for delete to authenticated
  using (public.is_space_member(space_id));

create policy items_select on public.items for select to authenticated
  using (public.is_space_member(space_id));
create policy items_insert on public.items for insert to authenticated
  with check (public.is_space_member(space_id));
create policy items_update on public.items for update to authenticated
  using (public.is_space_member(space_id)) with check (public.is_space_member(space_id));
create policy items_delete on public.items for delete to authenticated
  using (public.is_space_member(space_id));

-- Members can read history and add comments. History rows themselves are written by the trigger.
create policy item_events_select on public.item_events for select to authenticated
  using (public.is_space_member(space_id));
create policy item_events_insert on public.item_events for insert to authenticated
  with check (
    public.is_space_member(space_id)
    and kind = 'comment'
    and actor_id = (select auth.uid())
  );
