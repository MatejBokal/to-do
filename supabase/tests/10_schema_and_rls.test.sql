-- Schema and row-level-security tests for supabase/migrations/0001_init.sql
--
-- Needs an EMPTY database that already has the migration applied (the first-user test counts spaces).
-- Never run this against your real Supabase project: it creates test users. It runs inside one
-- transaction and rolls back at the end, but still use a local database.
--
--   vanilla Postgres 15+:  psql -f 00_vanilla_postgres_shim.sql, then the migration, then this file
--   Supabase local stack:  skip the shim (roles and the auth schema already exist), apply the migration, run this file
--
-- Run with:  psql -X -q -v ON_ERROR_STOP=1 -f supabase/tests/10_schema_and_rls.test.sql <connection>
-- Success ends with a row reading ALL TESTS PASSED. Any failure stops the run with a FAIL message.

begin;
\set ON_ERROR_STOP on
\set A '''aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'''
\set B '''bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'''
set client_min_messages = notice;

-- 1. profiles are created by the auth trigger
insert into auth.users (id, email) values (:A, 'a@example.com'), (:B, 'b@example.com');
do $$ begin
  if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL profiles trigger'; end if;
  raise notice 'OK   profiles created by trigger';
end $$;

-- 2. first user gets Work + Personal; the second user (coworker) gets nothing
select set_config('request.jwt.claim.sub', :A, false) \gset
set role authenticated;
select public.ensure_default_spaces() \gset
select public.ensure_default_spaces() \gset
do $$ begin
  if (select count(*) from public.spaces) <> 2 then raise exception 'FAIL spaces count %', (select count(*) from public.spaces); end if;
  if (select count(*) from public.space_members where role = 'owner') <> 2 then raise exception 'FAIL owner membership'; end if;
  raise notice 'OK   first user gets two spaces, owner membership added, call is idempotent';
end $$;

reset role;
select set_config('request.jwt.claim.sub', :B, false) \gset
set role authenticated;
select public.ensure_default_spaces() \gset
do $$ begin
  if (select count(*) from public.spaces) <> 0 then raise exception 'FAIL coworker can see spaces'; end if;
  raise notice 'OK   second user gets no spaces and sees none';
end $$;
reset role;

-- 3. items, numbering, events (as user A)
select set_config('request.jwt.claim.sub', :A, false) \gset
set role authenticated;

insert into public.products (space_id, key, name) select id, 'ACME', 'Acme app' from public.spaces where slug = 'work';
insert into public.products (space_id, key, name) select id, 'HOME', 'Home thing' from public.spaces where slug = 'personal';

insert into public.items (space_id, title) select id, 'Loose idea' from public.spaces where slug = 'work';
insert into public.items (space_id, product_id, type, title, priority)
  select p.space_id, p.id, 'bug', 'Login fails', 'high' from public.products p where p.key = 'ACME';
insert into public.items (space_id, product_id, type, title)
  select p.space_id, p.id, 'feature', 'Dark mode' from public.products p where p.key = 'ACME';

do $$ begin
  if (select number from public.items where title = 'Login fails') is distinct from 1 then raise exception 'FAIL number 1'; end if;
  if (select number from public.items where title = 'Dark mode') is distinct from 2 then raise exception 'FAIL number 2'; end if;
  if (select number from public.items where title = 'Loose idea') is not null then raise exception 'FAIL loose idea has number'; end if;
  if (select type from public.items where title = 'Loose idea') <> 'idea' then raise exception 'FAIL default type'; end if;
  if (select status from public.items where title = 'Loose idea') <> 'inbox' then raise exception 'FAIL default status'; end if;
  if (select created_by from public.items where title = 'Loose idea') is distinct from auth.uid() then raise exception 'FAIL created_by default'; end if;
  raise notice 'OK   per-product numbering, defaults, created_by';
end $$;

