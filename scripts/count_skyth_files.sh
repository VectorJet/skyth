#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.." || exit 1

echo "File count in skyth/"
echo "===================="
echo ""

count_files() {
  local path="$1"
  local count
  count=$(find "$path" -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
  if [[ -z "$count" ]]; then
    count=0
  fi
  echo "$count"
}

for dir in agents apps auth base_classes bus channels cli config core cron gateway heartbeat id logging mcp memory permission pipelines providers registries session skills tools utils; do
  if [[ -d "skyth/$dir" ]]; then
    count=$(count_files "skyth/$dir")
    printf "  %-16s %5s files\n" "$dir/" "$count"
  fi
done

echo ""
total=$(find skyth -type f -name "*.ts" 2>/dev/null | wc -l | tr -d ' ')
echo "  Total:          $total files"
