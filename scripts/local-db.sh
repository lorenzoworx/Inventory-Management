#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
data_dir="$project_root/.local/postgres"
command_name="${1:-start}"
if [ "$#" -gt 0 ]; then shift; fi

for tool in initdb pg_ctl psql createdb; do
  if ! command -v "$tool" >/dev/null; then
    printf 'Missing %s. Install PostgreSQL 18 and add its bin directory to PATH.\n' "$tool" >&2
    exit 1
  fi
done

case "$command_name" in
  start)
    if ! initdb --version | grep -Eq 'PostgreSQL\) 18\.'; then
      printf 'This project uses PostgreSQL 18. Check your PATH.\n' >&2
      exit 1
    fi
    mkdir -p "$project_root/.local"
    if [ ! -f "$data_dir/PG_VERSION" ]; then
      # This cluster is only for local learning, bound to 127.0.0.1 below.
      initdb -D "$data_dir" --username=ims --auth=trust --encoding=UTF8 --no-locale
    fi
    if [ "$(cat "$data_dir/PG_VERSION")" != "18" ]; then
      printf 'The existing project cluster uses a different PostgreSQL version.\n' >&2
      exit 1
    fi
    if ! pg_ctl -D "$data_dir" status >/dev/null 2>&1; then
      pg_ctl -D "$data_dir" -l "$project_root/.local/postgres.log" \
        -o "-h 127.0.0.1 -p 5433 -c unix_socket_directories=''" -w start
    fi
    actual_dir="$(psql -X -h 127.0.0.1 -p 5433 -U ims -d postgres -Atc 'SHOW data_directory')"
    if [ "$actual_dir" != "$data_dir" ]; then
      printf 'Port 5433 belongs to another cluster; no databases were created.\n' >&2
      exit 1
    fi
    for database_name in ims ims_test; do
      exists="$(psql -X -h 127.0.0.1 -p 5433 -U ims -d postgres -Atc "SELECT 1 FROM pg_database WHERE datname = '$database_name'")"
      if [ "$exists" != "1" ]; then
        createdb -h 127.0.0.1 -p 5433 -U ims "$database_name"
      fi
    done
    printf 'Local databases ready: ims and ims_test on 127.0.0.1:5433.\n'
    ;;
  stop)
    if pg_ctl -D "$data_dir" status >/dev/null 2>&1; then
      pg_ctl -D "$data_dir" -m fast -w stop
    else
      printf 'The project database server is already stopped.\n'
    fi
    ;;
  shell)
    exec psql -X -h 127.0.0.1 -p 5433 -U ims -d ims "$@"
    ;;
  *)
    printf 'Usage: bash scripts/local-db.sh start|stop|shell\n' >&2
    exit 1
    ;;
esac
