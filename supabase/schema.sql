-- Fluxo · estrutura do banco no Supabase (rode no SQL Editor uma única vez)

-- Todos os dados do app ficam numa tabela de "documentos", no mesmo formato que o painel já usa:
-- coleções transacoes, saldos, contasFixas, orcamentos, metas e config.
create table if not exists public.docs (
  colecao    text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (colecao, id)
);

-- Quem é da família (só esses e-mails leem e escrevem)
create table if not exists public.familia (
  email text primary key
);
-- Troque pelos e-mails reais:
-- insert into public.familia (email) values ('email-do-sergio@exemplo.com'), ('email-da-ana-paula@exemplo.com');

alter table public.docs enable row level security;
alter table public.familia enable row level security;

create or replace function public.eh_familia() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.familia f where lower(f.email) = lower(auth.jwt() ->> 'email'));
$$;

drop policy if exists "familia le" on public.docs;
drop policy if exists "familia escreve" on public.docs;
create policy "familia le" on public.docs for select using (public.eh_familia());
create policy "familia escreve" on public.docs for all using (public.eh_familia()) with check (public.eh_familia());

-- Atualização ao vivo entre os celulares
alter publication supabase_realtime add table public.docs;

-- Pasta de prints (fotos dos comprovantes)
insert into storage.buckets (id, name, public) values ('prints', 'prints', false) on conflict do nothing;
drop policy if exists "familia prints" on storage.objects;
create policy "familia prints" on storage.objects for all
  using (bucket_id = 'prints' and public.eh_familia())
  with check (bucket_id = 'prints' and public.eh_familia());
