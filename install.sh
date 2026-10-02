#!/usr/bin/env bash
# OLS installer (Linux / macOS)
#   curl -fsSL https://raw.githubusercontent.com/mohmadMajadly/ols/main/install.sh | bash
#
# Environment overrides (all optional; set OLS_NONINTERACTIVE=1 to skip every prompt):
#   OLS_DIR, OLS_REPO, OLS_BRANCH, OLS_MODE=domain|local|lan, OLS_DOMAIN, OLS_EMAIL,
#   OLS_PORT, OLS_LAN_IP, OLS_ADMIN_USER, OLS_ADMIN_PASSWORD, OLS_ACTION=update|reconfigure|abort
#
# Everything lives inside main() so a truncated download (curl | bash) never runs half a script.

set -eu
set -o pipefail

OLS_REPO="${OLS_REPO:-https://github.com/mohmadMajadly/ols.git}"
OLS_BRANCH="${OLS_BRANCH:-main}"
COMPOSE_FILE_NAME="docker-compose.prod.yml"
HEALTH_TIMEOUT="${OLS_HEALTH_TIMEOUT:-420}"

# ---------------------------------------------------------------- helpers
if [ -t 1 ]; then
  C_B=$(printf '\033[1m'); C_G=$(printf '\033[32m'); C_Y=$(printf '\033[33m'); C_R=$(printf '\033[31m'); C_0=$(printf '\033[0m')
else
  C_B=""; C_G=""; C_Y=""; C_R=""; C_0=""
fi
say()  { printf '%s\n' "$*"; }
step() { printf '\n%s==> %s%s\n' "$C_B" "$*" "$C_0"; }
ok()   { printf '%s[ok]%s %s\n' "$C_G" "$C_0" "$*"; }
warn() { printf '%s[!]%s %s\n' "$C_Y" "$C_0" "$*" >&2; }
die()  { printf '%s[error]%s %s\n' "$C_R" "$C_0" "$*" >&2; exit 1; }

HAVE_TTY=0
if [ "${OLS_NONINTERACTIVE:-0}" != "1" ] && ( : </dev/tty ) 2>/dev/null; then
  HAVE_TTY=1
fi

# ask VAR "Prompt" "default"   -> sets VAR (env value already set wins and is not asked)
ask() {
  _var="$1"; _prompt="$2"; _def="${3:-}"
  eval "_cur=\${$_var:-}"
  if [ -n "$_cur" ]; then return 0; fi
  if [ "$HAVE_TTY" = "1" ]; then
    if [ -n "$_def" ]; then printf '%s [%s]: ' "$_prompt" "$_def" >/dev/tty; else printf '%s: ' "$_prompt" >/dev/tty; fi
    IFS= read -r _ans </dev/tty || _ans=""
    [ -z "$_ans" ] && _ans="$_def"
  else
    _ans="$_def"
  fi
  eval "$_var=\$_ans"
}

# ask_secret VAR "Prompt"  (hidden input)
ask_secret() {
  _var="$1"; _prompt="$2"
  printf '%s: ' "$_prompt" >/dev/tty
  IFS= read -r -s _ans </dev/tty || _ans=""
  printf '\n' >/dev/tty
  eval "$_var=\$_ans"
}

# yesno "Question" default(y|n) -> returns 0 for yes
yesno() {
  _q="$1"; _d="${2:-n}"
  if [ "$HAVE_TTY" != "1" ]; then [ "$_d" = "y" ]; return; fi
  if [ "$_d" = "y" ]; then _hint="Y/n"; else _hint="y/N"; fi
  printf '%s [%s]: ' "$_q" "$_hint" >/dev/tty
  IFS= read -r _a </dev/tty || _a=""
  [ -z "$_a" ] && _a="$_d"
  case "$_a" in y|Y|yes|YES|Yes) return 0 ;; *) return 1 ;; esac
}

lower() { printf '%s' "$1" | tr '[:upper:]' '[:lower:]'; }

rand_hex() { # rand_hex <bytes>
  if command -v openssl >/dev/null 2>&1; then
    openssl rand -hex "$1"
  else
    head -c "$1" /dev/urandom | od -An -tx1 | tr -d ' \n'
  fi
}

env_get() { # env_get KEY file
  [ -f "$2" ] || return 0
  grep -E "^$1=" "$2" | tail -n 1 | cut -d= -f2- | sed -e "s/^'//" -e "s/'\$//" || true
}

