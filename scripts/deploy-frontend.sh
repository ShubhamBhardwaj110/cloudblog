#!/usr/bin/env bash
# Build the React app and publish it to S3 behind CloudFront.
# Prerendered pages (posts/*), sitemap.xml, rss.xml and robots.txt belong to the
# publisher Lambda, so they are never deleted or overwritten here.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
TF="terraform -chdir=$ROOT/infra/envs/prod"
BUCKET="$($TF output -raw site_bucket)"
PUBLISHER="$($TF output -raw publisher_function)"

npm run build -w frontend --prefix "$ROOT"
"$ROOT/scripts/write-config.sh" "$ROOT/frontend/dist"
DIST="$ROOT/frontend/dist"

echo "→ Uploading hashed assets (cached for a year)"
# No --delete: pages rendered against the previous build keep working until the rebuild below.
aws s3 sync "$DIST/assets" "s3://$BUCKET/assets" --cache-control "public, max-age=31536000, immutable" --only-show-errors

echo "→ Uploading HTML, config and public files (always revalidated)"
aws s3 sync "$DIST" "s3://$BUCKET" --exclude "assets/*" --exclude "*.map" \
  --exclude "posts/*" --exclude "sitemap.xml" --exclude "rss.xml" --exclude "robots.txt" \
  --cache-control "public, max-age=0, must-revalidate" --only-show-errors

echo "→ Re-rendering static post pages against the new index.html (also invalidates CloudFront)"
RESULT="$(mktemp)"
FN_ERROR="$(aws lambda invoke --function-name "$PUBLISHER" --payload '{"action":"rebuild"}' \
  --cli-binary-format raw-in-base64-out --cli-read-timeout 180 --query 'FunctionError' --output text "$RESULT")"
if [ "$FN_ERROR" != "None" ]; then
  echo "Publisher rebuild failed ($FN_ERROR): $(cat "$RESULT")" >&2
  echo "See CloudWatch logs: /aws/lambda/$PUBLISHER" >&2
  exit 1
fi

echo "✓ Deployed: $($TF output -raw site_url)"
