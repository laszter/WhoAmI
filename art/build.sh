#!/usr/bin/env bash
# สร้าง pixel art ทั้งหมดด้วย Aseprite CLI
#
#   ./art/build.sh                 # gen + export ทุกไฟล์
#   ./art/build.sh gen  'loc_*'    # sprites/*.lua → aseprite/*.aseprite เฉพาะที่ตรง pattern
#   ./art/build.sh export          # aseprite/*.aseprite → public/assets (ใช้ตอนแก้ไฟล์ .aseprite ใน GUI แล้ว)
#   ASEPRITE=/path/to/aseprite ./art/build.sh
#
# ⚠️ gen จะเขียนทับ .aseprite ถ้าแก้ใน GUI แล้วให้รันแค่ export หรือย้ายไฟล์ออกจาก sprites/
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
CMD="${1:-all}"
ONLY="${2:-*}"
OUT="$ROOT/public/assets"
SRC="$ROOT/art/aseprite"
PREVIEW="$ROOT/art/preview"
SCALE=4

if [[ -z "${ASEPRITE:-}" ]]; then
  for c in aseprite \
    "$HOME/Playgrounds/aseprite/build/bin/aseprite" \
    "/Applications/Aseprite.app/Contents/MacOS/aseprite" \
    "$HOME/Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite"; do
    if command -v "$c" >/dev/null 2>&1; then ASEPRITE="$c"; break; fi
  done
fi
[[ -n "${ASEPRITE:-}" ]] || { echo "ไม่เจอ aseprite — ตั้ง ASEPRITE=/path/to/aseprite" >&2; exit 1; }
ase() { "$ASEPRITE" -b "$@"; }

group_of() {
  case "$1" in
    loc_*) echo locations ;;
    icon_*) echo icons ;;
    char_* | avatar_*) echo characters ;;
    ui_* | card_*) echo ui ;;
    result_*) echo result ;;
    *) echo misc ;;
  esac
}

gen() {
  ase --script-param root="$ROOT" --script-param only="$ONLY" --script "$ROOT/art/gen.lua"
}

export_one() {
  local f="$1" name group dir
  name="$(basename "$f" .aseprite)"
  group="$(group_of "$name")"
  dir="$OUT/$group"
  mkdir -p "$dir"
  if [[ -n "$(ase --list-tags "$f")" ]]; then
    # animation → แถบแนวนอน + JSON (ขนาดเฟรม, duration, tags) + GIF ไว้ดูตัวอย่าง
    (cd "$dir" && ase "$f" --sheet-type horizontal --sheet "$name.png" \
      --data "$name.json" --format json-array --list-tags --filename-format '{title}_{frame}')
    ase "$f" --scale "$SCALE" --sheet-type horizontal --sheet "$dir/$name@${SCALE}x.png" >/dev/null
    ase "$f" --scale "$SCALE" --save-as "$PREVIEW/$name.gif"
  else
    ase "$f" --save-as "$dir/$name.png"
    ase "$f" --scale "$SCALE" --save-as "$dir/$name@${SCALE}x.png"
  fi
  echo "  → $group/$name"
}

export_all() {
  mkdir -p "$PREVIEW"
  shopt -s nullglob
  local files=() pat
  IFS=',' read -ra pats <<<"$ONLY"
  for pat in "${pats[@]}"; do files+=("$SRC"/$pat.aseprite); done
  [[ ${#files[@]} -gt 0 ]] || { echo "ไม่มีไฟล์ใน $SRC ที่ตรงกับ '$ONLY'" >&2; exit 1; }
  for f in "${files[@]}"; do export_one "$f"; done

  # LINE MINI App icon ต้องเป็นสี่เหลี่ยมจัตุรัสทึบ 512×512
  if [[ -f "$SRC/app_icon.aseprite" ]]; then
    ase "$SRC/app_icon.aseprite" --scale 16 --save-as "$OUT/misc/app_icon_512.png"
  fi

  # contact sheet ต่อหมวด ไว้รีวิวรวดเดียว (ไม่ได้ใช้ในแอพ)
  for group in locations icons characters ui result misc; do
    local sel=()
    for f in "$SRC"/*.aseprite; do
      [[ "$(group_of "$(basename "$f" .aseprite)")" == "$group" ]] && sel+=("$f")
    done
    [[ ${#sel[@]} -gt 0 ]] || continue
    ase "${sel[@]}" --scale "$SCALE" --sheet-type packed --shape-padding 8 --border-padding 8 \
      --sheet "$PREVIEW/$group.png" >/dev/null
  done
}

case "$CMD" in
  gen) gen ;;
  export) export_all ;;
  all) gen && export_all ;;
  *) echo "usage: $0 [gen|export|all] [pattern]" >&2; exit 1 ;;
esac