-- promote idea -> feature (what the app does), then give it a product
update public.items set type = 'feature', status = 'triaged' where title = 'Loose idea';
update public.items set product_id = (select id from public.products where key = 'ACME') where title = 'Loose idea';
do $$ begin
  if (select number from public.items where title = 'Loose idea') is distinct from 3 then raise exception 'FAIL renumber on product assign'; end if;
  if not exists (select 1 from public.item_events e join public.items i on i.id = e.item_id
                 where i.title = 'Loose idea' and e.field = 'type' and e.old_value = 'idea' and e.new_value = 'feature') then
    raise exception 'FAIL promotion event missing';
  end if;
  if not exists (select 1 from public.item_events e join public.items i on i.id = e.item_id
                 where i.title = 'Loose idea' and e.field = 'product' and e.new_value = 'ACME') then
    raise exception 'FAIL product event missing';
  end if;
  if (select count(*) from public.item_events e join public.items i on i.id = e.item_id where i.title = 'Loose idea' and e.kind = 'created') <> 1 then
    raise exception 'FAIL created event';
  end if;
  raise notice 'OK   promotion and product assignment are logged; item renumbered under its new product';
end $$;

-- completed_at follows status
update public.items set status = 'done' where title = 'Dark mode';
do $$ begin
  if (select completed_at from public.items where title = 'Dark mode') is null then raise exception 'FAIL completed_at not set'; end if;
end $$;
update public.items set status = 'planned' where title = 'Dark mode';
do $$ begin
  if (select completed_at from public.items where title = 'Dark mode') is not null then raise exception 'FAIL completed_at not cleared'; end if;
  raise notice 'OK   completed_at set on done and cleared on reopen';
end $$;

-- 4. releases: space_id filled by trigger, composite FK keeps releases within their product
insert into public.releases (product_id, version, title) select id, '1.0.0', 'First' from public.products where key = 'ACME';
insert into public.releases (product_id, version) select id, '0.1' from public.products where key = 'HOME';
do $$ begin
  if (select space_id from public.releases where version = '1.0.0') is distinct from (select space_id from public.products where key = 'ACME') then
    raise exception 'FAIL release space_id';
  end if;
  raise notice 'OK   release space_id filled in from its product';
end $$;

update public.items set release_id = (select id from public.releases where version = '1.0.0') where title = 'Login fails';
do $$ begin
  begin
    update public.items set release_id = (select id from public.releases where version = '0.1') where title = 'Login fails';
    raise exception 'FAIL item joined a release of another product';
  exception when foreign_key_violation then
    raise notice 'OK   item cannot join a release of a different product (%)', sqlstate;
  end;
end $$;

-- release deletion keeps the item and its product
delete from public.releases where version = '1.0.0';
do $$ begin
  if (select release_id from public.items where title = 'Login fails') is not null then raise exception 'FAIL release_id not cleared'; end if;
  if (select product_id from public.items where title = 'Login fails') is null then raise exception 'FAIL product_id was cleared too'; end if;
  if exists (select 1 from public.item_events where field = 'release' and old_value is null and new_value is null) then
    raise exception 'FAIL empty release history row logged';
  end if;
  raise notice 'OK   deleting a release clears release_id only (ON DELETE SET NULL column list works)';
end $$;

-- items cannot move between spaces by switching to a product in another space
do $$ begin
  begin
    update public.items set product_id = (select id from public.products where key = 'HOME') where title = 'Login fails';
    raise exception 'FAIL item moved between spaces';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK   moving an item to another space is refused (%)', sqlerrm;
  end;
end $$;

-- comments: allowed as yourself, refused for forged history or other actors
insert into public.item_events (item_id, space_id, kind, body)
  select id, space_id, 'comment', 'Looks like a cookie problem' from public.items where title = 'Login fails';
do $$ begin
  begin
    insert into public.item_events (item_id, space_id, kind, field, new_value)
      select id, space_id, 'changed', 'status', 'done' from public.items where title = 'Login fails';
    raise exception 'FAIL forged history row accepted';
  exception when insufficient_privilege then
    raise notice 'OK   members cannot write fake history rows';
  end;
end $$;

-- duplicate keys / versions
do $$ begin
  begin
    insert into public.products (space_id, key, name) select id, 'ACME', 'Again' from public.spaces where slug = 'work';
    raise exception 'FAIL duplicate key accepted';
  exception when unique_violation then
    raise notice 'OK   duplicate product key refused (code %)', sqlstate;
  end;
