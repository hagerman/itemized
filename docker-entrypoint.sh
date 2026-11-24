#!/bin/sh
set -eu

if [ "$(id -u)" = "0" ]; then
  PUID="${PUID:-1000}"
  PGID="${PGID:-1000}"
  DATA_DIR="$(dirname "${DB_PATH:-/data/itemized.db}")"
  mkdir -p "$DATA_DIR"
  chown -R "${PUID}:${PGID}" "$DATA_DIR"
  exec su-exec "${PUID}:${PGID}" /usr/local/bin/itemized "$@"
fi

exec /usr/local/bin/itemized "$@"
