#!/usr/bin/env bash
# Local Postgres for development: a Docker container on 127.0.0.1:5433, database biscuit. Nothing shared with Tender.
set -euo pipefail
if docker ps -a --format '{{.Names}}' | grep -qx biscuit-pg; then
  docker start biscuit-pg >/dev/null
else
  docker run -d --name biscuit-pg -e POSTGRES_PASSWORD=biscuit -e POSTGRES_DB=biscuit -p 127.0.0.1:5433:5432 postgres:16 >/dev/null
fi
echo "postgres://postgres:biscuit@127.0.0.1:5433/biscuit"
