-- ══════════════════════════════════════════════════════════════════
-- MRInsight · migrazione 0001 — schema, RLS, storage
-- Da eseguire una volta nel SQL Editor di Supabase (Run).
-- È idempotente dove possibile: rieseguirla non duplica nulla.
--
-- Principi:
--   • ogni riga appartiene a un utente (user_id = auth.uid())
--   • policy PERMISSIVE sul proprietario + policy RESTRICTIVE sul
--     secondo fattore: senza aal2 non si legge né si scrive nulla
--   • il controllo del secondo fattore sta in UNA funzione
--     (private.is_strong_auth) per poter accettare in futuro
--     passkey o l'app con QR senza riscrivere le policy
--   • nessun accesso per il ruolo anon, salvo la funzione ping()
-- ══════════════════════════════════════════════════════════════════

-- ─────────────── schema privato e funzione di controllo ───────────────
create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_strong_auth()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt() ->> 'aal') = 'aal2', false)
$$;
revoke all on function private.is_strong_auth() from public, anon;
grant execute on function private.is_strong_auth() to authenticated;

create or replace function private.tocca_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ─────────────── tipi ───────────────
do $$ begin
  create type public.page_kind as enum ('referto', 'protocollo', 'appunti', 'score');
exception when duplicate_object then null; end $$;

-- ─────────────── tabelle ───────────────
create table if not exists public.exams (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  slug        text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title       text not null check (length(title) between 1 and 120),
  description text,
  sort        int  not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, slug)
);

create table if not exists public.pages (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_id    uuid not null references public.exams (id) on delete cascade,
  kind       public.page_kind not null,
  title      text not null check (length(title) between 1 and 160),
  sort       int  not null default 0,
  content    jsonb not null default '{"v":1,"blocks":[]}'::jsonb
             check (jsonb_typeof(content) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.page_revisions (
  id         bigint generated always as identity primary key,
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  page_id    uuid not null references public.pages (id) on delete cascade,
  title      text not null,
  content    jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.media (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  exam_id      uuid references public.exams (id) on delete set null,
  storage_path text not null unique,
  mime         text not null,
  bytes        int,
  width        int,
  height       int,
  caption      text,
  created_at   timestamptz not null default now()
);

create index if not exists exams_user_idx          on public.exams (user_id, sort);
create index if not exists pages_user_idx          on public.pages (user_id);
create index if not exists pages_exam_idx          on public.pages (exam_id, kind, sort);
create index if not exists page_revisions_page_idx on public.page_revisions (page_id, created_at desc);
create index if not exists page_revisions_user_idx on public.page_revisions (user_id);
create index if not exists media_user_idx          on public.media (user_id);
create index if not exists media_exam_idx          on public.media (exam_id);

drop trigger if exists exams_updated_at on public.exams;
create trigger exams_updated_at before update on public.exams
  for each row execute function private.tocca_updated_at();
drop trigger if exists pages_updated_at on public.pages;
create trigger pages_updated_at before update on public.pages
  for each row execute function private.tocca_updated_at();

-- cronologia: a ogni modifica del contenuto salva la versione precedente,
-- tenendo le ultime 50 per pagina
create or replace function private.salva_revisione()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.content is distinct from old.content or new.title is distinct from old.title then
    insert into public.page_revisions (user_id, page_id, title, content)
    values (old.user_id, old.id, old.title, old.content);
    delete from public.page_revisions r
     where r.page_id = old.id
       and r.id not in (select r2.id from public.page_revisions r2
                         where r2.page_id = old.id
                         order by r2.created_at desc, r2.id desc
                         limit 50);
  end if;
  return new;
end;
$$;
drop trigger if exists pages_revisione on public.pages;
create trigger pages_revisione after update on public.pages
  for each row execute function private.salva_revisione();

-- ─────────────── privilegi ───────────────
-- Supabase concede di default ALL ad anon e authenticated sulle nuove tabelle:
-- si toglie tutto (TRUNCATE scavalcherebbe la RLS) e si ridà solo il necessario.
revoke all on public.exams, public.pages, public.page_revisions, public.media from anon, authenticated;
grant select, insert, update, delete on public.exams, public.pages, public.media to authenticated;
grant select, insert, delete on public.page_revisions to authenticated;

-- ─────────────── RLS ───────────────
alter table public.exams          enable row level security;
alter table public.pages          enable row level security;
alter table public.page_revisions enable row level security;
alter table public.media          enable row level security;

do $$
declare t text;
begin
  foreach t in array array['exams', 'pages', 'page_revisions', 'media'] loop
    execute format('drop policy if exists proprietario on public.%I', t);
    execute format('drop policy if exists secondo_fattore on public.%I', t);
    -- permissiva: solo le proprie righe
    execute format($p$
      create policy proprietario on public.%I
        for all to authenticated
        using (user_id = (select auth.uid()))
        with check (user_id = (select auth.uid()))
    $p$, t);
    -- restrittiva: sempre e comunque secondo fattore verificato
    execute format($p$
      create policy secondo_fattore on public.%I
        as restrictive
        for all to authenticated
        using ((select private.is_strong_auth()))
        with check ((select private.is_strong_auth()))
    $p$, t);
  end loop;
end $$;

-- le pagine possono appartenere solo a esami propri
create or replace function private.esame_proprio(e uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from public.exams x where x.id = e and x.user_id = (select auth.uid()))
$$;
revoke all on function private.esame_proprio(uuid) from public, anon;
grant execute on function private.esame_proprio(uuid) to authenticated;

drop policy if exists esame_coerente on public.pages;
create policy esame_coerente on public.pages
  as restrictive
  for all to authenticated
  using (true)
  with check (private.esame_proprio(exam_id));

-- ─────────────── storage: bucket privato per le immagini ───────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('media', 'media', false, 10485760, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "media: proprietario legge"     on storage.objects;
drop policy if exists "media: proprietario carica"    on storage.objects;
drop policy if exists "media: proprietario aggiorna"  on storage.objects;
drop policy if exists "media: proprietario elimina"   on storage.objects;
drop policy if exists "media: secondo fattore"        on storage.objects;

-- percorso obbligato: <user_id>/<file>
create policy "media: proprietario legge" on storage.objects
  for select to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: proprietario carica" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: proprietario aggiorna" on storage.objects
  for update to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "media: proprietario elimina" on storage.objects
  for delete to authenticated
  using (bucket_id = 'media' and (storage.foldername(name))[1] = (select auth.uid())::text);
-- restrittiva, limitata al bucket media per non toccare altri bucket
create policy "media: secondo fattore" on storage.objects
  as restrictive
  for all to authenticated
  using (bucket_id <> 'media' or (select private.is_strong_auth()))
  with check (bucket_id <> 'media' or (select private.is_strong_auth()));

-- ─────────────── keep-alive (piano Free) ───────────────
-- Unica funzione accessibile senza login: non legge nessun dato.
create or replace function public.ping()
returns timestamptz
language sql
stable
security invoker
set search_path = ''
as $$ select now() $$;
revoke all on function public.ping() from public;
grant execute on function public.ping() to anon, authenticated;
