#!/bin/zsh
# OCR of one page image: ocr-page.sh <image> <textDir> <visionocr>
f="$1"; TEXT="$2"; BIN="$3"
n=$(basename "$f" .png | sed 's/p-0*//')
out="$TEXT/p-$(printf %03d "$n").txt"
[ -s "$out" ] || "$BIN" "$f" > "$out"
