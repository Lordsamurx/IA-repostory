#!/usr/bin/env bash
# =====================================================================
#  LeadFlow CRM — liga a automação 24 h e o WhatsApp real (Evolution API)
#
#  Uso (na pasta do projeto, como root, depois do install.sh):
#    sudo bash SETUP-KIT/whatsapp.sh            # configura e reinicia o CRM
#    sudo bash SETUP-KIT/whatsapp.sh --no-restart   (usado pelo install.sh)
#
#  O que faz no .env:
#   1. SUPABASE_SERVICE_ROLE_KEY → o servidor passa a rodar chatbot, IA,
#      follow-ups e disparos 24 h, sem depender de um navegador aberto.
#   2. EVOLUTION_API_URL / EVOLUTION_API_KEY → gateway de WhatsApp por QR Code,
#      numa Evolution que você já tem (ex.: a de teste) ou numa nova, nesta VPS.
#   3. WHATSAPP_WEBHOOK_TOKEN → segredo que a Evolution usa para chamar o CRM.
# =====================================================================
set -euo pipefail
cd "$(dirname "$0")/.."

c_ok() { printf '\033[32m✔ %s\033[0m\n' "$*"; }
c_warn() { printf '\033[33m⚠ %s\033[0m\n' "$*"; }
c_err() { printf '\033[31m✖ %s\033[0m\n' "$*" >&2; }
c_step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }
ask() { local __var=$1 __q=$2 __def=${3:-} __ans
  if [[ -n "$__def" ]]; then read -r -p "$__q [$__def]: " __ans; else read -r -p "$__q: " __ans; fi
  printf -v "$__var" '%s' "${__ans:-$__def}"; }
ask_secret() { local __var=$1 __q=$2 __ans
  read -r -s -p "$__q (não aparece ao digitar): " __ans; echo
  printf -v "$__var" '%s' "$__ans"; }
env_get() { { grep -E "^$1=" .env 2>/dev/null || true; } | tail -n1 | cut -d= -f2- | sed 's/^"//; s/"$//'; }
# grava/atualiza uma variável no .env sem tocar nas outras (valor nunca passa pela linha de comando do sed)
env_set() {
  KEY="$1" VAL="$2" python3 - <<'PY'
import os, re
k, v = os.environ["KEY"], os.environ["VAL"]
lines = open(".env", encoding="utf8").read().splitlines() if os.path.exists(".env") else []
lines = [l for l in lines if not re.match(rf"^{re.escape(k)}=", l)]
lines.append(f"{k}={v}")
open(".env", "w", encoding="utf8").write("\n".join(lines) + "\n")
PY
}
rand() { python3 -c 'import secrets; print(secrets.token_hex(32))'; }

[[ $EUID -eq 0 ]] || { c_err "Rode como root: sudo bash SETUP-KIT/whatsapp.sh"; exit 1; }
[[ -f .env ]] || { c_err "Arquivo .env não encontrado. Rode primeiro: sudo bash SETUP-KIT/install.sh"; exit 1; }
umask 077

SUPABASE_URL="$(env_get VITE_SUPABASE_URL)"; SUPABASE_URL="${SUPABASE_URL%/}"
DOMAIN="$(env_get DOMAIN)"

# ---------------------------------------------------------------------
c_step "1/3  Automação 24 h no servidor"
# ---------------------------------------------------------------------
cat <<'EOF'
  Sem isto, chatbot, IA, follow-ups e disparos só funcionam com um
  administrador logado no navegador. Com isto, o servidor faz tudo sozinho.
  Para isso ele guarda a chave service_role do Supabase no .env (permissão 600,
  só o root lê; ela nunca vai para o navegador).
EOF
CUR_SR="$(env_get SUPABASE_SERVICE_ROLE_KEY)"
if [[ -n "$CUR_SR" ]]; then
  c_ok "Já configurada."
  ask REDO "Trocar a chave service_role? (s/N)" "n"
else
  REDO=s