end $$;
reset role;

-- 5. isolation: user B cannot see or touch user A's data
select set_config('request.jwt.claim.sub', :B, false) \gset
set role authenticated;
do $$
declare n integer;
begin
  if (select count(*) from public.items) <> 0 then raise exception 'FAIL B can read items'; end if;
  if (select count(*) from public.products) <> 0 then raise exception 'FAIL B can read products'; end if;
  if (select count(*) from public.profiles) <> 1 then raise exception 'FAIL B sees other profiles (%)', (select count(*) from public.profiles); end if;

  update public.items set title = 'hacked';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B updated % rows', n; end if;
  delete from public.items;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FAIL B deleted % rows', n; end if;

  begin
    insert into public.items (space_id, title) select id, 'sneaky' from (select space_id as id from (select '00000000-0000-0000-0000-000000000000'::uuid as space_id) x) y;
    raise exception 'FAIL insert into nonexistent space accepted';
  exception when foreign_key_violation or insufficient_privilege then null;
  end;
  raise notice 'OK   user B sees nothing of A and cannot change anything';
end $$;
reset role;

-- B tries to file an item against A's product (found through a privileged lookup, as an attacker might guess a uuid)
select set_config('request.jwt.claim.sub', :B, false) \gset
select set_config('test.acme_id', p.id::text, false), set_config('test.work_space', p.space_id::text, false)
  from public.products p where p.key = 'ACME' \gset
set role authenticated;
do $$ begin
  begin
    insert into public.items (space_id, product_id, title)
      values (current_setting('test.work_space')::uuid, current_setting('test.acme_id')::uuid, 'sneaky');
    raise exception 'FAIL B filed an item in A''s space';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    raise notice 'OK   B cannot file items against A''s product or space (%)', sqlerrm;
  end;
end $$;
reset role;

-- anonymous visitors get nothing, and cannot call the RPCs
set role anon;
do $$ begin
  if (select count(*) from public.items) <> 0 then raise exception 'FAIL anon reads items'; end if;
  begin
    perform public.ensure_default_spaces();
    raise exception 'FAIL anon may call ensure_default_spaces';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK   anon sees no rows and cannot call the RPCs';
end $$;
reset role;

-- 6. coworker flow: A adds B to Work; B can then work there, but is not an admin
select set_config('request.jwt.claim.sub', :A, false) \gset
set role authenticated;
insert into public.space_members (space_id, user_id, role) select id, :B, 'member' from public.spaces where slug = 'work';
reset role;

select set_config('request.jwt.claim.sub', :B, false) \gset
set role authenticated;
do $$ begin
  if (select count(*) from public.spaces) <> 1 then raise exception 'FAIL B should see exactly the Work space'; end if;
  if (select count(*) from public.items) <> 3 then raise exception 'FAIL B should see 3 items, sees %', (select count(*) from public.items); end if;
  if (select count(*) from public.profiles) <> 2 then raise exception 'FAIL profiles visible to B: %', (select count(*) from public.profiles); end if;
  if (select count(*) from public.space_members) <> 2 then raise exception 'FAIL members visible to B'; end if;
  raise notice 'OK   after being added, B sees the Work space, its items, and both profiles';
end $$;

insert into public.items (space_id, product_id, type, title, assignee_id)
  select p.space_id, p.id, 'bug', 'Reported by coworker', auth.uid() from public.products p where p.key = 'ACME';
do $$ begin
  if (select number from public.items where title = 'Reported by coworker') is distinct from 4 then raise exception 'FAIL numbering across users'; end if;
  begin
    insert into public.space_members (space_id, user_id, role) select id, auth.uid(), 'owner' from public.spaces;
    raise exception 'FAIL member could add members';
  exception when others then
    if sqlerrm like 'FAIL%' then raise; end if;
    null;
  end;
  begin
    update public.space_members set role = 'owner' where user_id = auth.uid();
    if found then raise exception 'FAIL member escalated own role'; end if;
  end;
  raise notice 'OK   coworker can file items (numbered 4), cannot add members or promote themselves';
end $$;
reset role;

select 'ALL TESTS PASSED' as result;

rollback;
