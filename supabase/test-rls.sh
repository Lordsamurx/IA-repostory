#!/usr/bin/env bash
# Teste do RLS do LeadFlow CRM em um PostgreSQL 16 local e temporário.
#
# O que faz:
#   1. sobe um PostgreSQL 16 em porta alta (5499), aceitando só conexão por socket;
#   2. cria os papéis e a função auth.uid() que o Supabase oferece;
#   3. aplica supabase/schema.sql DUAS vezes (as duas execuções precisam passar);
#   4. confere o que estranho, atendente, admin e o papel anônimo podem fazer;
#   5. para o servidor e apaga tudo, mesmo quando uma verificação falha.
#
# Sai com código diferente de zero se qualquer verificação falhar.
# Uso: bash supabase/test-rls.sh      (ou: npm run test:rls)
set -euo pipefail

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PGBIN="${PGBIN:-/usr/lib/postgresql/16/bin}"
PORT="${RLS_TEST_PORT:-5499}"
WORK="$(mktemp -d "${TMPDIR:-/tmp}/leadflow-rls.XXXXXX")"
PGDATA="$WORK/data"
SOCKDIR="$WORK/sock"
LOG="$WORK/postgres.log"
PSQL_OUT="$WORK/psql.out"

# Comandos de banco rodam como o usuário postgres (o initdb recusa root).
run_pg() {
  if [[ "$(id -un)" == "postgres" ]]; then
    bash -c "$1"
  else
    su -s /bin/bash -c "$1" postgres
  fi
}

cleanup() {
  local code=$?
  if [[ $code -ne 0 && -f "$LOG" ]]; then
    echo "--- últimas linhas do log do PostgreSQL ---" >&2
    tail -n 20 "$LOG" >&2 || true
  fi
  run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -m immediate stop >/dev/null 2>&1 || true"
  rm -rf "$WORK"
  exit "$code"
}
trap cleanup EXIT

if [[ ! -x "$PGBIN/initdb" ]]; then
  echo "PostgreSQL 16 não encontrado em $PGBIN (defina PGBIN=/caminho/para/bin)." >&2
  exit 2
fi
if [[ "$(id -u)" -eq 0 ]]; then
  chown postgres:postgres "$WORK"
fi
run_pg "mkdir -p '$SOCKDIR'"

cp "$HERE/schema.sql" "$WORK/schema.sql"

# ------------------------------------------------------------------ SQL do teste
cat > "$WORK/setup.sql" <<'SQL'
-- Papéis e auth.uid() como no Supabase (antes do schema)
create role anon nologin;
create role authenticated nologin;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('test.uid', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated;
create publication supabase_realtime;
SQL

cat > "$WORK/grants.sql" <<'SQL'
grant usage on schema public to anon, authenticated;
grant all on public.crm_records to authenticated;
SQL

cat > "$WORK/checks.sql" <<'SQL'
-- ---------------------------------------------------------------- auxiliares (pg_temp: só nesta sessão)
-- Executa como o papel informado, com auth.uid() = p_uid. Devolve linhas afetadas e o erro (se houve).
create function pg_temp.exec_as(p_role text, p_uid text, p_sql text, out affected bigint, out err text)
language plpgsql as $$
begin
  affected := 0;
  err := null;
  execute format('set local role %I', p_role);
  perform set_config('test.uid', coalesce(p_uid, ''), true);
  begin
    execute p_sql;
    get diagnostics affected = row_count;
  exception when others then
    err := sqlerrm;
  end;
  reset role;
end $$;

-- Consulta escalar como o papel informado.
create function pg_temp.scalar_as(p_role text, p_uid text, p_sql text) returns text
language plpgsql as $$
declare v text;
begin
  execute format('set local role %I', p_role);
  perform set_config('test.uid', coalesce(p_uid, ''), true);
  execute p_sql into v;
  reset role;
  return v;
end $$;

-- Verdadeiro se a operação foi aceita E afetou exatamente 1 linha.
create function pg_temp.ok_as(p_role text, p_uid text, p_sql text) returns boolean
language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.exec_as(p_role, p_uid, p_sql);
  return r.err is null and r.affected = 1;
end $$;

-- Verdadeiro se a operação foi bloqueada: erro OU nenhuma linha afetada (a RLS filtra em silêncio).
create function pg_temp.blocked_as(p_role text, p_uid text, p_sql text) returns boolean
language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.exec_as(p_role, p_uid, p_sql);
  return r.err is not null or r.affected = 0;
end $$;

-- Mensagem de erro (ou null).
create function pg_temp.err_as(p_role text, p_uid text, p_sql text) returns text
language plpgsql as $$
declare r record;
begin
  select * into r from pg_temp.exec_as(p_role, p_uid, p_sql);
  return r.err;
end $$;

create function pg_temp.check(p_ok boolean, p_msg text) returns void
language plpgsql as $$
begin
  if p_ok is not true then
    raise exception 'FALHA: %', p_msg;
  end if;
  raise notice 'OK: %', p_msg;
end $$;

-- ---------------------------------------------------------------- dados iniciais (como o instalador: contorna a RLS)
insert into public.crm_records (collection, id, data) values
  ('users',       '11111111-1111-4111-8111-111111111111', '{"name":"Admin","role":"admin","presence":"online"}'),
  ('users',       '22222222-2222-4222-8222-222222222222', '{"name":"Atendente","role":"atendente","presence":"offline"}'),
  ('settings',    'main',   '{"companyName":"Clinica Teste"}'),
  ('connections', 'conn-1', '{"name":"WhatsApp 1"}');

-- ---------------------------------------------------------------- estranho: logado, mas fora da equipe
select pg_temp.check(pg_temp.scalar_as('authenticated', '33333333-3333-4333-8333-333333333333',
  'select count(*)::text from public.crm_records')::int = 0, 'estranho não lê nenhum registro');
select pg_temp.check(pg_temp.blocked_as('authenticated', '33333333-3333-4333-8333-333333333333',
  $q$insert into public.crm_records (collection, id, data) values ('contacts', 'ctt-estranho', '{}')$q$),
  'estranho não consegue criar contato');
select pg_temp.check(pg_temp.blocked_as('authenticated', '33333333-3333-4333-8333-333333333333',
  $q$insert into public.crm_records (collection, id, data) values ('users', '33333333-3333-4333-8333-333333333333', '{"role":"admin"}')$q$),
  'estranho não consegue se cadastrar na equipe como admin');
select pg_temp.check((select count(*) from public.crm_records where collection = 'users') = 2,
  'a equipe continua com 2 pessoas (nada foi inserido por estranho)');

-- ---------------------------------------------------------------- atendente
select pg_temp.check(pg_temp.scalar_as('authenticated', '22222222-2222-4222-8222-222222222222',
  'select count(*)::text from public.crm_records')::int = 4, 'atendente lê os registros da equipe (4 linhas)');
select pg_temp.check(pg_temp.blocked_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$insert into public.crm_records (collection, id, data) values ('users', '44444444-4444-4444-8444-444444444444', '{"role":"atendente"}')$q$),
  'atendente não consegue cadastrar outra pessoa na equipe');
