-- Histórico compartilhado da velo ia.
--
-- As conversas ficam ligadas ao usuário do Supabase Auth. A rede social usa
-- esse histórico quando a pessoa está logada; o app Android usa os mesmos
-- endpoints com Authorization: Bearer <access_token>. Visitantes continuam
-- no localStorage do navegador.

create table if not exists public.ai_conversations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default 'Nova conversa',
  preview text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ai_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.ai_conversations (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null check (char_length(content) between 1 and 12000),
  created_at timestamptz not null default now()
);

create index if not exists ai_conversations_user_idx
  on public.ai_conversations (user_id, updated_at desc);

create index if not exists ai_messages_conversation_idx
  on public.ai_messages (conversation_id, created_at);

-- Reaproveita public.touch_updated_at() do schema principal. O bloco abaixo
-- mantém a migração autossuficiente caso ela seja a primeira a rodar.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists ai_conversations_touch_updated_at on public.ai_conversations;
create trigger ai_conversations_touch_updated_at
  before update on public.ai_conversations
  for each row execute function public.touch_updated_at();

-- A mensagem nova move a conversa para o topo da lista do drawer.
create or replace function public.touch_ai_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.ai_conversations
    set updated_at = now()
    where id = new.conversation_id;
  return new;
end;
$$;

drop trigger if exists ai_messages_touch_conversation on public.ai_messages;
create trigger ai_messages_touch_conversation
  after insert on public.ai_messages
  for each row execute function public.touch_ai_conversation_on_message();

-- ------------------------------------------------------------
-- RLS: cada pessoa só enxerga as próprias conversas e mensagens.
-- ------------------------------------------------------------
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;

drop policy if exists ai_conversations_select_own on public.ai_conversations;
create policy ai_conversations_select_own
  on public.ai_conversations for select
  using (auth.uid() = user_id);

drop policy if exists ai_conversations_insert_own on public.ai_conversations;
create policy ai_conversations_insert_own
  on public.ai_conversations for insert
  with check (auth.uid() = user_id);

drop policy if exists ai_conversations_update_own on public.ai_conversations;
create policy ai_conversations_update_own
  on public.ai_conversations for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists ai_conversations_delete_own on public.ai_conversations;
create policy ai_conversations_delete_own
  on public.ai_conversations for delete
  using (auth.uid() = user_id);

drop policy if exists ai_messages_select_own on public.ai_messages;
create policy ai_messages_select_own
  on public.ai_messages for select
  using (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists ai_messages_insert_own on public.ai_messages;
create policy ai_messages_insert_own
  on public.ai_messages for insert
  with check (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

drop policy if exists ai_messages_delete_own on public.ai_messages;
create policy ai_messages_delete_own
  on public.ai_messages for delete
  using (
    exists (
      select 1
      from public.ai_conversations c
      where c.id = ai_messages.conversation_id
        and c.user_id = auth.uid()
    )
  );

-- Garante que a API com service role (se um dia existir) também enxergue.
grant select, insert, update, delete on public.ai_conversations to authenticated;
grant select, insert, delete on public.ai_messages to authenticated;
