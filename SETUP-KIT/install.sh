#!/usr/bin/env bash
# =====================================================================
#  LeadFlow CRM — instalador para VPS (Ubuntu 24.04)
#
#  Segue o material de instalação:
#    Passo 3 → chaves do Supabase     Passo 4 → domínio apontado
#    Passo 5 → instalação             Passo 6 → login de administrador
#
#  Uso (dentro da pasta do projeto, como root):
#    bash SETUP-KIT/install.sh
# =====================================================================
set -euo pipefail

cd "$(dirname "$0")/.."
ROOT="$(pwd)"

c_ok() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
c_err() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; }
c_step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ask() { # ask VAR "pergunta" [padrão]
  local __var=$1 __q=$2 __def=${3:-} __ans
  if [[ -n "$__def" ]]; then read -r -p "$__q [$__def]: " __ans; else read -r -p "$__q: " __ans; fi
  printf -v "$__var" '%s' "${__ans:-$__def}"
}
ask_secret() { # a senha/chave não aparece na tela — é proteção, não erro
  local __var=$1 __q=$2 __ans
  read -r -s -p "$__q (não aparece ao digitar): " __ans; echo
  printf -v "$__var" '%s' "$__ans"
}
json_get() { python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('$1',''))" 2>/dev/null; }

if [[ $EUID -ne 0 ]]; then c_err "Rode como root: sudo bash SETUP-KIT/install.sh"; exit 1; fi

cat <<'EOF'

  ██╗     ███████╗ █████╗ ██████╗ ███████╗██╗      ██████╗ ██╗    ██╗
  ██║     ██╔════╝██╔══██╗██╔══██╗██╔════╝██║     ██╔═══██╗██║    ██║
  ██║     █████╗  ███████║██║  ██║█████╗  ██║     ██║   ██║██║ █╗ ██║
  ██║     ██╔══╝  ██╔══██║██║  ██║██╔══╝  ██║     ██║   ██║██║███╗██║
  ███████╗███████╗██║  ██║██████╔╝██║     ███████╗╚██████╔╝╚███╔███╔╝
  ╚══════╝╚══════╝╚═╝  ╚═╝╚═════╝ ╚═╝     ╚══════╝ ╚═════╝  ╚══╝╚══╝
            CRM de WhatsApp com Agentes de IA — instalador

EOF

# ---------------------------------------------------------------------
c_step "1/7  Preparando o servidor"
# ---------------------------------------------------------------------
apt-get update -qq
apt-get install -y -qq curl ca-certificates git python3 unzip dnsutils >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando o Docker…"
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1 || true
docker compose version >/dev/null 2>&1 || { c_err "Docker Compose não encontrado."; exit 1; }
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp >/dev/null; ufw allow 443/tcp >/dev/null
fi
c_ok "Docker pronto"

# ---------------------------------------------------------------------
c_step "2/7  Domínio (passo 4 do material)"
# ---------------------------------------------------------------------
ask DOMAIN "Domínio do CRM (ex.: crm.suaempresa.com.br)"
DOMAIN="${DOMAIN#http://}"; DOMAIN="${DOMAIN#https://}"; DOMAIN="${DOMAIN%%/*}"
PUBLIC_IP="$(curl -fsS4 https://api.ipify.org 2>/dev/null || true)"
DNS_IP="$(dig +short A "$DOMAIN" | tail -n1 || true)"
if [[ -n "$PUBLIC_IP" && "$DNS_IP" == "$PUBLIC_IP" ]]; then
  c_ok "$DOMAIN aponta para este servidor ($PUBLIC_IP)"
else
  c_warn "$DOMAIN aponta para '${DNS_IP:-nada}', mas o IP desta VPS é '${PUBLIC_IP:-desconhecido}'."
  c_warn "Crie um registro A com o IP da VPS. Sem isso o certificado HTTPS não é emitido."
  ask CONT "Continuar mesmo assim? (s/N)" "n"
  [[ "$CONT" =~ ^[sS]$ ]] || exit 1
fi

# ---------------------------------------------------------------------
c_step "3/7  Supabase (passo 3 do material)"
# ---------------------------------------------------------------------
echo "Onde achar: Supabase → Configurações do projeto → API Keys"
while true; do
  ask SUPABASE_URL "URL do projeto (https://xxxx.supabase.co)"
  SUPABASE_URL="${SUPABASE_URL%/}"
  ask_secret SUPABASE_ANON_KEY "Chave pública (anon)"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/auth/v1/settings" -H "apikey: $SUPABASE_ANON_KEY" || true)
  [[ "$code" == "200" ]] && { c_ok "Chave pública válida"; break; }
  c_err "Não consegui validar a URL/chave pública (HTTP $code). Confira se não colou duas vezes ou a chave errada."
done
while true; do
  ask_secret SERVICE_ROLE "Chave service_role (chave-mestra — usada só agora, não fica salva)"
  code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/auth/v1/admin/users?per_page=1" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" || true)
  [[ "$code" == "200" ]] && { c_ok "Chave service_role válida"; break; }
  c_err "Chave recusada (HTTP $code). Será que colou a anon no lugar da service_role?"
done
echo "Onde achar: Project Overview → Connect → aba Session Pooler (troque [YOUR-PASSWORD] pela senha do banco)"
while true; do
  ask_secret DATABASE_URL "URL de conexão (Session Pooler)"
  if [[ "$DATABASE_URL" != *pooler* ]]; then c_err "A URL precisa conter 'pooler'. Se começa com 'db.', é a conexão direta — volte e selecione Session Pooler."; continue; fi
  if [[ "$DATABASE_URL" == *"[YOUR-PASSWORD]"* ]]; then c_err "Você esqueceu de trocar [YOUR-PASSWORD] pela senha do banco."; continue; fi
  break
