#!/usr/bin/env bash
# =====================================================================
#  LeadFlow CRM — verificação pós-instalação (rode na VPS, na pasta do projeto)
#
#    sudo bash SETUP-KIT/verificar.sh
#
#  Confere DNS, HTTPS, cabeçalhos de segurança, API, Supabase (RLS e
#  cadastro aberto), endurecimento dos containers e exposição de portas.
#  Não altera nada. Sai com código 1 se algum item crítico falhar.
#
#  Variáveis opcionais: CRM_URL (padrão https://$DOMAIN), SKIP_DOCKER=1, SKIP_DNS=1
# =====================================================================
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0; WARN=0; FAIL=0
ok()   { printf '  \033[32m✔ PASS\033[0m  %s\n' "$*"; PASS=$((PASS + 1)); }
warn() { printf '  \033[33m⚠ AVISO\033[0m %s\n' "$*"; WARN=$((WARN + 1)); }
bad()  { printf '  \033[31m✖ FALHA\033[0m %s\n' "$*"; FAIL=$((FAIL + 1)); }
step() { printf '\n\033[1;36m▶ %s\033[0m\n' "$*"; }

if [[ ! -f .env ]]; then echo "Arquivo .env não encontrado. Rode primeiro: sudo bash SETUP-KIT/install.sh"; exit 1; fi
# lê só as variáveis necessárias (sem executar o .env)
env_get() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | sed 's/[[:space:]]*#.*$//; s/^"//; s/"$//'; }
DOMAIN="$(env_get DOMAIN)"
SUPABASE_URL="$(env_get VITE_SUPABASE_URL)"; SUPABASE_URL="${SUPABASE_URL%/}"
ANON="$(env_get VITE_SUPABASE_ANON_KEY)"
AI_KEY_SET="$( [[ -n "$(env_get AI_API_KEY)" ]] && echo 1 || echo 0 )"
URL="${CRM_URL:-https://$DOMAIN}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "Verificando $URL"