port_in_use() { ( exec 3<>"/dev/tcp/127.0.0.1/$1" ) 2>/dev/null; }

detect_lan_ip() {
  _ip=""
  if command -v ip >/dev/null 2>&1; then
    _ip=$(ip -4 route get 1.1.1.1 2>/dev/null | sed -n 's/.* src \([0-9.]*\).*/\1/p' | head -n 1)
  fi
  if [ -z "$_ip" ] && command -v hostname >/dev/null 2>&1; then
    _ip=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$' | head -n 1 || true)
  fi
  if [ -z "$_ip" ] && [ "$(uname -s)" = "Darwin" ] && command -v ipconfig >/dev/null 2>&1; then
    _ip=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)
  fi
  if [ -z "$_ip" ] && command -v ifconfig >/dev/null 2>&1; then
    _ip=$(ifconfig 2>/dev/null | sed -n 's/.*inet \([0-9.]*\) .*/\1/p' | grep -v '^127\.' | head -n 1 || true)
  fi
  if valid_ipv4 "$_ip"; then printf '%s' "$_ip"; fi
}

valid_ipv4() { printf '%s' "$1" | grep -Eq '^([0-9]{1,3}\.){3}[0-9]{1,3}$'; }

# ---------------------------------------------------------------- docker
DOCKER=(docker)

check_docker() {
  step "Checking requirements"
  OS_NAME=$(uname -s)
  if ! command -v docker >/dev/null 2>&1; then
    if [ "$OS_NAME" = "Linux" ]; then
      warn "Docker is not installed."
      if yesno "Install Docker now using the official script (https://get.docker.com)? Requires sudo" n; then
        command -v curl >/dev/null 2>&1 || die "curl is required to download the Docker installer."
        curl -fsSL https://get.docker.com -o /tmp/get-docker.sh
        if [ "$(id -u)" -eq 0 ]; then sh /tmp/get-docker.sh; else sudo sh /tmp/get-docker.sh; fi
        rm -f /tmp/get-docker.sh
        if command -v systemctl >/dev/null 2>&1; then
          if [ "$(id -u)" -eq 0 ]; then systemctl enable --now docker || true; else sudo systemctl enable --now docker || true; fi
        fi
      else
        die "Docker is required. Install it from https://docs.docker.com/engine/install/ and run this installer again."
      fi
    else
      die "Docker is not installed. Install Docker Desktop from https://docs.docker.com/desktop/setup/install/mac-install/ and run this installer again."
    fi
  fi
  command -v docker >/dev/null 2>&1 || die "Docker still not found after installation."

  if ! docker info >/dev/null 2>&1; then
    if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then
      warn "Your user cannot talk to Docker directly; using sudo for docker commands."
      DOCKER=(sudo docker)
    else
      if [ "$OS_NAME" = "Darwin" ]; then
        die "The Docker daemon is not running. Start Docker Desktop, wait until it says 'running', then run this installer again."
      fi
      die "The Docker daemon is not running (or you lack permission). Try: sudo systemctl start docker  -- or add your user to the 'docker' group."
    fi
  fi
  ok "Docker $("${DOCKER[@]}" version --format '{{.Server.Version}}' 2>/dev/null || echo '?')"

  "${DOCKER[@]}" compose version >/dev/null 2>&1 \
    || die "Docker Compose v2 ('docker compose') is missing. See https://docs.docker.com/compose/install/"
  ok "Docker Compose $("${DOCKER[@]}" compose version --short 2>/dev/null || echo '')"

  HAVE_GIT=1
  if ! command -v git >/dev/null 2>&1; then
    HAVE_GIT=0
    warn "git is not installed - will download the repository as an archive instead (install git from https://git-scm.com/downloads for easy updates)."
    command -v curl >/dev/null 2>&1 || die "curl is required to download the repository."
    command -v tar >/dev/null 2>&1 || die "tar is required to unpack the repository."
  fi
}

dc() { ( cd "$OLS_DIR" && "${DOCKER[@]}" compose -f "$COMPOSE_FILE_NAME" "$@" </dev/null ); }

