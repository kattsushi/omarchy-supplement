#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cli=$root/bin/workstation-dotfiles
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
run() { local out status; set +e; out=$("$@" 2>&1); status=$?; set -e; printf '%s\n%s\n' "$status" "$out"; }
work=$(mktemp -d "${TMPDIR:-/tmp}/stow-test.XXXXXX"); trap 'rm -rf -- "$work"' EXIT
mkdir -p "$work/bin" "$work/target" "$work/home/.local/share/omarchy"
printf sentinel > "$work/home/.local/share/omarchy/sentinel"
cat > "$work/bin/stow" <<'EOF'
#!/usr/bin/env bash
printf 'cwd=%s\nargs=%s\n' "$PWD" "$*" > "$STOW_CAPTURE"
printf '%s\n' "${STOW_PROSE:-secret-stow-prose}" >&2
[ "${STOW_FAIL:-0}" = 0 ]
EOF
chmod +x "$work/bin/stow"
snapshot() { find "$1" -printf '%P|%m|%y|%l|%T@\n' | LC_ALL=C sort; }
source_before=$(snapshot "$root/dotfiles"); target_before=$(snapshot "$work/target")
out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" HOME="$work/home" "$cli" stow check --profile shared --platform linux --target "$work/target")
[ "$out" = $'0\nstatus\tsuccess\tchecked' ] || fail clear
[ "$(cat "$work/capture")" = $'cwd='"$root/dotfiles"$'\nargs=--simulate --verbose=2 --no-folding --target '"$work/target"' nvim starship tmux zshrc' ] || fail argv-cwd
[ "$source_before" = "$(snapshot "$root/dotfiles")" ] && [ "$target_before" = "$(snapshot "$work/target")" ] || fail mutation
[ "$(cat "$work/home/.local/share/omarchy/sentinel")" = sentinel ] || fail active-home
for pair in 'shared linux' 'arch/omarchy linux' 'macos darwin'; do read -r profile platform <<< "$pair"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" "$cli" stow check --profile "$profile" --platform "$platform" --target "$work/target"); [[ $out = $'0\nstatus\tsuccess\tchecked' ]] || fail profile; done
for pair in 'arch/omarchy darwin PROFILE' 'unknown linux PROFILE' 'shared nope PLATFORM'; do read -r profile platform reason <<< "$pair"; out=$(run env PATH="$work/bin:$PATH" "$cli" stow check --profile "$profile" --platform "$platform" --target "$work/target"); [[ $out = $'2\nstatus\trefused\t'"$reason" ]] || fail selector; done
leaf=$(find "$root/dotfiles/nvim" -type f -print -quit); relative=${leaf#"$root/dotfiles/nvim/"}; mkdir -p "$work/target/${relative%/*}"; printf unmanaged > "$work/target/$relative"
for kind in file dir wrong dangling; do rm -rf "$work/target/$relative"; case $kind in file) : > "$work/target/$relative";; dir) mkdir "$work/target/$relative";; wrong) ln -s /bad "$work/target/$relative";; dangling) ln -s missing "$work/target/$relative";; esac; out=$(run env PATH="$work/bin:$PATH" "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'2\nstatus\trefused\tOCCUPIED' ]] || fail "$kind"; done
rm -rf "$work/target/$relative"; ln -s "$leaf" "$work/target/$relative"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'0\nstatus\tsuccess\tchecked' ]] || fail exact-link
rm "$work/target/$relative"; ln -s "$work/target" "$work/parent-link"; out=$(run env PATH="$work/bin:$PATH" "$cli" stow check --profile shared --platform linux --target "$work/parent-link"); [[ $out = $'2\nstatus\trefused\tSYMLINK_TARGET' ]] || fail parent-link
out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" STOW_FAIL=1 "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'2\nstatus\trefused\tSTOW_SIMULATION' && $out != *secret-stow-prose* ]] || fail simulation
mkdir "$work/no-stow"; for tool in awk find grep sed sort comm tail stat sha256sum wc mktemp readlink cut rm cmp dirname bash; do ln -s "/usr/bin/$tool" "$work/no-stow/$tool"; done
out=$(run env PATH="$work/no-stow" /usr/bin/bash "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'69\nstatus\tfailed\tDEPENDENCY' ]] || fail "dependency:$out"
printf 'stow tests: PASS\n'