# ---------------------------------------------------------------------
step "1. Domínio e certificado"
# ---------------------------------------------------------------------
if [[ "${SKIP_DNS:-0}" != 1 ]]; then
  PUBLIC_IP="$(curl -fsS4 --max-time 10 https://api.ipify.org 2>/dev/null || true)"
  DNS_IP="$(getent ahostsv4 "$DOMAIN" 2>/dev/null | awk 'NR==1{print $1}')"
  if [[ -n "$PUBLIC_IP" && "$DNS_IP" == "$PUBLIC_IP" ]]; then ok "$DOMAIN aponta para esta VPS ($PUBLIC_IP)"
  else bad "$DOMAIN aponta para '${DNS_IP:-nada}', IP desta VPS: '${PUBLIC_IP:-?}'"; fi

  if command -v openssl >/dev/null; then
    END="$(echo | openssl s_client -servername "$DOMAIN" -connect "$DOMAIN:443" 2>/dev/null | openssl x509 -noout -enddate 2>/dev/null | cut -d= -f2)"
    if [[ -n "$END" ]]; then
      DAYS=$(( ( $(date -d "$END" +%s) - $(date +%s) ) / 86400 ))
      if (( DAYS > 14 )); then ok "certificado HTTPS válido por mais $DAYS dias"
      else warn "certificado vence em $DAYS dias (o Caddy renova sozinho; confira os logs se não renovar)"; fi
    else bad "não foi possível ler o certificado HTTPS de $DOMAIN"; fi
  fi

  REDIR="$(curl -s -o /dev/null -w '%{http_code} %{redirect_url}' --max-time 10 "http://$DOMAIN/")"
  if [[ "$REDIR" =~ ^30[178]\ https:// ]]; then ok "http:// redireciona para https://"
  else bad "http:// não redireciona para https:// (recebido: $REDIR)"; fi
fi

# ---------------------------------------------------------------------
step "2. Aplicação e API"
# ---------------------------------------------------------------------
HEALTH="$(curl -fsS --max-time 10 "$URL/api/health" 2>/dev/null || true)"
if [[ "$HEALTH" == *'"ok":true'* ]]; then ok "/api/health respondendo"; else bad "/api/health não respondeu ok ($HEALTH)"; fi
if [[ "$HEALTH" == *'"supabase":true'* ]]; then ok "servidor configurado com o Supabase"; else bad "servidor sem Supabase (modo local em produção?)"; fi
if [[ "$AI_KEY_SET" == 1 ]]; then
  [[ "$HEALTH" == *'"ai":true'* ]] && ok "chave de IA carregada no servidor" || bad "AI_API_KEY no .env, mas o servidor não a carregou"
else warn "sem AI_API_KEY: os agentes usam o motor local"; fi

SR_SET="$([[ -n "$(env_get SUPABASE_SERVICE_ROLE_KEY)" ]] && echo 1 || echo 0)"
if [[ "$SR_SET" == 1 ]]; then
  [[ "$HEALTH" == *'"automation":true'* ]] && ok "automação 24 h rodando no servidor" || bad "SUPABASE_SERVICE_ROLE_KEY no .env, mas a automação não ligou (veja: docker compose logs app | grep worker)"
else warn "automação só no navegador do administrador (sem SUPABASE_SERVICE_ROLE_KEY — rode SETUP-KIT/whatsapp.sh)"; fi
if [[ -n "$(env_get EVOLUTION_API_URL)" ]]; then
  [[ "$HEALTH" == *'"whatsapp":true'* ]] && ok "gateway de WhatsApp (Evolution) configurado" || bad "EVOLUTION_API_URL no .env, mas o servidor não carregou o gateway"
  [[ -n "$(env_get WHATSAPP_WEBHOOK_TOKEN)" ]] && ok "webhook do WhatsApp com segredo" || bad "falta WHATSAPP_WEBHOOK_TOKEN no .env"
else warn "WhatsApp real não configurado: conexões simuladas (rode SETUP-KIT/whatsapp.sh)"; fi
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H 'content-type: application/json' -d '{"event":"messages.upsert"}' "$URL/api/whatsapp/webhook")"
[[ "$CODE" == 401 || "$CODE" == 503 ]] && ok "webhook do WhatsApp recusa chamada sem segredo (HTTP $CODE)" || bad "/api/whatsapp/webhook sem segredo respondeu $CODE (esperado 401)"
CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST -H 'content-type: application/json' -d '{"connectionId":"x"}' "$URL/api/whatsapp/connect")"
[[ "$CODE" == 401 || "$CODE" == 503 ]] && ok "conectar WhatsApp exige login de admin (HTTP $CODE)" || bad "/api/whatsapp/connect sem login respondeu $CODE (esperado 401)"
PAGE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/inbox")"
[[ "$PAGE" == 200 ]] && ok "a interface abre (rota /inbox → 200)" || bad "a interface não abriu (/inbox → $PAGE)"

CODE="$(curl -s -o "$TMP/ai" -w '%{http_code}' --max-time 10 -X POST -H 'content-type: application/json' -d '{}' "$URL/api/ai/reply")"
if [[ "$CODE" == 401 || "$CODE" == 503 ]]; then ok "IA recusa chamada sem login (HTTP $CODE)"
else bad "/api/ai/reply sem login respondeu $CODE (esperado 401)"; fi

TRAV="$(curl -s --path-as-is --max-time 10 "$URL/../../../../etc/passwd" || true)"
[[ "$TRAV" != *"root:"* ]] && ok "caminho com ../ não expõe arquivos do servidor" || bad "PATH TRAVERSAL: /etc/passwd foi servido!"

CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$URL/%E0%A4%A")"
[[ "$CODE" == 400 ]] && ok "endereço malformado → 400 (servidor não cai)" || warn "endereço malformado respondeu $CODE (esperado 400)"

# ---------------------------------------------------------------------
step "3. Cabeçalhos de segurança"
# ---------------------------------------------------------------------
curl -s -D "$TMP/h" -o /dev/null --max-time 10 "$URL/" ; H="$(tr -d '\r' < "$TMP/h" | tr 'A-Z' 'a-z')"
has() { grep -q "^$1" <<<"$H"; }
has 'strict-transport-security: .*includesubdomains' && ok "HSTS com includeSubDomains" || bad "HSTS ausente ou sem includeSubDomains"
has 'content-security-policy: ' && ok "Content-Security-Policy presente" || bad "Content-Security-Policy ausente"
SUPA_HOST="${SUPABASE_URL#https://}"
if [[ -n "$SUPA_HOST" ]]; then
  if grep -q "^content-security-policy: .*connect-src[^;]*\(\*\.supabase\.co\|${SUPA_HOST,,}\)" <<<"$H"; then ok "CSP libera o Supabase em connect-src (login e Realtime)"
  else bad "CSP não libera $SUPA_HOST em connect-src: login e tempo real vão falhar"; fi
