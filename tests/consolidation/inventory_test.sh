#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
script=$root/tools/consolidation/inventory-from-git.sh
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
src=$tmp/source; out=$tmp/inventory.tsv; decisions=$tmp/decisions.md
git init -q "$src"; git -C "$src" config user.email fixture@example.invalid; git -C "$src" config user.name fixture
backgrounds=(
  backgrounds/.config/backgrounds/arch-rainbow.png
  backgrounds/.config/backgrounds/better_shaded_landscape.jpg
  backgrounds/.config/backgrounds/car-with-full-moon-background.jpg
  backgrounds/.config/backgrounds/lofiwallpaper.png
  backgrounds/.config/backgrounds/nice-blue-background.png
  backgrounds/.config/backgrounds/shaded.png
  backgrounds/.config/backgrounds/shaded_landscape.png
)
for path in "${backgrounds[@]}"; do mkdir -p "$(dirname "$src/$path")"; printf 'background\n' > "$src/$path"; done
mkdir -p "$src"/{mcp,systems/darwin,polybar/.config/polybar,nvim/.config/nvim,.cache}
printf 'reference\n' > "$src/mcp/config.json"; printf 'host\n' > "$src/systems/darwin/host.nix"
printf 'nvim\n' > "$src/nvim/.config/nvim/init.lua"; printf 'cache\n' > "$src/.cache/seed"
printf '#!/bin/sh\n' > "$src/run"; chmod +x "$src/run"
ln -s ../theme.ini "$src/polybar/.config/polybar/colors.ini"
for n in $(seq -w 1 45); do printf '%s\n' "$n" > "$src/file-$n"; done
git -C "$src" add .; rev=$(git -C "$src" commit-tree "$(git -C "$src" write-tree)" < /dev/null)
"$script" --git-dir "$src/.git" --revision "$rev" --output "$out"
[ "$(grep -c $'^file\t' "$out")" = 58 ] || fail rows
LC_ALL=C sort -c -t $'\t' -k2,2 < <(tail -n +2 "$out") || fail sorted
grep -q $'^file\trun\texecutable\t100755\t10\tsha256:' "$out" || fail executable
grep -q $'^file\tpolybar/.config/polybar/colors.ini\tsymlink\t120000\t12\t../theme.ini' "$out" || fail symlink
grep -q $'^file\tmcp/config.json\t.*\texcluded/local\texclude\t' "$out" || fail mcp
grep -q $'^file\tsystems/darwin/host.nix\t.*\tmacos\texclude\t' "$out" || fail darwin
mapfile -t actual < <(awk -F $'\t' '$2 ~ /^backgrounds\// {print $2}' "$out")
[ "${#actual[@]}" = 7 ] && [ "$(printf '%s\n' "${actual[@]}")" = "$(printf '%s\n' "${backgrounds[@]}")" ] || fail backgrounds
for case_name in missing duplicate unknown unsafe unresolved; do
  cp "$out" "$tmp/$case_name.tsv"
  case "$case_name" in
    missing) sed -i '2d' "$tmp/$case_name.tsv";; duplicate) sed -i '2p' "$tmp/$case_name.tsv";;
    unknown) sed -i '2s/\tfile\t/\tbogus\t/' "$tmp/$case_name.tsv";;
    unsafe) sed -i '2s/\tclear$/\tblocked/' "$tmp/$case_name.tsv";;
    unresolved) sed -i '2s/\tinclude\t/\tpending\t/' "$tmp/$case_name.tsv";;
  esac
  ! "$script" --validate "$tmp/$case_name.tsv" >/dev/null 2>&1 || fail "$case_name accepted"
done
cat > "$decisions" <<'EOF'
import_method=pending
backgrounds=include-separately
import_authorization=pending
size_exception=pending
EOF
"$script" --validate-decisions "$decisions" || fail decisions
printf 'inventory tests: PASS\n'
