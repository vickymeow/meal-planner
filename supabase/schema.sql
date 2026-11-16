-- 早饭晚饭：同步用的表和函数（已经建在 Supabase 项目 breakfast-decider 里）。
-- 表本身对浏览器完全关闭（开 RLS、没有 policy）；浏览器只能调用下面两个函数，
-- 而且必须带上「家庭密钥」h。家庭密钥只通过链接发给家里人，不写进仓库。

create table if not exists public.mp_households (
  id text primary key check (length(id) >= 24),
  created_at timestamptz not null default now()
);
create table if not exists public.mp_items (
  household text not null references public.mp_households(id) on delete cascade,
  id text not null check (length(id) <= 200),
  data jsonb not null default '{}'::jsonb,
  deleted boolean not null default false,
  updated_by text,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (household, id)
);
create index if not exists mp_items_household_updated on public.mp_items (household, updated_at);
alter table public.mp_households enable row level security;
alter table public.mp_items enable row level security;
revoke all on public.mp_households from anon, authenticated;
revoke all on public.mp_items from anon, authenticated;

-- 拉：since 为空时给全部（不含已删除），否则给 since 之后改过的（含删除标记）
create or replace function public.mp_pull(h text, since timestamptz default null)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.mp_households where id = h) then
    raise exception 'unknown household' using errcode = '28000';
  end if;
  return json_build_object('now', clock_timestamp(), 'items', coalesce((
    select json_agg(json_build_object('id', i.id, 'data', i.data, 'deleted', i.deleted, 'at', i.updated_at, 'by', i.updated_by))
    from public.mp_items i
    where i.household = h and ((since is null and not i.deleted) or (since is not null and i.updated_at > since))
  ), '[]'::json));
end; $$;

-- 推：一次最多 300 条，后写的覆盖先写的
create or replace function public.mp_push(h text, items jsonb)
returns json language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.mp_households where id = h) then
    raise exception 'unknown household' using errcode = '28000';
  end if;
  if jsonb_typeof(items) <> 'array' or jsonb_array_length(items) > 300 or pg_column_size(items) > 2000000 then
    raise exception 'bad payload';
  end if;
  insert into public.mp_items (household, id, data, deleted, updated_by, updated_at)
  select h, x->>'id', coalesce(x->'data', '{}'::jsonb), coalesce((x->>'deleted')::boolean, false), left(x->>'by', 40), clock_timestamp()
  from jsonb_array_elements(items) x where x->>'id' is not null
  on conflict (household, id) do update
    set data = excluded.data, deleted = excluded.deleted, updated_by = excluded.updated_by, updated_at = clock_timestamp();
  return json_build_object('ok', true, 'now', clock_timestamp());
end; $$;

revoke all on function public.mp_pull(text, timestamptz) from public;
revoke all on function public.mp_push(text, jsonb) from public;
grant execute on function public.mp_pull(text, timestamptz) to anon, authenticated;
grant execute on function public.mp_push(text, jsonb) to anon, authenticated;

-- 新建一个家（得到家庭密钥）：
-- insert into public.mp_households(id) values (encode(extensions.gen_random_bytes(15),'hex')) returning id;
