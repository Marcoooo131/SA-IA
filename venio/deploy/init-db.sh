#!/bin/sh
# Crée le rôle de connexion de l'application (non propriétaire, sans BYPASSRLS).
set -e
psql -v ON_ERROR_STOP=1 -U postgres -d venio <<SQL
CREATE ROLE venio LOGIN PASSWORD '${VENIO_DB_PASSWORD:-change-me-app}' NOBYPASSRLS;
SQL
