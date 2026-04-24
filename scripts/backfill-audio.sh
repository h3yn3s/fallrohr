#!/usr/bin/env bash
# Extract audio-only .m4a files for existing .mp4 downloads that don't have one yet.
# Stream-copies AAC/ALAC audio, re-encodes anything else to AAC 192k.
#
# Usage:
#   bash scripts/backfill-audio.sh            # uses ./downloads
#   bash scripts/backfill-audio.sh /some/dir  # custom DOWNLOAD_DIR
#   DATA_DIR=/some/dir bash scripts/backfill-audio.sh
#
# Safe to re-run. Skips any mp4 that already has a sibling m4a.

set -euo pipefail

DIR="${1:-${DATA_DIR:-./downloads}}"

if [[ ! -d "$DIR" ]]; then
  echo "error: not a directory: $DIR" >&2
  exit 1
fi

command -v ffmpeg >/dev/null || { echo "error: ffmpeg not found" >&2; exit 1; }
command -v ffprobe >/dev/null || { echo "error: ffprobe not found" >&2; exit 1; }

total=0
done_count=0
skipped=0
failed=0

shopt -s nullglob
for mp4 in "$DIR"/*.mp4; do
  total=$((total + 1))
  base="${mp4%.mp4}"
  m4a="$base.m4a"

  if [[ -f "$m4a" ]]; then
    skipped=$((skipped + 1))
    continue
  fi

  codec="$(ffprobe -v error -select_streams a:0 -show_entries stream=codec_name -of csv=p=0 "$mp4" 2>/dev/null || true)"
  codec="${codec//[$'\t\r\n ']/}"

  echo "[extract] $(basename "$mp4") (codec=${codec:-none})"

  if [[ "$codec" == "aac" || "$codec" == "alac" ]]; then
    if ffmpeg -y -hide_banner -loglevel error -i "$mp4" -vn -c:a copy -movflags +faststart "$m4a" </dev/null; then
      done_count=$((done_count + 1))
    else
      failed=$((failed + 1))
      rm -f "$m4a"
      echo "  failed (copy): $mp4" >&2
    fi
  else
    if ffmpeg -y -hide_banner -loglevel error -i "$mp4" -vn -c:a aac -b:a 192k -movflags +faststart "$m4a" </dev/null; then
      done_count=$((done_count + 1))
    else
      failed=$((failed + 1))
      rm -f "$m4a"
      echo "  failed (encode): $mp4" >&2
    fi
  fi
done

echo ""
echo "Summary: scanned=$total extracted=$done_count skipped=$skipped failed=$failed"