fi
has "content-security-policy: .*frame-ancestors 'none'" && ok "CSP impede o site de ser embutido (clickjacking)" || warn "CSP sem frame-ancestors 'none'"
has 'x-content-type-options: nosniff' && ok "X-Content-Type-Options: nosniff" || bad "X-Content-Type-Options ausente"
has 'x-frame-options: deny' && ok "X-Frame-Options: DENY" || warn "X-Frame-Options ausente"
has 'referrer-policy: ' && ok "Referrer-Policy presente" || warn "Referrer-Policy ausente"
has 'permissions-policy: ' && ok "Permissions-Policy presente" || warn "Permissions-Policy ausente"
has 'server: ' && warn "cabeçalho Server exposto ($(grep '^server:' <<<"$H"))" || ok "cabeçalho Server oculto"

# ---------------------------------------------------------------------
step "4. Supabase"
# ---------------------------------------------------------------------
if [[ -n "$SUPABASE_URL" && -n "$ANON" ]]; then
  CODE="$(curl -s -o "$TMP/anon" -w '%{http_code}' --max-time 10 "$SUPABASE_URL/rest/v1/crm_records?select=id&limit=1" -H "apikey: $ANON" -H "Authorization: Bearer $ANON")"
  BODY="$(cat "$TMP/anon" 2>/dev/null || true)"
  if [[ "$CODE" == 000 ]]; then bad "não foi possível conectar ao Supabase em $SUPABASE_URL (URL errada ou sem internet)"
  elif [[ "$CODE" == 401 || "$CODE" == 403 || "$BODY" == "[]" ]]; then ok "chave pública (anon) não lê dados do CRM (HTTP $CODE)"
  else bad "chave pública LEU dados do CRM (HTTP $CODE): rode de novo o supabase/schema.sql"; fi

  SETTINGS="$(curl -s --max-time 10 "$SUPABASE_URL/auth/v1/settings" -H "apikey: $ANON")"
  if [[ "$SETTINGS" != *'disable_signup'* ]]; then warn "não consegui ler as configurações do Supabase Auth"
  elif [[ "$SETTINGS" == *'"disable_signup":true'* ]]; then ok "cadastro aberto desligado no Supabase Auth"
  else warn "cadastro aberto LIGADO: Supabase → Authentication → Sign In / Providers → desligue \"Allow new users to sign up\""; fi
  if [[ "$SETTINGS" != *'disable_signup'* ]]; then :
  elif [[ "$SETTINGS" == *'"mailer_autoconfirm":false'* ]]; then ok "confirmação de e-mail exigida para novos logins"
  elif [[ "$SETTINGS" == *'"disable_signup":true'* ]]; then ok "confirmação automática de e-mail não importa com o cadastro desligado"
  else warn "novos logins não precisam confirmar o e-mail: ligue a confirmação ou desligue o cadastro"; fi

  RPC="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 -X POST "$SUPABASE_URL/rest/v1/rpc/crm_is_member" -H "apikey: $ANON" -H "Authorization: Bearer $ANON" -H 'content-type: application/json' -d '{}')"
  if [[ "$RPC" == 000 ]]; then warn "não consegui testar as funções do banco (Supabase inacessível)"
  else [[ "$RPC" == 401 || "$RPC" == 403 || "$RPC" == 404 ]] && ok "funções de segurança não executam com a chave pública (HTTP $RPC)" || bad "crm_is_member executou com a chave pública (HTTP $RPC)"; fi
else
  bad "VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY ausentes no .env"
fi

