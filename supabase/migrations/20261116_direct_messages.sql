-- ============================================================
-- velo — mensagens diretas (Direct)
-- Execute este arquivo no SQL Editor do Supabase ou rode o
-- schema.sql completo em um projeto novo.
-- ============================================================

-- ------------------------------------------------------------
-- 1. Tabelas
-- ------------------------------------------------------------
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_participants (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid not null references public.profiles (id) on delete cascade,
  body text check (body is null or char_length(body) between 1 and 2000),
  post_id uuid references public.posts (id) on delete cascade,
  created_at timestamptz not null default now(),
  check (body is not null or post_id is not null)
);

-- ------------------------------------------------------------
-- 2. Índices
-- ------------------------------------------------------------
create index if not exists conversation_participants_user_idx
  on public.conversation_participants (user_id, conversation_id);
create index if not exists conversations_updated_idx
  on public.conversations (updated_at desc);
create index if not exists direct_messages_conversation_idx
  on public.direct_messages (conversation_id, created_at desc);
create index if not exists direct_messages_sender_idx
  on public.direct_messages (sender_id, created_at desc);
create index if not exists direct_messages_post_idx
  on public.direct_messages (post_id)
  where post_id is not null;

-- ------------------------------------------------------------
-- 3. updated_at da conversa
-- ------------------------------------------------------------
drop trigger if exists conversations_touch_updated_at on public.conversations;
create trigger conversations_touch_updated_at
  before update on public.conversations
  for each row execute function public.touch_updated_at();

-- Ao inserir uma mensagem, atualiza a conversa e marca como lida para quem
-- enviou. O destinatário continua com o não lido até abrir a conversa.
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.conversations
  set updated_at = new.created_at
  where id = new.conversation_id;

  update public.conversation_participants
  set last_read_at = greatest(last_read_at, new.created_at)
  where conversation_id = new.conversation_id
    and user_id = new.sender_id;

  return new;
end;
$$;

drop trigger if exists direct_messages_touch_conversation on public.direct_messages;
create trigger direct_messages_touch_conversation
  after insert on public.direct_messages
  for each row execute function public.touch_conversation_on_message();

-- ------------------------------------------------------------
-- 4. Funções de acesso
-- ------------------------------------------------------------
-- Security definer para consultar participantes sem recursão de RLS.
create or replace function public.is_conversation_member(target_conversation uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.conversation_participants
    where conversation_id = target_conversation
      and user_id = auth.uid()
  );
$$;

