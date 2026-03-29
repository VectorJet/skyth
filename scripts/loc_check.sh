#!/bin/bash

THRESHOLD=400
CLOSE_RANGE=50
SKYTH_DIR="/home/tammy/dev/old/Skyth/skyth"

echo "=== Files >= $THRESHOLD LOC ==="
echo ""

> /tmp/loc_results.txt

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -ge "$THRESHOLD" ]; then
    echo "$lines $file" >> /tmp/loc_results.txt
  fi
done < <(find "$SKYTH_DIR" -name "*.ts" -not -name "*.d.ts")

sort -rn /tmp/loc_results.txt | while read -r lines file; do
  printf "%4d  %s\n" "$lines" "$file"
done

echo ""
CLOSE_MIN=$((THRESHOLD - CLOSE_RANGE))
echo "=== Files close to $THRESHOLD LOC ($CLOSE_MIN-$(($THRESHOLD - 1))) ==="
echo ""

> /tmp/loc_close.txt

while IFS= read -r file; do
  lines=$(wc -l < "$file")
  if [ "$lines" -ge $(($THRESHOLD - $CLOSE_RANGE)) ] && [ "$lines" -lt "$THRESHOLD" ]; then
    echo "$lines $file" >> /tmp/loc_close.txt
  fi
done < <(find "$SKYTH_DIR" -name "*.ts" -not -name "*.d.ts")

sort -rn /tmp/loc_close.txt | while read -r lines file; do
  printf "%4d  %s\n" "$lines" "$file"
done

total_files=$(find "$SKYTH_DIR" -name "*.ts" -not -name "*.d.ts" | wc -l)
total_loc=$(find "$SKYTH_DIR" -name "*.ts" -not -name "*.d.ts" -exec wc -l {} + | tail -1 | awk '{print $1}')
high_count=$(wc -l < /tmp/loc_results.txt)
close_count=$(wc -l < /tmp/loc_close.txt)

echo ""
echo "=== Summary ==="
echo "Total files: $total_files"
echo "Total LOC: $total_loc"
echo "Files >= $THRESHOLD LOC: $high_count"
echo "Files close to $THRESHOLD LOC: $close_count"

rm -f /tmp/loc_results.txt /tmp/loc_close.txt
