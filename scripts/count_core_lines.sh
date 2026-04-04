#!/usr/bin/env bash
set -euo pipefail

# Count core Skyth TypeScript lines (excluding channels/, cli/, providers/)
cd "$(dirname "$0")/.." || exit 1

echo "skyth core agent line count"
echo "================================"
echo ""

count_ts_lines() {
  local path="$1"
  local lines
  lines=$(find "$path" -type f -name "*.ts" -print0 2>/dev/null | xargs -0 cat 2>/dev/null | wc -l | tr -d ' ')
  if [[ -z "$lines" ]]; then
    lines=0
  fi
  echo "$lines"
}

for dir in skyth/*/; do
  dir=${dir#skyth/}
  dir=${dir%/}
  if [[ "$dir" == "__pycache__" ]] || [[ "$dir" == "node_modules" ]]; then
    continue
  fi
  count=$(count_ts_lines "skyth/$dir")
  if [[ "$count" -eq 0 ]]; then
    continue
  fi
  printf "  %-16s %5s lines\n" "$dir/" "$count"
done

root=0
for file in skyth/index.ts skyth/__main__.ts; do
  if [[ -f "$file" ]]; then
    file_lines=$(wc -l < "$file" | tr -d ' ')
    root=$((root + file_lines))
  fi
done
printf "  %-16s %5s lines\n" "(root)" "$root"

echo ""
total=$(find skyth -type f -name "*.ts" -print0 | xargs -0 cat | wc -l | tr -d ' ')
echo "  Core total:     $total lines"
echo ""