-- Cria (ou reencontra) a conversa 1:1 entre a pessoa autenticada e o alvo.
create or replace function public.start_direct_conversation(target_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  existing_id uuid;
  pair_key text;
begin
  if me is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;

  if target_user_id is null or target_user_id = me then
    raise exception 'invalid_target' using errcode = '22023';
  end if;

  if not exists (select 1 from public.profiles where id = target_user_id) then
    raise exception 'profile_not_found' using errcode = 'P0002';
  end if;

  -- Evita duas conversas se as duas pessoas clicarem em "enviar" ao mesmo
  -- tempo. O lock é liberado no fim da transação.
  pair_key := least(me, target_user_id)::text || ':' || greatest(me, target_user_id)::text;
  perform pg_advisory_xact_lock(hashtextextended(pair_key, 0));

  select c.id
  into existing_id
  from public.conversations c
  join public.conversation_participants p1
    on p1.conversation_id = c.id and p1.user_id = me
  join public.conversation_participants p2
    on p2.conversation_id = c.id and p2.user_id = target_user_id
  where (
    select count(*)
    from public.conversation_participants p
    where p.conversation_id = c.id
  ) = 2
  limit 1;

  if existing_id is not null then
    return existing_id;
  end if;

  insert into public.conversations (created_by)
  values (me)
  returning id into existing_id;

  insert into public.conversation_participants (conversation_id, user_id)
  values (existing_id, me), (existing_id, target_user_id);

  return existing_id;
end;
$$;

-- Lista as conversas da pessoa com a outra participante, a última mensagem e
-- a contagem de não lidas. Uma linha por conversa 1:1.
create or replace function public.list_direct_conversations()
returns table (
  conversation_id uuid,
  other_id uuid,
  other_handle text,
  other_display_name text,
  other_avatar_url text,
  last_body text,
  last_post_id uuid,
  last_media_type text,
  last_sender_id uuid,
  last_at timestamptz,
  unread_count bigint
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select auth.uid() as uid
  )
  select
    c.id,
    op.user_id,
    pr.handle,
    pr.display_name,
    pr.avatar_url,
    lm.body,
    lm.post_id,
    lm.media_type,
    lm.sender_id,
    coalesce(lm.created_at, c.created_at),
    coalesce(unread.total, 0)
  from public.conversation_participants p
  join me on p.user_id = me.uid
  join public.conversations c on c.id = p.conversation_id
  join public.conversation_participants op
    on op.conversation_id = c.id and op.user_id <> me.uid
  join public.profiles pr on pr.id = op.user_id
  left join lateral (
    select
      m.body,
      m.post_id,
      m.sender_id,
      m.created_at,
      post.media_type
    from public.direct_messages m
    left join public.posts post on post.id = m.post_id
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) lm on true
  left join lateral (
    select count(*) as total
    from public.direct_messages m
    where m.conversation_id = c.id
      and m.sender_id <> me.uid
      and m.created_at > p.last_read_at
  ) unread on true
  order by coalesce(lm.created_at, c.created_at) desc;
$$;

create or replace function public.direct_unread_total()
returns bigint
language sql
stable
security definer
set search_path = public
as $$
  select count(*)
  from public.direct_messages m
  join public.conversation_participants p
    on p.conversation_id = m.conversation_id
   and p.user_id = auth.uid()
  where m.sender_id <> auth.uid()
    and m.created_at > p.last_read_at;
$$;

create or replace function public.mark_direct_read(target_conversation uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.conversation_participants
  set last_read_at = now()
  where conversation_id = target_conversation
    and user_id = auth.uid();
$$;

-- ------------------------------------------------------------
-- 5. Row Level Security
-- ------------------------------------------------------------
alter table public.conversations enable row level security;
alter table public.conversation_participants enable row level security;
alter table public.direct_messages enable row level security;

revoke all on table public.conversations from anon, authenticated;
grant select on table public.conversations to authenticated;

revoke all on table public.conversation_participants from anon, authenticated;
grant select on table public.conversation_participants to authenticated;
grant update (last_read_at) on table public.conversation_participants to authenticated;

revoke all on table public.direct_messages from anon, authenticated;
grant select, insert, delete on table public.direct_messages to authenticated;

drop policy if exists "conversations_select_member" on public.conversations;
create policy "conversations_select_member"
  on public.conversations for select
  to authenticated
  using (public.is_conversation_member(id));

drop policy if exists "participants_select_member" on public.conversation_participants;
create policy "participants_select_member"
  on public.conversation_participants for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "participants_update_own" on public.conversation_participants;
create policy "participants_update_own"
  on public.conversation_participants for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "direct_messages_select_member" on public.direct_messages;
create policy "direct_messages_select_member"
  on public.direct_messages for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "direct_messages_insert_member" on public.direct_messages;
create policy "direct_messages_insert_member"
  on public.direct_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "direct_messages_delete_own" on public.direct_messages;
create policy "direct_messages_delete_own"
  on public.direct_messages for delete
  to authenticated
  using (sender_id = auth.uid());

-- ------------------------------------------------------------
-- 6. Permissões das funções
-- ------------------------------------------------------------
revoke all on function public.is_conversation_member(uuid) from public, anon;
revoke all on function public.start_direct_conversation(uuid) from public, anon;
revoke all on function public.list_direct_conversations() from public, anon;
revoke all on function public.direct_unread_total() from public, anon;
revoke all on function public.mark_direct_read(uuid) from public, anon;

grant execute on function public.is_conversation_member(uuid) to authenticated;
grant execute on function public.start_direct_conversation(uuid) to authenticated;
grant execute on function public.list_direct_conversations() to authenticated;
grant execute on function public.direct_unread_total() to authenticated;
grant execute on function public.mark_direct_read(uuid) to authenticated;

-- ------------------------------------------------------------
-- 7. Realtime
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'direct_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.direct_messages';
  end if;
end;
$$;
