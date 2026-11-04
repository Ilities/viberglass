#!/bin/sh
# Writes a random object storage password for this install into .env, once.
# Apps reach object storage, so its password must not be one from the repository.
set -eu
cd "$(dirname "$0")/.."
touch .env
if grep -q '^VIBERGLASS_STORAGE_PASSWORD=' .env; then
  echo "VIBERGLASS_STORAGE_PASSWORD is already set in .env"
  exit 0
fi
# Start on a line of its own when .env doesn't end with one.
if [ -s .env ] && [ -n "$(tail -c1 .env)" ]; then echo >> .env; fi
password=$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')
printf 'VIBERGLASS_STORAGE_PASSWORD=%s\n' "$password" >> .env
echo "Wrote VIBERGLASS_STORAGE_PASSWORD to .env"
