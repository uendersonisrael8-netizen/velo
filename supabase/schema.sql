-- ============================================================
-- velo — schema do Supabase
-- Execute no SQL Editor do seu projeto, na ordem abaixo.
-- ============================================================

-- ------------------------------------------------------------
-- 0. Extensões
-- ------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ------------------------------------------------------------
-- 1. Tabelas
-- ------------------------------------------------------------

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9_]{3,24}$'),
  display_name text not null check (char_length(display_name) between 1 and 60),
  bio text not null default '' check (char_length(bio) <= 160),
  link text check (link is null or char_length(link) <= 120),
  location text check (location is null or char_length(location) <= 60),
  avatar_url text,
  followers_count integer not null default 0 check (followers_count >= 0),
  following_count integer not null default 0 check (following_count >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  media_type text not null check (media_type in ('video', 'image')),
  media_url text not null,
  poster_url text,
  caption text not null default '' check (char_length(caption) <= 2200),
  tags text[] not null default '{}' check (array_length(tags, 1) is null or array_length(tags, 1) <= 8),
  location text check (location is null or char_length(location) <= 80),
  audio text check (audio is null or char_length(audio) <= 120),
  duration_seconds numeric(6, 2) check (duration_seconds is null or duration_seconds between 0 and 600),
  likes_count integer not null default 0 check (likes_count >= 0),
  comments_count integer not null default 0 check (comments_count >= 0),
  saves_count integer not null default 0 check (saves_count >= 0),
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts (id) on delete cascade,
  author_id uuid not null references public.profiles (id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.saves (
  post_id uuid not null references public.posts (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.follows (
  follower_id uuid not null references public.profiles (id) on delete cascade,
  following_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references public.profiles (id) on delete cascade,
  media_type text not null check (media_type in ('video', 'image')),
  media_url text not null,
  poster_url text,
  caption text check (caption is null or char_length(caption) <= 120),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours')
);

-- Mantém o limite da legenda alinhado ao compositor do app mesmo em projetos
-- que já rodaram uma versão anterior deste schema.
alter table public.posts drop constraint if exists posts_caption_check;
alter table public.posts
  add constraint posts_caption_check check (char_length(caption) <= 2200);

-- ------------------------------------------------------------
-- 2. Índices
-- ------------------------------------------------------------
create index if not exists posts_created_at_idx on public.posts (created_at desc);
create index if not exists posts_author_idx on public.posts (author_id, created_at desc);
create index if not exists posts_tags_idx on public.posts using gin (tags);
create index if not exists comments_post_idx on public.comments (post_id, created_at);
create index if not exists comments_author_idx on public.comments (author_id);
create index if not exists likes_user_idx on public.likes (user_id);
create index if not exists saves_user_idx on public.saves (user_id);
create index if not exists follows_following_idx on public.follows (following_id);
create index if not exists stories_author_idx on public.stories (author_id, created_at desc);
create index if not exists stories_expires_idx on public.stories (expires_at);

-- ------------------------------------------------------------
-- 3. updated_at
-- ------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
  before update on public.profiles
  for each row execute function public.touch_updated_at();

-- ------------------------------------------------------------
-- 4. Perfil automático no signup
-- ------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  meta_handle text;
  base_handle text;
  candidate text;
  suffix integer := 0;
  profile_name text;
  profile_avatar text;
begin
  -- Cadastro por e-mail: o app envia o handle escolhido em raw_user_meta_data.
  meta_handle := left(
    nullif(
      lower(regexp_replace(
        coalesce(new.raw_user_meta_data ->> 'handle', ''),
        '[^a-z0-9_]', '', 'g'
      )),
      ''
    ),
    24
  );

  -- Google entrega full_name/name e avatar_url/picture; o cadastro por e-mail
  -- envia display_name. A ordem abaixo cobre os dois fluxos.
  profile_name := left(
    coalesce(
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      nullif(new.raw_user_meta_data ->> 'full_name', ''),
      nullif(new.raw_user_meta_data ->> 'name', ''),
      nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Novo perfil'
    ),
    60
  );

  profile_avatar := coalesce(
    nullif(new.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(new.raw_user_meta_data ->> 'picture', '')
  );

  if meta_handle is not null then
    -- Handle escolhido no cadastro por e-mail. Se colidir, o unique_violation
    -- aborta o signup para o app pedir outro handle — não trocamos em silêncio.
    candidate := meta_handle;
  else
    -- OAuth (Google): deriva um handle do e-mail/nome e resolve colisões
    -- adicionando um sufixo numérico.
    base_handle := lower(regexp_replace(
      coalesce(
        nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
        nullif(new.raw_user_meta_data ->> 'preferred_username', ''),
        nullif(new.raw_user_meta_data ->> 'full_name', ''),
        nullif(new.raw_user_meta_data ->> 'name', ''),
        'velo'
      ),
      '[^a-z0-9_]', '', 'g'
    ));
    base_handle := left(nullif(base_handle, ''), 20);

    if base_handle is null or char_length(base_handle) < 3 then
      base_handle := 'velo';
    end if;

    candidate := base_handle;
    while exists (select 1 from public.profiles where handle = candidate) loop
      suffix := suffix + 1;
      candidate := left(base_handle, greatest(3, 24 - char_length(suffix::text))) || suffix::text;
    end loop;
  end if;

  insert into public.profiles (id, handle, display_name, bio, avatar_url)
  values (new.id, candidate, profile_name, '', profile_avatar)
  on conflict (id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Preenche perfis criados por versões anteriores do schema com o nome e a foto
-- que o Google entrega no primeiro login. Só toca no placeholder antigo e
-- quando ainda não existe avatar, para nunca sobrescrever um perfil editado.
update public.profiles as p
set
  display_name = left(
    coalesce(
      nullif(u.raw_user_meta_data ->> 'display_name', ''),
      nullif(u.raw_user_meta_data ->> 'full_name', ''),
      nullif(u.raw_user_meta_data ->> 'name', ''),
      p.display_name
    ),
    60
  ),
  avatar_url = coalesce(
    nullif(u.raw_user_meta_data ->> 'avatar_url', ''),
    nullif(u.raw_user_meta_data ->> 'picture', ''),
    p.avatar_url
  )
from auth.users as u
where u.id = p.id
  and p.display_name = 'Novo perfil'
  and p.avatar_url is null;

-- ------------------------------------------------------------
-- 5. Contadores (likes, saves, comments, follows)
-- ------------------------------------------------------------
create or replace function public.sync_post_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_post uuid;
  column_name text;
  delta integer;
begin
  if tg_table_name = 'likes' then
    column_name := 'likes_count';
  elsif tg_table_name = 'saves' then
    column_name := 'saves_count';
  else
    column_name := 'comments_count';
  end if;

  if tg_op = 'INSERT' then
    target_post := new.post_id;
    delta := 1;
  elsif tg_op = 'DELETE' then
    target_post := old.post_id;
    delta := -1;
  else
    return null;
  end if;

  execute format(
    'update public.posts set %I = greatest(0, %I + $1) where id = $2',
    column_name,
    column_name
  ) using delta, target_post;

  return null;
end;
$$;

drop trigger if exists likes_sync_counter on public.likes;
create trigger likes_sync_counter
  after insert or delete on public.likes
  for each row execute function public.sync_post_counter();

drop trigger if exists saves_sync_counter on public.saves;
create trigger saves_sync_counter
  after insert or delete on public.saves
  for each row execute function public.sync_post_counter();

drop trigger if exists comments_sync_counter on public.comments;
create trigger comments_sync_counter
  after insert or delete on public.comments
  for each row execute function public.sync_post_counter();

create or replace function public.sync_follow_counter()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    update public.profiles set following_count = following_count + 1 where id = new.follower_id;
    update public.profiles set followers_count = followers_count + 1 where id = new.following_id;
  elsif tg_op = 'DELETE' then
    update public.profiles set following_count = greatest(0, following_count - 1) where id = old.follower_id;
    update public.profiles set followers_count = greatest(0, followers_count - 1) where id = old.following_id;
  end if;
  return null;
end;
$$;

drop trigger if exists follows_sync_counter on public.follows;
create trigger follows_sync_counter
  after insert or delete on public.follows
  for each row execute function public.sync_follow_counter();

-- ------------------------------------------------------------
-- 6. Row Level Security
-- ------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.saves enable row level security;
alter table public.follows enable row level security;
alter table public.stories enable row level security;

-- Privilégios por coluna: o cliente nunca escreve contadores. Eles só mudam
-- pelos gatilhos, que rodam como o dono do schema.
revoke insert, update on table public.profiles from anon, authenticated;
grant insert (id, handle, display_name, bio, link, location, avatar_url)
  on public.profiles to authenticated;
grant update (display_name, handle, bio, link, location, avatar_url)
  on public.profiles to authenticated;

revoke insert, update on table public.posts from anon, authenticated;
grant insert (author_id, media_type, media_url, poster_url, caption, tags, location, audio, duration_seconds)
  on public.posts to authenticated;
grant update (caption, tags, location, audio)
  on public.posts to authenticated;

-- profiles: leitura pública, cada pessoa edita apenas a própria conta
drop policy if exists "profiles_select_public" on public.profiles;
create policy "profiles_select_public"
  on public.profiles for select
  using (true);

drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own"
  on public.profiles for insert
  to authenticated
  with check (id = auth.uid());

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own"
  on public.profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- posts: leitura pública, autor gerencia os próprios posts
drop policy if exists "posts_select_public" on public.posts;
create policy "posts_select_public"
  on public.posts for select
  using (true);

drop policy if exists "posts_insert_own" on public.posts;
create policy "posts_insert_own"
  on public.posts for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own"
  on public.posts for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own"
  on public.posts for delete
  to authenticated
  using (author_id = auth.uid());

-- comments: leitura pública, autoria própria para escrever/editar/apagar
drop policy if exists "comments_select_public" on public.comments;
create policy "comments_select_public"
  on public.comments for select
  using (true);

drop policy if exists "comments_insert_own" on public.comments;
create policy "comments_insert_own"
  on public.comments for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "comments_update_own" on public.comments;
create policy "comments_update_own"
  on public.comments for update
  to authenticated
  using (author_id = auth.uid())
  with check (author_id = auth.uid());

drop policy if exists "comments_delete_own" on public.comments;
create policy "comments_delete_own"
  on public.comments for delete
  to authenticated
  using (author_id = auth.uid());

-- likes: leitura pública (para hidratar estado), escrita apenas do próprio usuário
drop policy if exists "likes_select_public" on public.likes;
create policy "likes_select_public"
  on public.likes for select
  using (true);

drop policy if exists "likes_insert_own" on public.likes;
create policy "likes_insert_own"
  on public.likes for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "likes_delete_own" on public.likes;
create policy "likes_delete_own"
  on public.likes for delete
  to authenticated
  using (user_id = auth.uid());

-- saves: privados por padrão; cada pessoa vê e gerencia os próprios
drop policy if exists "saves_select_own" on public.saves;
create policy "saves_select_own"
  on public.saves for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "saves_insert_own" on public.saves;
create policy "saves_insert_own"
  on public.saves for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "saves_delete_own" on public.saves;
create policy "saves_delete_own"
  on public.saves for delete
  to authenticated
  using (user_id = auth.uid());

-- follows: leitura pública, escrita do próprio relacionamento
drop policy if exists "follows_select_public" on public.follows;
create policy "follows_select_public"
  on public.follows for select
  using (true);

drop policy if exists "follows_insert_own" on public.follows;
create policy "follows_insert_own"
  on public.follows for insert
  to authenticated
  with check (follower_id = auth.uid());

drop policy if exists "follows_delete_own" on public.follows;
create policy "follows_delete_own"
  on public.follows for delete
  to authenticated
  using (follower_id = auth.uid());

-- stories: leitura pública apenas enquanto não expiram, autoria própria
drop policy if exists "stories_select_public" on public.stories;
create policy "stories_select_public"
  on public.stories for select
  using (expires_at > now());

drop policy if exists "stories_insert_own" on public.stories;
create policy "stories_insert_own"
  on public.stories for insert
  to authenticated
  with check (author_id = auth.uid());

drop policy if exists "stories_delete_own" on public.stories;
create policy "stories_delete_own"
  on public.stories for delete
  to authenticated
  using (author_id = auth.uid());

-- ------------------------------------------------------------
-- 7. Storage (bucket público "media")
-- ------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'media',
  'media',
  true,
  52428800, -- 50 MB
  array['video/mp4', 'video/webm', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

-- leitura pública dos arquivos
drop policy if exists "media_select_public" on storage.objects;
create policy "media_select_public"
  on storage.objects for select
  using (bucket_id = 'media');

-- upload apenas dentro da própria pasta: media/<user_id>/...
drop policy if exists "media_insert_own_folder" on storage.objects;
create policy "media_insert_own_folder"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- atualização/remoção apenas dos próprios arquivos
drop policy if exists "media_update_own_folder" on storage.objects;
create policy "media_update_own_folder"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "media_delete_own_folder" on storage.objects;
create policy "media_delete_own_folder"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'media'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- ------------------------------------------------------------
-- 8. Realtime para comentários
-- ------------------------------------------------------------
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'comments'
  ) then
    execute 'alter publication supabase_realtime add table public.comments';
  end if;
end;
$$;
