#!/usr/bin/env bash
# Writes the frontend's runtime config from Terraform outputs.
#   scripts/write-config.sh                 -> frontend/public/config.json (local dev)
#   scripts/write-config.sh frontend/dist   -> frontend/dist/config.json   (deploy)
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
OUT_DIR="${1:-$ROOT/frontend/public}"
terraform -chdir="$ROOT/infra/envs/prod" output -json frontend_config > "$OUT_DIR/config.json"
echo "Wrote $OUT_DIR/config.json"
