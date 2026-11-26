-- MRInsight · migrazione 0003: pagine di appunti annidate (MRI progress).
-- Da eseguire nel SQL Editor DOPO la 0002. Si può rieseguire senza danni.
-- Le policy della 0001 (proprietario + secondo fattore aal2 + esame proprio) restano valide.

-- ─────────────── sottopagine ───────────────
alter table public.pages
  add column if not exists parent_id uuid references public.pages (id) on delete cascade;

alter table public.pages
  alter column kind set default 'appunti';

alter table public.pages
  drop constraint if exists pages_non_padre_di_se;
alter table public.pages
  add constraint pages_non_padre_di_se check (parent_id is null or parent_id <> id);

create index if not exists pages_albero_idx on public.pages (exam_id, parent_id, sort);

-- la pagina padre deve essere propria e dello stesso esame
create or replace function private.padre_coerente(padre uuid, esame uuid)
returns boolean
language sql
stable
set search_path = ''
as $$
  select padre is null or exists (
    select 1 from public.pages p
     where p.id = padre and p.exam_id = esame and p.user_id = (select auth.uid())
  )
$$;
revoke all on function private.padre_coerente(uuid, uuid) from public, anon;
grant execute on function private.padre_coerente(uuid, uuid) to authenticated;

drop policy if exists padre_coerente on public.pages;
create policy padre_coerente on public.pages
  as restrictive
  for all to authenticated
  using (true)
  with check (private.padre_coerente(parent_id, exam_id));

-- ─────────────── cronologia meno fitta ───────────────
-- con il salvataggio automatico ogni modifica arriva al database:
-- si salva una versione precedente solo se l'ultima ha più di 10 minuti
-- (o se cambia il titolo), tenendo sempre le ultime 50 per pagina.
create or replace function private.salva_revisione()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  ultima timestamptz;
begin
  if new.content is distinct from old.content or new.title is distinct from old.title then
    select max(r.created_at) into ultima from public.page_revisions r where r.page_id = old.id;
    if ultima is null or ultima < now() - interval '10 minutes' or new.title is distinct from old.title then
      insert into public.page_revisions (user_id, page_id, title, content)
      values (old.user_id, old.id, old.title, old.content);
      delete from public.page_revisions r
       where r.page_id = old.id
         and r.id not in (select r2.id from public.page_revisions r2
                           where r2.page_id = old.id
                           order by r2.created_at desc, r2.id desc
                           limit 50);
    end if;
  end if;
  return new;
end;
$$;
