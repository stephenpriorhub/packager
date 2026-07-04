#!/bin/bash
set -e

# Ensure the package store volume exists (Railway mounts it at $DATA_DIR, e.g. /app/data).
if [ -n "$DATA_DIR" ]; then
  mkdir -p "$DATA_DIR"
  echo "[data] Using package store at $DATA_DIR"
fi

echo "[app] Starting The Packager (Next.js) on port ${PORT:-3000}..."
exec npx next start -H 0.0.0.0 -p "${PORT:-3000}"
