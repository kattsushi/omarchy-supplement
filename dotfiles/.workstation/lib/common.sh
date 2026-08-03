#!/usr/bin/env bash
set -euo pipefail
refuse() { printf 'refusal\t%s\n' "$1" >&2; exit 1; }
regular() { [ -f "$1" ] && [ ! -L "$1" ] || refuse CONTROL; }
sorted_unique() { LC_ALL=C sort -cu "$1" >/dev/null 2>&1 || refuse DATA; }
