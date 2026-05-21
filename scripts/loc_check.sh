#!/usr/bin/env bash
set -euo pipefail

THRESHOLD=400
CLOSE_RANGE=50

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

resolve_target_dir() {
  if [[ $# -gt 0 && -n "$1" ]]; then
    printf '%s\n' "$1"
    return 0
  fi

  if [[ -n "${SKYTH_LOC_PATH:-}" ]]; then
    printf '%s\n' "$SKYTH_LOC_PATH"
    return 0
  fi

  if [[ -d "$PWD/skyth" ]]; then
    printf '%s\n' "$PWD/skyth"
    return 0
  fi

  if [[ -d "$PROJECT_ROOT/skyth" ]]; then
    printf '%s\n' "$PROJECT_ROOT/skyth"
    return 0
  fi

  printf '%s\n' "$PROJECT_ROOT"
}

TARGET_DIR="$(resolve_target_dir "${1:-}")"
if [[ ! -d "$TARGET_DIR" ]]; then
  echo "Target directory not found: $TARGET_DIR" >&2
  exit 1
fi

RESULTS_FILE="$(mktemp)"
CLOSE_FILE="$(mktemp)"
trap 'rm -f "$RESULTS_FILE" "$CLOSE_FILE"' EXIT

find_ts_files() {
  find "$TARGET_DIR" \
    -type f \
    -name "*.ts" \
    -not -name "*.d.ts" \
    -not -path '*/node_modules/*' \
    -not -path '*/dist/*'
}

echo "Target directory: $TARGET_DIR"
echo ""
echo "=== Files >= $THRESHOLD LOC ==="
echo ""

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [[ "$lines" -ge "$THRESHOLD" ]]; then
    printf "%s %s\n" "$lines" "$file" >> "$RESULTS_FILE"
  fi
done < <(find_ts_files)

if [[ -s "$RESULTS_FILE" ]]; then
  sort -rn "$RESULTS_FILE" | while read -r lines file; do
    printf "%4d  %s\n" "$lines" "$file"
  done
fi

echo ""
CLOSE_MIN=$((THRESHOLD - CLOSE_RANGE))
echo "=== Files close to $THRESHOLD LOC ($CLOSE_MIN-$((THRESHOLD - 1))) ==="
echo ""

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [[ "$lines" -ge "$CLOSE_MIN" && "$lines" -lt "$THRESHOLD" ]]; then
    printf "%s %s\n" "$lines" "$file" >> "$CLOSE_FILE"
  fi
done < <(find_ts_files)

if [[ -s "$CLOSE_FILE" ]]; then
  sort -rn "$CLOSE_FILE" | while read -r lines file; do
    printf "%4d  %s\n" "$lines" "$file"
  done
fi

total_files=$(find_ts_files | wc -l | tr -d ' ')
total_loc=$(while IFS= read -r file; do wc -l < "$file"; done < <(find_ts_files) | awk '{sum += $1} END {print sum + 0}')
high_count=$(wc -l < "$RESULTS_FILE" | tr -d ' ')
close_count=$(wc -l < "$CLOSE_FILE" | tr -d ' ')

echo ""
echo "=== Summary ==="
echo "Total files: $total_files"
echo "Total LOC: $total_loc"
echo "Files >= $THRESHOLD LOC: $high_count"
echo "Files close to $THRESHOLD LOC: $close_count"