select pg_temp.check(pg_temp.ok_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$insert into public.crm_records (collection, id, data) values ('messages', 'msg-1', '{"conversationId":"cnv-1","body":"oi"}')$q$),
  'atendente cria mensagem');
select pg_temp.check(pg_temp.ok_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$update public.crm_records set data = jsonb_set(data, '{presence}', '"ausente"') where collection = 'users' and id = '22222222-2222-4222-8222-222222222222'$q$),
  'atendente atualiza a própria presença');
select pg_temp.check((select data->>'presence' from public.crm_records
  where collection = 'users' and id = '22222222-2222-4222-8222-222222222222') = 'ausente', 'a presença nova foi gravada');
select pg_temp.check(pg_temp.err_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$update public.crm_records set data = jsonb_set(data, '{role}', '"admin"') where collection = 'users' and id = '22222222-2222-4222-8222-222222222222'$q$)
  like '%Somente administradores%', 'atendente NÃO vira admin (o gatilho recusa)');
select pg_temp.check((select data->>'role' from public.crm_records
  where collection = 'users' and id = '22222222-2222-4222-8222-222222222222') = 'atendente', 'o perfil do atendente continua atendente');
select pg_temp.check(pg_temp.blocked_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$update public.crm_records set data = jsonb_set(data, '{name}', '"Invasor"') where collection = 'users' and id = '11111111-1111-4111-8111-111111111111'$q$),
  'atendente não altera o perfil de outra pessoa');
select pg_temp.check(pg_temp.blocked_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$update public.crm_records set data = jsonb_set(data, '{companyName}', '"Invasor"') where collection = 'settings'$q$),
  'atendente NÃO altera settings');
select pg_temp.check((select data->>'companyName' from public.crm_records where collection = 'settings') = 'Clinica Teste',
  'as configurações continuam como o admin deixou');
select pg_temp.check(pg_temp.blocked_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$insert into public.crm_records (collection, id, data) values ('settings', 'outra', '{}')$q$),
  'atendente não cria configurações');
select pg_temp.check(pg_temp.blocked_as('authenticated', '22222222-2222-4222-8222-222222222222',
  $q$delete from public.crm_records where collection = 'connections'$q$),
  'atendente não exclui conexões');

-- ---------------------------------------------------------------- admin
select pg_temp.check(pg_temp.ok_as('authenticated', '11111111-1111-4111-8111-111111111111',
  $q$insert into public.crm_records (collection, id, data) values ('contacts', 'ctt-1', '{"name":"Ana"}')$q$),
  'admin cria contato');