done

# ---------------------------------------------------------------------
c_step "4/7  Inteligência artificial dos agentes"
# ---------------------------------------------------------------------
echo "  1) Anthropic (Claude)   2) OpenAI (GPT)   3) Configurar depois (agentes usam o motor local)"
ask AI_OPT "Escolha" "1"
AI_PROVIDER=anthropic; AI_API_KEY=""; AI_MODEL=claude-haiku-5-5
case "$AI_OPT" in
  1) ask_secret AI_API_KEY "Chave da API da Anthropic" ;;
  2) AI_PROVIDER=openai; AI_MODEL=gpt-4o-mini; ask_secret AI_API_KEY "Chave da API da OpenAI" ;;
  *) c_warn "Sem chave de IA: os agentes respondem pela base de conhecimento. Dá para configurar depois no .env." ;;
esac

# ---------------------------------------------------------------------
c_step "5/7  Banco de dados"
# ---------------------------------------------------------------------
docker run --rm -v "$ROOT/supabase:/sql:ro" postgres:16-alpine \
  psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f /sql/schema.sql
c_ok "Tabelas, regras de segurança (RLS) e tempo real configurados"

# ---------------------------------------------------------------------
c_step "6/7  Login de administrador (passo 6 do material)"
# ---------------------------------------------------------------------
ask ADMIN_NAME "Seu nome"
ask ADMIN_EMAIL "E-mail de login"
while true; do
  ask_secret ADMIN_PASS "Senha (mínimo 8 caracteres)"
  [[ ${#ADMIN_PASS} -ge 8 ]] && break
  c_err "Senha muito curta."
done
payload=$(ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASS="$ADMIN_PASS" python3 -c 'import json,os; print(json.dumps({"email":os.environ["ADMIN_EMAIL"],"password":os.environ["ADMIN_PASS"],"email_confirm":True}))')
resp=$(curl -s "$SUPABASE_URL/auth/v1/admin/users" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H 'content-type: application/json' -d "$payload")
ADMIN_ID=$(echo "$resp" | json_get id)
if [[ -z "$ADMIN_ID" ]]; then
  # usuário já existe? procura pelo e-mail
  ADMIN_ID=$(curl -s "$SUPABASE_URL/auth/v1/admin/users?per_page=1000" -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" |
    ADMIN_EMAIL="$ADMIN_EMAIL" python3 -c 'import sys,json,os; d=json.load(sys.stdin); print(next((u["id"] for u in d.get("users",[]) if u.get("email","").lower()==os.environ["ADMIN_EMAIL"].lower()),""))')
  [[ -n "$ADMIN_ID" ]] || { c_err "Não foi possível criar o usuário: $resp"; exit 1; }
  c_warn "Esse e-mail já existia no Supabase — vou usar o login existente."
fi
record=$(ADMIN_ID="$ADMIN_ID" ADMIN_NAME="$ADMIN_NAME" ADMIN_EMAIL="$ADMIN_EMAIL" python3 -c '
import json, os
u = {"id": os.environ["ADMIN_ID"], "name": os.environ["ADMIN_NAME"], "email": os.environ["ADMIN_EMAIL"],
     "role": "admin", "presence": "online", "departmentIds": ["dep-comercial"], "color": "#00a389"}
print(json.dumps({"collection": "users", "id": u["id"], "data": u}))')
code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/crm_records" \
  -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" -H 'content-type: application/json' \
  -H 'Prefer: resolution=merge-duplicates' -d "$record")
[[ "$code" =~ ^20 ]] || { c_err "Falha ao registrar o administrador na equipe (HTTP $code)."; exit 1; }
c_ok "Administrador $ADMIN_EMAIL pronto"
unset SERVICE_ROLE ADMIN_PASS

# ---------------------------------------------------------------------
c_step "7/7  Subindo o CRM"
# ---------------------------------------------------------------------
umask 077
cat > .env <<ENV
DOMAIN=$DOMAIN
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$SUPABASE_ANON_KEY
AI_PROVIDER=$AI_PROVIDER
AI_API_KEY=$AI_API_KEY
AI_MODEL=$AI_MODEL
ENV
chmod 600 .env
docker compose up -d --build
sleep 5
if curl -fsS "https://$DOMAIN/api/health" >/dev/null 2>&1; then c_ok "https://$DOMAIN respondendo"; else c_warn "O certificado HTTPS pode levar alguns minutos para sair. Recarregue depois."; fi

cat <<EOF

=====================================================================
  ✅ Instalação concluída

  Endereço:  https://$DOMAIN
  Login:     $ADMIN_EMAIL

  O que ainda falta você fazer:
   1. Entrar no CRM e concluir o onboarding (negócio, fuso, funil).
   2. Menu Conexões → Conectar novo WhatsApp.
   3. Mandar uma mensagem de outro número e responder pelo Inbox.
   4. Adicionar a equipe em Configurações → Equipe. Contas criadas fora
      do CRM não enxergam nenhum dado (regras de segurança do banco).

  Comandos úteis (nesta pasta):
   docker compose logs -f app     # ver logs
   docker compose up -d --build   # atualizar depois de mudar o código/.env
=====================================================================
EOF