# ---------------------------------------------------------------------
step "5. Servidor (VPS)"
# ---------------------------------------------------------------------
PERM="$(stat -c '%a' .env)"
[[ "$PERM" == 600 ]] && ok ".env com permissão 600" || bad ".env com permissão $PERM (rode: chmod 600 .env)"
grep -qiE 'service_role|SERVICE_ROLE' .env && bad ".env contém a chave service_role: remova-a (ela só é usada na instalação)" || ok ".env sem a chave service_role"

if command -v ss >/dev/null; then
  OPEN="$(ss -tlnH 2>/dev/null | awk '{print $4}' | grep -vE '(^127\.|^\[::1\]|%lo)' | sed -E 's/.*:([0-9]+)$/\1/' | sort -un | tr '\n' ' ')"
  EXTRA="$(tr ' ' '\n' <<<"$OPEN" | grep -vE '^(22|80|443)$' | tr '\n' ' ' | xargs)"
  [[ -z "$EXTRA" ]] && ok "só as portas 22, 80 e 443 abertas para fora ($OPEN)" || warn "portas extras abertas para fora: $EXTRA (confira se são necessárias)"
fi
if command -v ufw >/dev/null; then
  ufw status 2>/dev/null | grep -q "Status: active" && ok "firewall (ufw) ativo" || warn "firewall (ufw) inativo: considere 'ufw allow OpenSSH && ufw allow 80,443/tcp && ufw enable'"
fi

if [[ "${SKIP_DOCKER:-0}" != 1 ]] && command -v docker >/dev/null; then
  APP="$(docker compose ps -q app 2>/dev/null)"
  CADDY="$(docker compose ps -q caddy 2>/dev/null)"
  if [[ -n "$APP" ]]; then
    insp() { docker inspect -f "$1" "$APP" 2>/dev/null; }
    [[ "$(insp '{{.State.Health.Status}}')" == healthy ]] && ok "container app saudável" || warn "container app: $(insp '{{.State.Health.Status}}')"
    [[ "$(insp '{{.Config.User}}')" == node ]] && ok "app roda sem root (usuário node)" || bad "app roda como '$(insp '{{.Config.User}}')'"
    [[ "$(insp '{{.HostConfig.ReadonlyRootfs}}')" == true ]] && ok "sistema de arquivos do app somente leitura" || warn "app com sistema de arquivos gravável"
    insp '{{.HostConfig.CapDrop}}' | grep -qi all && ok "app sem capabilities do Linux (cap_drop ALL)" || bad "app sem cap_drop ALL"
    insp '{{.HostConfig.SecurityOpt}}' | grep -q 'no-new-privileges' && ok "app com no-new-privileges" || bad "app sem no-new-privileges"
    [[ -z "$(docker port "$APP" 2>/dev/null)" ]] && ok "porta 8787 do app não publicada na VPS (só o Caddy fala com ele)" || bad "porta do app publicada: $(docker port "$APP")"
    [[ "$(insp '{{.HostConfig.RestartPolicy.Name}}')" == unless-stopped ]] && ok "app reinicia sozinho após queda/reboot" || warn "política de reinício do app: $(insp '{{.HostConfig.RestartPolicy.Name}}')"
  else bad "container app não está rodando (docker compose up -d)"; fi
  if [[ -n "$CADDY" ]]; then
    [[ "$(docker inspect -f '{{.State.Running}}' "$CADDY")" == true ]] && ok "container caddy rodando" || bad "container caddy parado"
    docker inspect -f '{{.HostConfig.SecurityOpt}}' "$CADDY" | grep -q 'no-new-privileges' && ok "caddy com no-new-privileges" || warn "caddy sem no-new-privileges"
  else bad "container caddy não está rodando"; fi
  ERRS="$(docker compose logs --since 1h app 2>/dev/null | grep -ciE 'error|erro' || true)"
  [[ "${ERRS:-0}" -eq 0 ]] && ok "sem erros no log do app na última hora" || warn "$ERRS linha(s) com erro no log do app (docker compose logs app)"
fi

# ---------------------------------------------------------------------
printf '\n\033[1mResumo:\033[0m %d ok · %d avisos · %d falhas\n' "$PASS" "$WARN" "$FAIL"
if (( FAIL > 0 )); then echo "Corrija as FALHAS antes de usar em produção."; exit 1; fi
(( WARN > 0 )) && echo "Sem falhas críticas. Leia os AVISOS." || echo "Tudo certo."
exit 0