fi
if [[ "$REDO" =~ ^[sS]$ ]]; then
  while true; do
    ask_secret SERVICE_ROLE "Chave service_role (Supabase → Configurações do projeto → API Keys; Enter = pular)"
    [[ -z "$SERVICE_ROLE" ]] && { c_warn "Sem a service_role: a automação continua no navegador do administrador."; break; }
    code=$(curl -s -o /dev/null -w '%{http_code}' "$SUPABASE_URL/rest/v1/crm_records?select=id&limit=1" \
      -H "apikey: $SERVICE_ROLE" -H "Authorization: Bearer $SERVICE_ROLE" || true)
    if [[ "$code" == "200" ]]; then env_set SUPABASE_SERVICE_ROLE_KEY "$SERVICE_ROLE"; c_ok "Automação 24 h ligada"; break; fi
    c_err "Chave recusada (HTTP $code). Será que colou a anon no lugar da service_role?"
  done
  unset SERVICE_ROLE
fi

# ---------------------------------------------------------------------
c_step "2/3  Gateway de WhatsApp (Evolution API)"
# ---------------------------------------------------------------------
echo "  1) Usar uma Evolution que já existe (ex.: a sua de teste)"
echo "  2) Instalar uma Evolution nova nesta VPS (só rede interna, sem porta aberta)"
echo "  3) Configurar depois (as conexões continuam simuladas)"
ask OPT "Escolha" "1"
case "$OPT" in
  1)
    while true; do
      ask EVO_URL "URL da Evolution (ex.: https://evolution.seudominio.com.br)" "$(env_get EVOLUTION_API_URL)"
      EVO_URL="${EVO_URL%/}"
      ask_secret EVO_KEY "API key global da Evolution (AUTHENTICATION_API_KEY)"
      code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$EVO_URL/instance/fetchInstances" -H "apikey: $EVO_KEY" || true)
      if [[ "$code" == "200" ]]; then c_ok "Evolution respondeu e aceitou a chave"; break; fi
      c_err "A Evolution não aceitou (HTTP $code). Confira a URL (sem /manager no fim) e a chave global."
      ask CONT "Salvar mesmo assim? (s/N)" "n"; [[ "$CONT" =~ ^[sS]$ ]] && break
    done
    env_set EVOLUTION_API_URL "$EVO_URL"
    env_set EVOLUTION_API_KEY "$EVO_KEY"
    # a Evolution externa chama o CRM pelo domínio público (HTTPS)
    env_set WHATSAPP_WEBHOOK_URL "https://$DOMAIN/api/whatsapp/webhook"
    sed -i '/^COMPOSE_PROFILES=/d' .env
    ;;
  2)
    EVO_KEY="$(env_get EVOLUTION_API_KEY)"; [[ -n "$EVO_KEY" ]] || EVO_KEY="$(rand)"
    DB_PASS="$(env_get EVOLUTION_DB_PASSWORD)"; [[ -n "$DB_PASS" ]] || DB_PASS="$(rand)"
    env_set COMPOSE_PROFILES evolution
    env_set EVOLUTION_API_URL "http://evolution:8080"
    env_set EVOLUTION_API_KEY "$EVO_KEY"
    env_set EVOLUTION_DB_PASSWORD "$DB_PASS"
    # mesma rede do Docker: a Evolution chama o app direto, sem sair para a internet
    env_set WHATSAPP_WEBHOOK_URL "http://app:8787/api/whatsapp/webhook"
    c_ok "Evolution será criada nesta VPS (chaves geradas automaticamente)"
    ;;
  *)
    c_warn "WhatsApp real não configurado. Rode este script de novo quando quiser."
    ;;
esac

# ---------------------------------------------------------------------
c_step "3/3  Segredo do webhook"
# ---------------------------------------------------------------------
if [[ -z "$(env_get WHATSAPP_WEBHOOK_TOKEN)" ]]; then
  env_set WHATSAPP_WEBHOOK_TOKEN "$(rand)"
  c_ok "Segredo gerado (a Evolution recebe ele sozinha ao conectar um número)"
else
  c_ok "Segredo já existia (mantido)"
fi
chmod 600 .env

if [[ "${1:-}" != "--no-restart" ]]; then
  c_step "Aplicando"
  docker compose up -d --build
  sleep 5
  curl -fsS "https://$DOMAIN/api/health" 2>/dev/null && echo
fi

cat <<EOF

  Próximo passo: entre no CRM → Conexões → Conectar novo WhatsApp → QR Code.
  O QR real aparece na tela; leia com o celular do atendimento (número de teste!).
  Depois mande uma mensagem de outro celular e veja chegar no Inbox.
  Conferir tudo: sudo bash SETUP-KIT/verificar.sh
EOF
