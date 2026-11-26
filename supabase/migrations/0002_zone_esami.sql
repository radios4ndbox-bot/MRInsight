-- MRInsight · migrazione 0002: zona anatomica sugli esami (area MRI progress).
-- Da eseguire nel SQL Editor DOPO la 0001. Si può rieseguire senza danni.
-- Le policy RLS (proprietario + secondo fattore aal2) della 0001 restano valide e coprono anche la nuova colonna.

alter table public.exams
  add column if not exists zona text;

-- eventuali esami creati prima di questa migrazione finiscono in «neuro»: si possono spostare dopo
update public.exams set zona = 'neuro' where zona is null;

alter table public.exams
  alter column zona set not null;

alter table public.exams
  drop constraint if exists exams_zona_valida;
alter table public.exams
  add constraint exams_zona_valida check (zona in (
    'neuro', 'rachide', 'spalla', 'gomito-polso', 'cuore', 'fegato',
    'pancreas', 'reni', 'pelvi', 'anca', 'ginocchio', 'caviglia'
  ));

create index if not exists exams_utente_zona_idx on public.exams (user_id, zona, sort);
