#!/usr/bin/env bash
# Teste la migration et les règles de sécurité sur un PostgreSQL jetable.
#   - avec DATABASE_URL défini (CI) : utilise cette base (elle doit être vide) ;
#   - sinon : crée un cluster temporaire avec les binaires PostgreSQL locaux (initdb / pg_ctl).
set -euo pipefail
cd "$(dirname "$0")/.."

run_sql() {
  psql "$DB" -v ON_ERROR_STOP=1 -q -f "$1"
}

if [[ -z "${DATABASE_URL:-}" ]]; then
  PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
  TMP="$(mktemp -d)"
  trap '"$PG_BIN/pg_ctl" -D "$TMP/data" -m immediate stop >/dev/null 2>&1 || true; rm -rf "$TMP"' EXIT
  RUN_AS=()
  if [[ "$(id -u)" == "0" ]]; then
    chown -R postgres "$TMP" 2>/dev/null || { useradd -m pgtest 2>/dev/null || true; chown -R pgtest "$TMP"; }
    RUN_AS=(su "$(stat -c %U "$TMP")" -c)
  fi
  run() { if [[ ${#RUN_AS[@]} -gt 0 ]]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
  run "'$PG_BIN/initdb' -D '$TMP/data' -U postgres -A trust --locale=C.UTF-8 >/dev/null"
  run "'$PG_BIN/pg_ctl' -D '$TMP/data' -o '-k $TMP -p 54329 -c listen_addresses= -c wal_level=logical' -l '$TMP/log' -w start >/dev/null"
  DB="postgresql://postgres@/postgres?host=$TMP&port=54329"
else
  DB="$DATABASE_URL"
fi

run_sql supabase/tests/supabase_shim.sql
for f in supabase/migrations/*.sql; do
  echo "Migration : $f"
  run_sql "$f"
done
psql "$DB" -v ON_ERROR_STOP=1 -q -f supabase/tests/security_tests.sql 2>&1 | sed 's/^psql:[^:]*:[0-9]*: NOTICE:  /  /' | grep -v '^$'
