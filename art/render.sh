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
(( ${#scenes[@]} )) || scenes=(gift hero dreidel menorah latkes gelt countdown)

# The countdown's Nativity figures start from Blender Studio's "Human Base Meshes" (CC0, public
# domain). They are fetched once into a cache folder and are not kept in this repo.
HBM_DIR="${HOME}/Library/Caches/giftexchange-art/hbm"
HBM_ZIP="human-base-meshes-bundle-v1.4.1.zip"
if [[ " ${scenes[*]} " == *" countdown "* && ! -f "$HBM_DIR/${HBM_ZIP%.zip}/human_base_meshes_bundle.blend" ]]; then
  echo "[render] fetching Human Base Meshes (CC0)"
  mkdir -p "$HBM_DIR"
  curl -fsSL -o "$HBM_DIR/$HBM_ZIP" "https://download.blender.org/demo/asset-bundles/human-base-meshes/$HBM_ZIP"
  unzip -q -o "$HBM_DIR/$HBM_ZIP" -d "$HBM_DIR"
fi
mkdir -p art/build
for s in "${scenes[@]}"; do
  echo "[render] $s"
  "$BLENDER" -b --factory-startup -P "art/$s.py" -- art/build 2>&1 | grep -E '\[art\]|Error|Traceback' || true
done
python3 art/post.py "${scenes[@]}"