# ---------------------------------------------------------------- source code
download_archive() {
  _base="${OLS_REPO%.git}"
  case "$_base" in
    https://github.com/*) ;;
    *) die "Without git, OLS_REPO must be a github.com URL (got: $OLS_REPO)." ;;
  esac
  _url="$_base/archive/refs/heads/$OLS_BRANCH.tar.gz"
  say "Downloading $_url"
  mkdir -p "$OLS_DIR"
  curl -fsSL "$_url" | tar -xz -C "$OLS_DIR" --strip-components=1
}

fetch_code() {
  step "Getting OLS source"
  if [ -d "$OLS_DIR/.git" ]; then
    if [ "$HAVE_GIT" = "1" ]; then
      ( cd "$OLS_DIR" && git pull --ff-only origin "$OLS_BRANCH" ) || die "git pull failed (local changes?). Resolve in $OLS_DIR and retry."
    else
      download_archive
    fi
  elif [ -f "$OLS_DIR/$COMPOSE_FILE_NAME" ]; then
    # exists without .git (archive install) - refresh it
    if [ "$HAVE_GIT" = "1" ]; then warn "Existing install has no git metadata; refreshing from archive."; fi
    command -v curl >/dev/null 2>&1 || die "curl is required to refresh an archive install."
    download_archive
  else
    if [ -d "$OLS_DIR" ] && [ -n "$(ls -A "$OLS_DIR" 2>/dev/null)" ]; then
      die "$OLS_DIR exists and is not empty. Choose another directory (OLS_DIR=...)."
    fi
    if [ "$HAVE_GIT" = "1" ]; then
      git clone --depth 1 --branch "$OLS_BRANCH" "$OLS_REPO" "$OLS_DIR"
    else
      download_archive
    fi
  fi
  [ -f "$OLS_DIR/$COMPOSE_FILE_NAME" ] || die "$COMPOSE_FILE_NAME not found in $OLS_DIR - wrong repository/branch?"
  ok "Source ready in $OLS_DIR"
}

# ---------------------------------------------------------------- configuration
prompt_config() {
  step "Configuration"
  if [ -z "${OLS_MODE:-}" ]; then
    if [ "$HAVE_TTY" = "1" ]; then
      {
        say "How will OLS be accessed?"
        say "  1) Server with a domain name   (public HTTPS via Let's Encrypt)"
        say "  2) This computer only          (http://localhost)"
        say "  3) Local network / LAN         (HTTPS with a self-signed certificate)"
      } >/dev/tty
      _c=""; ask _c "Choose 1, 2 or 3" "2"
      case "$_c" in 1) OLS_MODE=domain ;; 3) OLS_MODE=lan ;; *) OLS_MODE=local ;; esac
    else
      OLS_MODE=local
    fi
  fi
  OLS_MODE=$(lower "$OLS_MODE")
  case "$OLS_MODE" in domain|local|lan) ;; *) die "OLS_MODE must be domain, local or lan (got: $OLS_MODE)." ;; esac

  case "$OLS_MODE" in
    domain)
      say ""
      say "Reminder: the DNS A record of your domain must point to this server's public IP,"
      say "and ports 80 and 443 must be open in the firewall / cloud security group."
      ask OLS_DOMAIN "Domain name (e.g. quran.example.com)" ""
      OLS_DOMAIN=$(lower "$OLS_DOMAIN")
      printf '%s' "$OLS_DOMAIN" | grep -Eq '^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$' \
        || die "Invalid or missing domain: '$OLS_DOMAIN'."
      ask OLS_EMAIL "Email for Let's Encrypt notices" ""
      printf '%s' "$OLS_EMAIL" | grep -Eq '^[^@ ]+@[^@ ]+\.[^@ ]+$' || die "Invalid or missing email: '$OLS_EMAIL'."
      OLS_PORT=443
      ;;
    local)
      ask OLS_PORT "Port" "8080"
      ;;
    lan)
      ask OLS_PORT "Port" "8443"
      if [ -z "${OLS_LAN_IP:-}" ]; then
        _det=$(detect_lan_ip)
        ask OLS_LAN_IP "This machine's LAN IP address (comma-separated for several)" "$_det"
      fi
      [ -n "$OLS_LAN_IP" ] || die "Could not detect the LAN IP; set OLS_LAN_IP."
      OLS_LAN_IP=$(printf '%s' "$OLS_LAN_IP" | tr -d ' ')
      _old_ifs="$IFS"; IFS=','
      for _i in $OLS_LAN_IP; do valid_ipv4 "$_i" || { IFS="$_old_ifs"; die "Invalid IPv4 address: '$_i'."; }; done
      IFS="$_old_ifs"
      ;;
  esac
  printf '%s' "$OLS_PORT" | grep -Eq '^[0-9]+$' && [ "$OLS_PORT" -ge 1 ] && [ "$OLS_PORT" -le 65535 ] \
    || die "Invalid port: '$OLS_PORT'."
  if [ "$OLS_MODE" != "domain" ] && port_in_use "$OLS_PORT"; then
    warn "Port $OLS_PORT already seems to be in use on this machine."
    if [ "$HAVE_TTY" = "1" ] && ! yesno "Continue anyway?" n; then die "Aborted."; fi
  fi
}

