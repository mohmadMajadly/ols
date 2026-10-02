#!/usr/bin/env bash
# OLS management helper (Linux / macOS):  ./ols.sh status|logs|start|stop|restart|update|uninstall
set -eu

DIR=$(cd "$(dirname "$0")" && pwd)
cd "$DIR"
[ -f .env ] || { echo "No .env here - run install.sh first." >&2; exit 1; }

DOCKER=(docker)
if ! docker info >/dev/null 2>&1; then
  if command -v sudo >/dev/null 2>&1 && sudo docker info >/dev/null 2>&1; then DOCKER=(sudo docker); else echo "Docker daemon is not reachable." >&2; exit 1; fi
fi
dc() { "${DOCKER[@]}" compose -f docker-compose.prod.yml "$@"; }

cmd="${1:-status}"
[ $# -gt 0 ] && shift

case "$cmd" in
  status)  dc ps ;;
  logs)    dc logs -f --tail=200 "$@" ;;
  start)   dc up -d ;;
  stop)    dc stop ;;
  restart) dc restart "$@" ;;
  update)
    if [ -d .git ]; then git pull --ff-only; else echo "No git metadata - re-run install.sh to update." >&2; exit 1; fi
    dc up -d --build
    ;;
  uninstall)
    printf 'This stops and removes the OLS containers. Continue? [y/N]: '
    read -r a; case "$a" in y|Y|yes) ;; *) echo "Cancelled."; exit 0 ;; esac
    printf 'ALSO delete all data (database, recordings, certificates, speech model)? This cannot be undone. Type DELETE to confirm, anything else keeps data: '
    read -r a
    if [ "$a" = "DELETE" ]; then dc down -v --remove-orphans; else dc down --remove-orphans; echo "Data volumes kept."; fi
    printf 'Also delete the folder %s? [y/N]: ' "$DIR"
    read -r a
    case "$a" in y|Y|yes) cd / && rm -rf "$DIR"; echo "Removed $DIR" ;; esac
    ;;
  *) echo "Usage: ./ols.sh status|logs [service]|start|stop|restart [service]|update|uninstall" >&2; exit 1 ;;
esac
