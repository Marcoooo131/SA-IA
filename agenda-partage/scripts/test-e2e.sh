#!/usr/bin/env bash
# Compile l'application avec un Supabase fictif puis lance les tests d'interface (ordinateur + mobile).
set -euo pipefail
cd "$(dirname "$0")/.."
VITE_SUPABASE_URL=http://mock-supabase.test VITE_SUPABASE_ANON_KEY=cle-de-test npx vite build --outDir dist-e2e --emptyOutDir >/dev/null
npx playwright test "$@"