prompt_admin() {
  ask OLS_ADMIN_USER "Admin username" "admin"
  OLS_ADMIN_USER=$(lower "$OLS_ADMIN_USER")
  printf '%s' "$OLS_ADMIN_USER" | grep -Eq '^[a-z0-9._-]{3,50}$' \
    || die "Admin username must be 3-50 characters: letters, digits, dot, dash, underscore."

  if [ -z "${OLS_ADMIN_PASSWORD:-}" ]; then
    [ "$HAVE_TTY" = "1" ] || die "Non-interactive run requires OLS_ADMIN_PASSWORD."
    _confirm=""
    while :; do
      ask_secret OLS_ADMIN_PASSWORD "Admin password (min 8 characters, input hidden)"
      ask_secret _confirm "Repeat the password"
      if [ "$OLS_ADMIN_PASSWORD" != "$_confirm" ]; then warn "Passwords do not match."; OLS_ADMIN_PASSWORD=""; continue; fi
      if [ "${#OLS_ADMIN_PASSWORD}" -lt 8 ]; then warn "Password must be at least 8 characters."; OLS_ADMIN_PASSWORD=""; continue; fi
      case "$OLS_ADMIN_PASSWORD" in *"'"*) warn "Password must not contain a single quote (')."; OLS_ADMIN_PASSWORD=""; continue ;; esac
      break
    done
  fi
  [ "${#OLS_ADMIN_PASSWORD}" -ge 8 ] || die "Admin password must be at least 8 characters."
  case "$OLS_ADMIN_PASSWORD" in *"'"*) die "Admin password must not contain a single quote (')." ;; esac
  case "$OLS_ADMIN_PASSWORD" in *$'\n'*|*$'\r'*) die "Admin password must not contain line breaks." ;; esac
}

write_caddyfile() {
  mkdir -p "$OLS_DIR/deploy"
  _cf="$OLS_DIR/deploy/Caddyfile"
  case "$OLS_MODE" in
    domain)
      cat > "$_cf" <<EOF
# generated by install.sh (mode: domain)
{
	email $OLS_EMAIL
}

$OLS_DOMAIN {
	import /etc/caddy/ols-site.caddy
}
EOF
      ;;
    local)
      cat > "$_cf" <<EOF
# generated by install.sh (mode: local)
{
	auto_https off
}

http://:$OLS_INTERNAL_PORT {
	import /etc/caddy/ols-site.caddy
}
EOF
      ;;
    lan)
      _addrs="https://localhost:$OLS_INTERNAL_PORT, https://127.0.0.1:$OLS_INTERNAL_PORT"
      _old_ifs="$IFS"; IFS=','
      for _i in $OLS_LAN_IP; do _addrs="https://$_i:$OLS_INTERNAL_PORT, $_addrs"; done
      IFS="$_old_ifs"
      cat > "$_cf" <<EOF
# generated by install.sh (mode: lan) - self-signed certificate from Caddy's internal CA
{
	auto_https disable_redirects
	local_certs
}

$_addrs {
	tls internal
	import /etc/caddy/ols-site.caddy
}
EOF
      ;;
  esac
}

set_mode_vars() {
  case "$OLS_MODE" in
    domain) OLS_BIND="0.0.0.0"; OLS_INTERNAL_PORT=443; OLS_HTTP_SPEC="0.0.0.0:80"; COOKIE_SECURE=true ;;
    local)  OLS_BIND="127.0.0.1"; OLS_INTERNAL_PORT=8080; OLS_HTTP_SPEC="127.0.0.1:"; COOKIE_SECURE=false ;;
    lan)    OLS_BIND="0.0.0.0"; OLS_INTERNAL_PORT=8443; OLS_HTTP_SPEC="127.0.0.1:"; COOKIE_SECURE=true ;;
  esac
}

