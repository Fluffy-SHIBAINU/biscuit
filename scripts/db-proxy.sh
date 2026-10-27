#!/usr/bin/env bash
# Local Postgres through the Cloud SQL Auth Proxy, on 127.0.0.1:5433 (Tender's instance, database biscuit).
set -euo pipefail
exec cloud-sql-proxy --port 5433 easybid-489721:us-central1:tender-pg