select pg_temp.check(pg_temp.ok_as('authenticated', '11111111-1111-4111-8111-111111111111',
  $q$insert into public.crm_records (collection, id, data) values ('users', '44444444-4444-4444-8444-444444444444', '{"name":"Novo","role":"atendente"}')$q$),
  'admin cadastra usuário na equipe');
select pg_temp.check(pg_temp.ok_as('authenticated', '11111111-1111-4111-8111-111111111111',
  $q$update public.crm_records set data = jsonb_set(data, '{companyName}', '"Clinica Teste Admin"') where collection = 'settings'$q$),
  'admin altera settings');
select pg_temp.check(pg_temp.ok_as('authenticated', '11111111-1111-4111-8111-111111111111',
  $q$update public.crm_records set data = jsonb_set(data, '{role}', '"supervisor"') where collection = 'users' and id = '44444444-4444-4444-8444-444444444444'$q$),
  'admin altera o perfil de outra pessoa');
select pg_temp.check(pg_temp.ok_as('authenticated', '11111111-1111-4111-8111-111111111111',
  $q$delete from public.crm_records where collection = 'connections' and id = 'conn-1'$q$),
  'admin exclui conexão');

-- ---------------------------------------------------------------- papel anônimo e funções
select pg_temp.check(pg_temp.err_as('anon', null, 'select 1 from public.crm_records') like '%permission denied%',
  'anônimo não acessa a tabela');
select pg_temp.check(pg_temp.err_as('anon', null,
  $q$insert into public.crm_records (collection, id, data) values ('settings', 'x', '{}')$q$) is not null,
  'anônimo não grava nada');
select pg_temp.check(has_function_privilege('anon', 'public.crm_is_member()', 'EXECUTE') = false,
  'anônimo não executa crm_is_member()');
select pg_temp.check(has_function_privilege('authenticated', 'public.crm_is_member()', 'EXECUTE') = true,
  'sessão logada executa crm_is_member() (usada pelas políticas)');

-- ---------------------------------------------------------------- estrutura
select pg_temp.check((select relrowsecurity from pg_class where oid = 'public.crm_records'::regclass),
  'RLS está ativo na tabela crm_records');
select pg_temp.check((select count(*) from pg_policies where schemaname = 'public' and tablename = 'crm_records') = 4,
  'existem exatamente 4 políticas (sem duplicar na 2ª execução do schema)');
select pg_temp.check(exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'crm_records'),
  'a tabela está na publicação do Realtime');
select pg_temp.check((select bool_and(position('search_path' in array_to_string(proconfig, ',')) > 0)
  from pg_proc where pronamespace = 'public'::regnamespace and proname in ('crm_is_member', 'crm_is_admin', 'crm_touch')),
  'funções SECURITY DEFINER têm search_path fixado');
select pg_temp.check(true, 'o schema foi aplicado duas vezes sem erro');
SQL

cat > "$WORK/run.sql" <<SQL
\set ON_ERROR_STOP on
\echo == Papéis e auth.uid() como no Supabase
\i $WORK/setup.sql
\echo == Schema (1ª execução)
\i $WORK/schema.sql
\echo == Schema (2ª execução: precisa passar sem erro)
\i $WORK/schema.sql
\echo == Permissões de teste
\i $WORK/grants.sql
\echo == Verificações
\i $WORK/checks.sql
SQL
chmod 644 "$WORK"/*.sql

# ------------------------------------------------------------------ execução
run_pg "'$PGBIN/initdb' -D '$PGDATA' -U postgres -A trust -E UTF8 --no-locale > '$WORK/initdb.log' 2>&1"
run_pg "'$PGBIN/pg_ctl' -D '$PGDATA' -l '$LOG' -w -t 60 -o \"-p $PORT -k '$SOCKDIR' -c listen_addresses=''\" start > /dev/null"

if ! run_pg "'$PGBIN/psql' -X -h '$SOCKDIR' -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -f '$WORK/run.sql' > '$PSQL_OUT' 2>&1"; then
  echo "FALHOU: alguma verificação de RLS não passou:" >&2
  grep -E 'FALHA|ERROR|erro' "$PSQL_OUT" | head -n 20 >&2 || cat "$PSQL_OUT" >&2
  exit 1
fi

echo "Verificações de RLS (PostgreSQL 16 temporário):"
grep 'NOTICE:  OK: ' "$PSQL_OUT" | sed 's/^.*NOTICE:  OK: /  [OK] /'
total=$(grep -c 'NOTICE:  OK: ' "$PSQL_OUT" || true)
if [[ "$total" -eq 0 ]]; then
  echo "FALHOU: nenhuma verificação executada" >&2
  exit 1
fi
echo "RLS: $total verificações passaram."
