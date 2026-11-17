#!/usr/bin/env bash
# Démarre un PostgreSQL 16 jetable pour les tests (port 5499) et affiche l'URL à exporter.
# Usage : source <(scripts/test-db.sh)   puis   pytest
set -euo pipefail
BIN=${PG_BIN:-/usr/lib/postgresql/16/bin}
DIR=${PG_TEST_DIR:-/var/tmp/venio-pg}
RUN_AS=""
[ "$(id -u)" = "0" ] && RUN_AS="su nobody -s /bin/bash -c"
if [ ! -f "$DIR/data/PG_VERSION" ]; then
  mkdir -p "$DIR"; [ -n "$RUN_AS" ] && chown nobody "$DIR"
  ${RUN_AS:-bash -c} "$BIN/initdb -D $DIR/data -A trust -U postgres >/dev/null"
fi
if ! ${RUN_AS:-bash -c} "$BIN/pg_ctl -D $DIR/data status" >/dev/null 2>&1; then
  ${RUN_AS:-bash -c} "$BIN/pg_ctl -D $DIR/data -o '-k $DIR -p 5499 -c listen_addresses=127.0.0.1' -l $DIR/log start" >/dev/null
fi
echo "export VENIO_TEST_ADMIN_URL=postgresql://postgres@127.0.0.1:5499/postgres"