write_env() {
  _envf="$OLS_DIR/.env"
  if [ -f "$_envf" ]; then
    PG_PASS=$(env_get POSTGRES_PASSWORD "$_envf")
    SECRET=$(env_get SECRET_KEY "$_envf")
  fi
  [ -n "${PG_PASS:-}" ] || PG_PASS=$(rand_hex 24)
  [ -n "${SECRET:-}" ] || SECRET=$(rand_hex 48)
  if [ -z "${OLS_ADMIN_USER:-}" ]; then OLS_ADMIN_USER=$(env_get ADMIN_USERNAME "$_envf"); fi
  ( umask 077
    cat > "$_envf.tmp" <<EOF
# generated by install.sh - keep this file private
COMPOSE_FILE=$COMPOSE_FILE_NAME

# ---- PostgreSQL ----
POSTGRES_USER=ols
POSTGRES_PASSWORD=$PG_PASS
POSTGRES_DB=ols
DATABASE_URL=postgresql+psycopg://ols:$PG_PASS@db:5432/ols

# ---- Backend ----
SECRET_KEY=$SECRET
ACCESS_TOKEN_EXPIRE_MINUTES=60
COOKIE_SECURE=$COOKIE_SECURE
MEDIA_ROOT=/data/media

# ---- Seed admin (applied only while no admin exists; the password is blanked after first boot) ----
ADMIN_USERNAME=$OLS_ADMIN_USER
ADMIN_PASSWORD='${OLS_ADMIN_PASSWORD:-}'

# ---- Access mode (used by docker-compose.prod.yml and the helper scripts) ----
OLS_MODE=$OLS_MODE
OLS_DOMAIN=${OLS_DOMAIN:-}
OLS_LAN_IP=${OLS_LAN_IP:-}
OLS_PORT=$OLS_PORT
OLS_BIND=$OLS_BIND
OLS_INTERNAL_PORT=$OLS_INTERNAL_PORT
OLS_HTTP_SPEC=$OLS_HTTP_SPEC
EOF
  )
  mv "$_envf.tmp" "$_envf"
  chmod 600 "$_envf"
}

# ---------------------------------------------------------------- health + summary
wait_healthy() {
  step "Waiting for OLS to come up (first build can take several minutes)"
  _elapsed=0
  _first="$(printf '%s' "${OLS_LAN_IP:-}" | cut -d, -f1)"; : "$_first"
  while [ "$_elapsed" -lt "$HEALTH_TIMEOUT" ]; do
    case "$OLS_MODE" in
      local) curl -fsS -m 5 "http://127.0.0.1:$OLS_PORT/api/health" >/dev/null 2>&1 && return 0 ;;
      lan)   curl -fsSk -m 5 "https://localhost:$OLS_PORT/api/health" >/dev/null 2>&1 && return 0 ;;
      domain) dc exec -T caddy wget -qO- http://backend:8000/api/health >/dev/null 2>&1 && return 0 ;;
    esac
    sleep 3; _elapsed=$((_elapsed + 3))
  done
  return 1
}

blank_admin_password() {
  _envf="$OLS_DIR/.env"
  if grep -q "^ADMIN_PASSWORD='." "$_envf" 2>/dev/null; then
    sed -e "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=/" "$_envf" > "$_envf.tmp" && chmod 600 "$_envf.tmp" && mv "$_envf.tmp" "$_envf"
    ok "Admin password applied and removed from .env"
  fi
}

