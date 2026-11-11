#!/bin/zsh
# OCR of a scanned book with the macOS Vision framework, page by page, four pages at a time.
#
#   scripts/book/ocr-book.sh <book.pdf> <name> [first] [last]
#
# Writes page images to docs/reference/pages/<name>/ and the text of each page to docs/reference/ocr/<name>/p-NNN.txt,
# then joins them in all.txt. docs/ is ignored by git, so book content never reaches the repository.
set -e
PDF="$1"; NAME="$2"; FIRST="${3:-1}"; LAST="${4:-$(pdfinfo "$PDF" | awk '/^Pages:/{print $2}')}"
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
REF="$ROOT/docs/reference"
BIN="$REF/visionocr"
[ -x "$BIN" ] || swiftc -O "$ROOT/scripts/book/ocr.swift" -o "$BIN"
PAGES="$REF/pages/$NAME"; TEXT="$REF/ocr/$NAME"
mkdir -p "$PAGES" "$TEXT"
# Render the pages once; a rerun only OCRs the pages that have no text yet
[ -n "$(ls "$PAGES"/p-*.png 2>/dev/null | head -1)" ] || pdftoppm -r 300 -png -f "$FIRST" -l "$LAST" "$PDF" "$PAGES/p"
printf '%s\0' "$PAGES"/p-*.png | xargs -0 -I{} -n 1 -P 4 "$ROOT/scripts/book/ocr-page.sh" {} "$TEXT" "$BIN"
for f in "$TEXT"/p-*.txt; do echo "## page $(basename "$f" .txt | sed 's/p-0*//')"; sed 1d "$f"; done > "$TEXT/all.txt"
echo done > "$TEXT/_done"
