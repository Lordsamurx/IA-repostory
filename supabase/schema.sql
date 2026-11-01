-- =====================================================================
-- LeadFlow CRM — esquema do banco (Supabase / PostgreSQL)
--
-- Cada registro do CRM (contato, conversa, mensagem, negócio, etc.) é
-- uma linha em crm_records, identificada por (collection, id), com o
-- conteúdo em JSONB. A sincronização em tempo real usa o Supabase Realtime.
--
-- Segurança (RLS):
--   * Só quem está cadastrado na equipe (collection = 'users') lê ou grava.
--     Uma pessoa qualquer que crie conta no Auth não enxerga nada.
--   * Configurações, conexões e usuários só podem ser alterados por admin.
--     Cada usuário pode atualizar o próprio registro (ex.: status online),
--     mas não pode mudar o próprio perfil de acesso.
--
-- É seguro rodar este arquivo mais de uma vez.
-- =====================================================================

create table if not exists public.crm_records (
  collection  text        not null,
  id          text        not null,
  data        jsonb       not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid                 default auth.uid(),
  primary key (collection, id)
);

create index if not exists crm_records_collection_idx on public.crm_records (collection);
create index if not exists crm_records_conversation_idx
  on public.crm_records ((data->>'conversationId'))
  where collection = 'messages';

-- ---------------------------------------------------------------------
-- Funções auxiliares (security definer evita recursão nas políticas)
-- ---------------------------------------------------------------------
-- O login (Supabase Auth) é vinculado ao usuário da equipe pelo ID ou pelo e-mail.
-- Com o cadastro aberto desligado (recomendado), só o admin cria logins no painel do
-- Supabase, então o e-mail do token é confiável. Com cadastro aberto, a confirmação de
-- e-mail (padrão do Supabase) impede que alguém entre com o e-mail de outra pessoa.
create or replace function public.crm_my_user_id()
returns text
language sql stable security definer set search_path = ''
as $$
  select id from public.crm_records
  where collection = 'users'
    and (
      id = auth.uid()::text
      or (
        coalesce(auth.jwt()->>'email', '') <> ''
        and lower(data->>'email') = lower(auth.jwt()->>'email')
      )
    )
  order by (id = auth.uid()::text) desc
  limit 1;
$$;

create or replace function public.crm_is_member()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select public.crm_my_user_id() is not null;
$$;

create or replace function public.crm_is_admin()
returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1 from public.crm_records
    where collection = 'users' and id = public.crm_my_user_id() and data->>'role' = 'admin'
  );
$$;

-- Funções de segurança: só a sessão logada as executa (as políticas precisam delas).
-- search_path vazio impede que um objeto criado num schema qualquer sequestre a função.
revoke all on function public.crm_my_user_id() from public, anon;
grant execute on function public.crm_my_user_id() to authenticated;
revoke all on function public.crm_is_member() from public, anon;
revoke all on function public.crm_is_admin() from public, anon;
grant execute on function public.crm_is_member() to authenticated;
grant execute on function public.crm_is_admin() to authenticated;

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
alter table public.crm_records enable row level security;
-- O papel anônimo não acessa a tabela; a sessão logada só faz o que as políticas permitem.
revoke all on public.crm_records from anon;
grant select, insert, update, delete on public.crm_records to authenticated;

drop policy if exists "equipe le"          on public.crm_records;
drop policy if exists "equipe cria"        on public.crm_records;
drop policy if exists "equipe atualiza"    on public.crm_records;
drop policy if exists "equipe exclui"      on public.crm_records;

create policy "equipe le" on public.crm_records
  for select to authenticated
  using (public.crm_is_member());

create policy "equipe cria" on public.crm_records
  for insert to authenticated
  with check (
    public.crm_is_member()
    and (collection not in ('users', 'settings', 'connections') or public.crm_is_admin())
  );

create policy "equipe atualiza" on public.crm_records
  for update to authenticated
  using (
    public.crm_is_member()
    and (
      collection not in ('users', 'settings', 'connections')
      or public.crm_is_admin()
      or (collection = 'users' and id = public.crm_my_user_id())
    )
  )
  with check (public.crm_is_member());

create policy "equipe exclui" on public.crm_records
  for delete to authenticated
  using (
    public.crm_is_member()
    and (collection not in ('users', 'settings', 'connections') or public.crm_is_admin())
  );

-- ---------------------------------------------------------------------
-- Gatilhos: data de atualização e proteção do perfil de acesso
-- ---------------------------------------------------------------------
create or replace function public.crm_touch()
returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  -- quem não é admin não pode mudar o próprio perfil (atendente → admin)
  if tg_op = 'UPDATE'
     and new.collection = 'users'
     and auth.uid() is not null
     and not public.crm_is_admin()
     and (new.data->>'role') is distinct from (old.data->>'role') then
    raise exception 'Somente administradores podem alterar o perfil de acesso';
  end if;
  -- nem o próprio e-mail (é ele que vincula o login ao usuário da equipe)
  if tg_op = 'UPDATE'
     and new.collection = 'users'
     and auth.uid() is not null
     and not public.crm_is_admin()
     and lower(coalesce(new.data->>'email', '')) is distinct from lower(coalesce(old.data->>'email', '')) then
    raise exception 'Somente administradores podem alterar o e-mail de login';
  end if;
  return new;
end;
$$;

-- Gatilhos não são chamados pelo cliente
revoke all on function public.crm_touch() from public, anon, authenticated;

drop trigger if exists crm_records_touch on public.crm_records;
create trigger crm_records_touch
  before insert or update on public.crm_records
  for each row execute function public.crm_touch();

-- ---------------------------------------------------------------------
-- Realtime: mudanças chegam na hora para todos os atendentes
-- ---------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'crm_records'
  ) then
    alter publication supabase_realtime add table public.crm_records;
  end if;
end $$;