print_summary() {
  [ -n "${OLS_MODE:-}" ] || OLS_MODE=$(env_get OLS_MODE "$OLS_DIR/.env")
  [ -n "${OLS_PORT:-}" ] || OLS_PORT=$(env_get OLS_PORT "$OLS_DIR/.env")
  [ -n "${OLS_DOMAIN:-}" ] || OLS_DOMAIN=$(env_get OLS_DOMAIN "$OLS_DIR/.env")
  [ -n "${OLS_LAN_IP:-}" ] || OLS_LAN_IP=$(env_get OLS_LAN_IP "$OLS_DIR/.env")
  _admin=$(env_get ADMIN_USERNAME "$OLS_DIR/.env")
  printf '\n%s=================  OLS is installed  =================%s\n' "$C_G" "$C_0"
  case "$OLS_MODE" in
    domain) say "Open:   https://$OLS_DOMAIN   (the certificate is issued on first visit; allow a minute)" ;;
    local)  say "Open:   http://localhost:$OLS_PORT" ;;
    lan)
      _old_ifs="$IFS"; IFS=','
      for _i in $OLS_LAN_IP; do say "Open:   https://$_i:$OLS_PORT"; done
      IFS="$_old_ifs"
      say "         https://localhost:$OLS_PORT (on this machine)"
      say "Note:   the certificate is self-signed - each browser shows a warning once; accept it to continue."
      ;;
  esac
  say "Admin:  $_admin   (password: the one you entered)"
  say "Folder: $OLS_DIR"
  say ""
  say "Live recitation tracking needs the speech model, which is converted on the very first start"
  say "(can take 10+ minutes). OLS is usable meanwhile; tracking turns on by itself afterwards."
  say ""
  say "Manage (from $OLS_DIR):"
  say "  ./ols.sh status | logs [service] | stop | start | restart | update | uninstall"
  say "  or: docker compose logs -f   /   docker compose down   /   docker compose up -d"
}

# ---------------------------------------------------------------- main
main() {
  say "${C_B}OLS - Quran memorization center :: installer${C_0}"
  check_docker

  OLS_DIR="${OLS_DIR:-}"
  ask OLS_DIR "Install directory" "$HOME/ols"
  case "$OLS_DIR" in "~"*) OLS_DIR="$HOME${OLS_DIR#\~}" ;; esac
  mkdir -p "$OLS_DIR"
  OLS_DIR=$(cd "$OLS_DIR" && pwd)

  ACTION="fresh"
  if [ -f "$OLS_DIR/.env" ]; then
    step "Existing installation found in $OLS_DIR"
    ACTION="${OLS_ACTION:-}"
    if [ -z "$ACTION" ]; then
      if [ "$HAVE_TTY" = "1" ]; then
        say "  U) Update     - pull the latest version, rebuild, keep settings and data" >/dev/tty
        say "  R) Reconfigure - change access mode / ports, keep data and secrets" >/dev/tty
        say "  A) Abort" >/dev/tty
        _a=""; ask _a "Choose U, R or A" "U"
        case "$(lower "$_a")" in r*) ACTION=reconfigure ;; a*) ACTION=abort ;; *) ACTION=update ;; esac
      else
        ACTION=update
      fi
    fi
    case "$ACTION" in update|reconfigure) ;; abort) say "Aborted."; exit 0 ;; *) die "OLS_ACTION must be update, reconfigure or abort." ;; esac
  fi

  fetch_code

  if [ "$ACTION" = "update" ]; then
    step "Rebuilding and restarting"
    dc up -d --build
    OLS_MODE=""; OLS_PORT=""; OLS_DOMAIN=""; OLS_LAN_IP=""
    for _k in MODE PORT DOMAIN LAN_IP; do eval "OLS_$_k=\$(env_get OLS_$_k \"\$OLS_DIR/.env\")"; done
    wait_healthy || { warn "Timed out waiting for the app. Check: cd $OLS_DIR && docker compose logs backend caddy"; exit 1; }
    print_summary
    return 0
  fi

  prompt_config
  if [ "$ACTION" = "fresh" ]; then
    prompt_admin
  else
    OLS_ADMIN_PASSWORD=""
    say "Reconfigure keeps the existing admin account and database; change passwords inside the app."
  fi
  set_mode_vars

  step "Writing configuration"
  write_env
  write_caddyfile
  ok ".env (permissions 600) and deploy/Caddyfile written"

  step "Building and starting containers"
  dc up -d --build

  if ! wait_healthy; then
    warn "The app did not become healthy within ${HEALTH_TIMEOUT}s."
    warn "Inspect: cd $OLS_DIR && docker compose logs backend caddy"
    exit 1
  fi
  ok "OLS is responding"
  blank_admin_password
  if [ "$OLS_MODE" = "domain" ]; then
    curl -fsS -m 15 "https://$OLS_DOMAIN/api/health" >/dev/null 2>&1 \
      || warn "https://$OLS_DOMAIN is not reachable yet - check the DNS A record and ports 80/443; Caddy retries certificate issuance automatically (docker compose logs caddy)."
  fi
  print_summary
}

main "$@"
