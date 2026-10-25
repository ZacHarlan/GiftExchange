#!/usr/bin/env bash
# Re-render all Blender scenes and rebuild assets/*.webp.
#   bash art/render.sh              # every scene
#   bash art/render.sh gift menorah # just these
# Needs Blender (set BLENDER=/path/to/blender if not in /Applications) and python3 + Pillow.
set -euo pipefail
cd "$(dirname "$0")/.."
BLENDER="${BLENDER:-/Applications/Blender.app/Contents/MacOS/Blender}"
[[ -x "$BLENDER" ]] || { echo "Blender not found at $BLENDER (set BLENDER=...)" >&2; exit 1; }
python3 -c 'import PIL' 2>/dev/null || { echo "Pillow missing: python3 -m pip install pillow" >&2; exit 1; }

scenes=("$@")
(( ${#scenes[@]} )) || scenes=(gift hero dreidel menorah latkes gelt)
mkdir -p art/build
for s in "${scenes[@]}"; do
  echo "[render] $s"
  "$BLENDER" -b --factory-startup -P "art/$s.py" -- art/build 2>&1 | grep -E '\[art\]|Error|Traceback' || true
done
python3 art/post.py
