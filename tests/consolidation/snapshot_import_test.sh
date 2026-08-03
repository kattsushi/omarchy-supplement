#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
importer=$root/tools/consolidation/import-snapshot.sh
inventory_tool=$root/tools/consolidation/inventory-from-git.sh
security_tool=$root/tools/consolidation/review-tracked-content.sh
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
src=$tmp/source; bare=$tmp/source.git; inv=$tmp/inventory.tsv; report=$tmp/report.tsv; dest=$tmp/dotfiles
git init -q "$src"; git -C "$src" config user.email fixture@example.invalid; git -C "$src" config user.name fixture
for n in $(seq 1 39); do printf 'fixture-%s\n' "$n" > "$src/file-$n"; done
mkdir -p "$src/backgrounds/.config/backgrounds" "$src/mcp" "$src/systems/darwin" "$src/.atl" "$src/nvim/.config/nvim" "$src/zshrc/.config/zsh" "$src/polybar/.config/polybar" "$src/install"
for n in $(seq 1 7); do printf 'media\n' > "$src/backgrounds/.config/backgrounds/$n.png"; done
printf x > "$src/.atl/skill-registry.md"; printf x > "$src/.env.example"; printf x > "$src/.gitignore"; printf x > "$src/.stow-local-ignore"; printf x > "$src/mcp/.config"; printf x > "$src/nvim/.config/nvim/.neoconf.json"; printf x > "$src/nvim/.config/nvim/lazy-lock.json"; printf x > "$src/systems/darwin/flake.lock"; printf x > "$src/systems/darwin/flake.nix"; printf x > "$src/zshrc/.config/zsh/local.example.zsh"
printf '#!/bin/sh\nexit 0\n' > "$src/install/stow.sh"; chmod 755 "$src/install/stow.sh"; ln -s launch_polybar.sh "$src/polybar/.config/polybar/link"
git -C "$src" add .; git -C "$src" commit -qm fixture; git clone -q --bare "$src" "$bare"
"$inventory_tool" --git-dir "$bare" --revision HEAD --output "$inv"
"$security_tool" --git-dir "$bare" --revision HEAD --inventory "$inv" --report "$report" >/dev/null
# An altered inventory must be refused before staging or materializing an unsafe path.
unsafe=$tmp/unsafe.tsv; unsafe_dest=$tmp/unsafe-destination; outside=$tmp/outside-path; cp "$inv" "$unsafe"
sed -i 's/^file\tfile-1\t/file\t..\/outside-path\t/' "$unsafe"
output=$("$importer" apply --git-dir "$bare" --revision HEAD --inventory "$unsafe" --security-report "$report" --destination "$unsafe_dest" 2>&1 || true)
[[ "$output" == *$'snapshot\tFAIL\tINVENTORY_MISMATCH'* ]] || fail unsafe-inventory
[ ! -e "$unsafe_dest" ] && [ ! -e "$outside" ] || fail unsafe-materialized
[[ "$output" != *outside-path* && "$output" != *fixture-* ]] || fail unsafe-leak
# RED: this invocation must fail before the importer is implemented.
"$importer" apply --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest"
[ -d "$dest" ] || fail apply
"$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest" > "$tmp/first"
"$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest" > "$tmp/second"; cmp -s "$tmp/first" "$tmp/second" || fail repeat
[ "$(find "$dest" -type f -o -type l | wc -l)" = 41 ] || fail exact-set
[ ! -e "$dest/backgrounds" ] && [ ! -e "$dest/.env.example" ] || fail excluded
[ "$(stat -c %a "$dest/install/stow.sh")" = 755 ] || fail mode
[ "$(readlink "$dest/polybar/.config/polybar/link")" = launch_polybar.sh ] || fail link
! "$importer" verify --git-dir "$bare" --revision bad --inventory "$inv" --security-report "$report" --destination "$dest" >/dev/null 2>&1 || fail wrong-pin
cp "$report" "$tmp/mismatch"; printf x >> "$tmp/mismatch"; ! "$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$tmp/mismatch" --destination "$dest" >/dev/null 2>&1 || fail report-mismatch
printf x > "$dest/extra"; ! "$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest" >/dev/null 2>&1 || fail extra; rm "$dest/extra"
chmod 644 "$dest/install/stow.sh"; ! "$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest" >/dev/null 2>&1 || fail mode-change; chmod 755 "$dest/install/stow.sh"
rm "$dest/polybar/.config/polybar/link"; ln -s ../escape "$dest/polybar/.config/polybar/link"; ! "$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest" >/dev/null 2>&1 || fail unsafe-link; rm "$dest/polybar/.config/polybar/link"; ln -s launch_polybar.sh "$dest/polybar/.config/polybar/link"
printf x >> "$dest/file-1"; ! "$importer" verify --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$dest" >/dev/null 2>&1 || fail changed
mkdir "$tmp/existing"; printf sentinel > "$tmp/existing/keep"; ! "$importer" apply --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$tmp/existing" >/dev/null 2>&1 || fail existing; [ "$(cat "$tmp/existing/keep")" = sentinel ] || fail existing-unchanged
# Fail the sole final mv through a fixture-local PATH wrapper; production has no test bypass.
mkdir "$tmp/bin" "$tmp/.snapshot-stage.sentinel"; printf keep > "$tmp/.snapshot-stage.sentinel/keep"
cat > "$tmp/bin/mv" <<EOF
#!/usr/bin/env bash
if [ "\${1:-}" = -- ]; then printf 'fixture final rename refusal\\n' >&2; exit 88; fi
exec /usr/bin/mv "\$@"
EOF
chmod 755 "$tmp/bin/mv"; rename_dest=$tmp/rename-destination
output=$(PATH="$tmp/bin:/usr/bin:/bin" "$importer" apply --git-dir "$bare" --revision HEAD --inventory "$inv" --security-report "$report" --destination "$rename_dest" 2>&1 || true)
[[ "$output" == *$'snapshot\tVERIFY\tPASS\tpaths=41'* && "$output" == *$'snapshot\tFAIL\tRENAME'* ]] || fail rename-refusal
[ ! -e "$rename_dest" ] && [ -f "$tmp/.snapshot-stage.sentinel/keep" ] || fail rename-boundary
[ "$(find "$tmp" -maxdepth 1 -name '.snapshot-stage.*' -type d | wc -l)" = 1 ] || fail stage-cleanup
[[ "$output" != *fixture-* && "$output" != *rename-destination* ]] || fail rename-leak
printf 'snapshot import tests: PASS\n'
