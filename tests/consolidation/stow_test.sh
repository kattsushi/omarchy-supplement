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
if [ "${1:-}" != --simulate ] && [ -n "${STOW_COUNT:-}" ]; then count=$(cat "$STOW_COUNT" 2>/dev/null || printf 0); printf %s "$((count + 1))" > "$STOW_COUNT"; fi
printf '%s\n' "${STOW_PROSE:-secret-stow-prose}" >&2
if [ "${STOW_MUTATE:-}" = simulation ] && [ "${1:-}" = --simulate ]; then printf x >> "${STOW_MUTATE_PATH:-.workstation/lib/stow.sh}"; fi
if [ "${STOW_MUTATE:-}" = apply ] && [ "${1:-}" != --simulate ]; then /usr/bin/stow "$@"; printf x >> .workstation/lib/stow.sh; exit 0; fi
if [ "${STOW_PARTIAL:-0}" = 1 ] && [ "${1:-}" != --simulate ]; then : > "$3/partial"; exit 1; fi
[ "${STOW_FAIL:-0}" = 0 ]
EOF
chmod +x "$work/bin/stow"
cat > "$work/bin/readlink" <<'EOF'
#!/usr/bin/env bash
if [ -n "${READLINK_MUTATE_AFTER:-}" ]; then n=$(cat "$READLINK_COUNT" 2>/dev/null || printf 0); n=$((n + 1)); printf %s "$n" > "$READLINK_COUNT"; [ "$n" = "$READLINK_MUTATE_AFTER" ] && printf x >> "$STOW_MUTATE_ROOT/.workstation/lib/stow.sh"; fi
exec /usr/bin/readlink "$@"
EOF
chmod +x "$work/bin/readlink"
snapshot() { find "$1" -printf '%P|%m|%y|%l|%T@\n' | LC_ALL=C sort; }
source_before=$(snapshot "$root/dotfiles"); target_before=$(snapshot "$work/target")
out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" HOME="$work/home" "$cli" stow check --profile shared --platform linux --target "$work/target")
[ "$out" = $'0\nstatus\tsuccess\tchecked' ] || fail clear
[ "$(cat "$work/capture")" = $'cwd='"$root/dotfiles"$'\nargs=--simulate --verbose=2 --no-folding --target '"$work/target"' nvim starship tmux zshrc' ] || fail argv-cwd
[ "$source_before" = "$(snapshot "$root/dotfiles")" ] && [ "$target_before" = "$(snapshot "$work/target")" ] || fail mutation
[ "$(cat "$work/home/.local/share/omarchy/sentinel")" = sentinel ] || fail active-home
for pair in 'shared linux' 'arch/omarchy linux' 'macos darwin'; do read -r profile platform <<< "$pair"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" "$cli" stow check --profile "$profile" --platform "$platform" --target "$work/target"); [[ $out = $'0\nstatus\tsuccess\tchecked' ]] || fail profile; done
for pair in 'arch/omarchy darwin PROFILE' 'unknown linux PROFILE' 'shared nope PLATFORM'; do read -r profile platform reason <<< "$pair"; out=$(run env PATH="$work/bin:$PATH" "$cli" stow check --profile "$profile" --platform "$platform" --target "$work/target"); [[ $out = $'2\nstatus\trefused\t'"$reason" ]] || fail selector; done
leaf=$(find "$root/dotfiles/nvim" -type f ! -name .gitignore -print -quit); relative=${leaf#"$root/dotfiles/nvim/"}; mkdir -p "$work/target/${relative%/*}"; printf unmanaged > "$work/target/$relative"
for kind in file dir wrong dangling; do rm -rf "$work/target/$relative"; case $kind in file) : > "$work/target/$relative";; dir) mkdir "$work/target/$relative";; wrong) ln -s /bad "$work/target/$relative";; dangling) ln -s missing "$work/target/$relative";; esac; out=$(run env PATH="$work/bin:$PATH" "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'2\nstatus\trefused\tOCCUPIED' ]] || fail "$kind"; done
rm -rf "$work/target/$relative"; ln -s "$leaf" "$work/target/$relative"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'0\nstatus\tsuccess\tchecked' ]] || fail exact-link
    rm "$work/target/$relative"; ln -s "$work/target" "$work/parent-link"; lexical_before=$(snapshot "$work/target")
    for target_alias in "$work//target" "$work/target/." "$work/target/../target" "$work/target/" target . .. "$work/parent-link"; do
      out=$(run env PATH="$work/bin:$PATH" "$cli" stow check --profile shared --platform linux --target "$target_alias")
      [[ $out = $'2\nstatus\trefused\tTARGET' && $out != *secret-stow-prose* ]] || fail "target-alias:$out"
      [ "$lexical_before" = "$(snapshot "$work/target")" ] || fail target-alias-mutation
    done
out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" STOW_FAIL=1 "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'2\nstatus\trefused\tSTOW_SIMULATION' && $out != *secret-stow-prose* ]] || fail simulation
mkdir "$work/no-stow"; for tool in awk find grep sed sort comm tail stat sha256sum wc mktemp readlink cut rm cmp dirname bash; do ln -s "/usr/bin/$tool" "$work/no-stow/$tool"; done
out=$(run env PATH="$work/no-stow" /usr/bin/bash "$cli" stow check --profile shared --platform linux --target "$work/target"); [[ $out = $'69\nstatus\tfailed\tDEPENDENCY' ]] || fail "dependency:$out"
out=$(run env PATH="$work/bin:$PATH" "$cli" stow verify --profile shared --platform linux --target "$work/target")
[[ $out = $'3\nstatus\tfailed\tSTOW_VERIFY' ]] || fail "verify-absent:$out"
# Real GNU Stow applies a copied, fingerprinted source; the second call has no Stow dependency.
cp -a "$root/dotfiles" "$work/source"; cli2=$work/source/.workstation/bin/workstation-dotfiles; mkdir "$work/applied"
out=$(run env PATH=/usr/bin:/bin HOME="$work/home" "$cli2" stow apply --profile shared --platform linux --target "$work/applied")
[[ $out = $'0\nprofile\tshared\npackage\tnvim\npackage\tstarship\npackage\ttmux\npackage\tzshrc\nstatus\tsuccess\tapplied' ]] || fail "real-apply:$out"
out=$(run env PATH=/usr/bin:/bin "$cli2" stow verify --profile shared --platform linux --target "$work/applied"); [[ $out = $'0\nstatus\tsuccess\tverified' ]] || fail "real-verify:$out"
[ -L "$work/applied/.config/nvim/.gitignore" ] && [ "$(readlink -f "$work/applied/.config/nvim/.gitignore")" = "$work/source/nvim/.config/nvim/.gitignore" ] && [ ! -e "$work/applied/.stow-local-ignore" ] || fail gitignore
find "$work/applied" -type l -print0 | while IFS= read -r -d '' link; do [ "$(readlink -f "$link")" = "$(readlink -f "$link")" ] || fail link; done
# A copied materialized source under TARGET/dotfiles is the sole supported ancestor topology.
mkdir -p "$work/materialized/home"; cp -a "$root/dotfiles" "$work/materialized/home/dotfiles"; materialized_root=$work/materialized/home/dotfiles; materialized_cli=$materialized_root/.workstation/bin/workstation-dotfiles
materialized_before=$(snapshot "$materialized_root"); [ "$(find "$materialized_root" \( -type f -o -type l \) | wc -l)" = 57 ] || fail materialized-leaves
out=$(run env PATH=/usr/bin:/bin HOME="$work/home" "$materialized_cli" stow check --profile shared --platform linux --target "$work/materialized/home")
[[ $out = $'0\nstatus\tsuccess\tchecked' ]] || fail "materialized-check:$out"
out=$(run env PATH=/usr/bin:/bin "$materialized_cli" stow apply --profile arch/omarchy --platform linux --target "$work/materialized/home")
[[ $out = *$'0\nprofile\tarch/omarchy'*$'\nstatus\tsuccess\tapplied' ]] || fail "materialized-apply:$out"
out=$(run env PATH=/usr/bin:/bin "$materialized_cli" stow verify --profile arch/omarchy --platform linux --target "$work/materialized/home")
[[ $out = $'0\nstatus\tsuccess\tverified' ]] || fail "materialized-verify:$out"
materialized_target_before=$(snapshot "$work/materialized/home")
out=$(run env PATH="$work/no-stow" /usr/bin/bash "$materialized_cli" stow apply --profile arch/omarchy --platform linux --target "$work/materialized/home")
[[ $out = *$'0\nprofile\tarch/omarchy'*$'\nstatus\tnoop\tunchanged' ]] || fail "materialized-noop:$out"
[ "$materialized_before" = "$(snapshot "$materialized_root")" ] && [ "$materialized_target_before" = "$(snapshot "$work/materialized/home")" ] || fail materialized-mutation
[ -L "$work/materialized/home/.config/nvim/.gitignore" ] && [ -L "$work/materialized/home/.config/launch_polybar.sh" ] && [ ! -e "$work/materialized/home/.stow-local-ignore" ] || fail materialized-links
    # Other source-under-target layouts, aliases, and target links refuse before Stow runs.
    for layout in below wrong-name nested traversal; do
      mkdir -p "$work/negative-$layout/home"; case $layout in
        below) cp -a "$root/dotfiles" "$work/negative-$layout/home/dotfiles"; negative_cli=$work/negative-$layout/home/dotfiles/.workstation/bin/workstation-dotfiles; negative_target=$work/negative-$layout/home/dotfiles/nvim;;
        wrong-name) cp -a "$root/dotfiles" "$work/negative-$layout/home/other"; negative_cli=$work/negative-$layout/home/other/.workstation/bin/workstation-dotfiles; negative_target=$work/negative-$layout/home;;
        nested) mkdir "$work/negative-$layout/home/nested"; cp -a "$root/dotfiles" "$work/negative-$layout/home/nested/dotfiles"; negative_cli=$work/negative-$layout/home/nested/dotfiles/.workstation/bin/workstation-dotfiles; negative_target=$work/negative-$layout/home;;
        traversal) cp -a "$root/dotfiles" "$work/negative-$layout/home/dotfiles"; negative_cli=$work/negative-$layout/home/dotfiles/.workstation/bin/workstation-dotfiles; negative_target=$work/negative-$layout/home/../home;;
      esac
      negative_before=$(snapshot "$work/negative-$layout/home"); out=$(run env PATH="$work/bin:$PATH" "$negative_cli" stow check --profile shared --platform linux --target "$negative_target"); [[ $out = $'2\nstatus\trefused\tTARGET' && $out != *secret-stow-prose* ]] || fail "negative-$layout:$out"; [ "$negative_before" = "$(snapshot "$work/negative-$layout/home")" ] || fail "negative-mutation-$layout"
    done
    mkdir -p "$work/negative-target-link/real"; cp -a "$root/dotfiles" "$work/negative-target-link/real/dotfiles"; ln -s "$work/negative-target-link/real" "$work/negative-target-link/alias"
    out=$(run env PATH="$work/bin:$PATH" "$work/negative-target-link/real/dotfiles/.workstation/bin/workstation-dotfiles" stow check --profile shared --platform linux --target "$work/negative-target-link/alias")
    [[ $out = $'2\nstatus\trefused\tTARGET' && $out != *secret-stow-prose* ]] || fail "negative-target-link:$out"
    mkdir -p "$work/negative-source-link/home"; cp -a "$root/dotfiles" "$work/negative-source-link/real"; ln -s "$work/negative-source-link/real" "$work/negative-source-link/home/dotfiles"
    out=$(run /usr/bin/bash -c 'source "$1/.workstation/lib/common.sh"; source "$1/.workstation/lib/stow.sh"; stow_check "$2" --profile shared --platform linux --target "$3"' _ "$root/dotfiles" "$work/negative-source-link/home/dotfiles" "$work/negative-source-link/home")
    [[ $out = $'2\nstatus\trefused\tTARGET' ]] || fail "negative-source-link:$out"
    mkdir -p "$work/ownership/nvim/dotfiles"; : > "$work/ownership/nvim/dotfiles/owned"; out=$(run /usr/bin/bash -c 'source "$1/.workstation/lib/common.sh"; source "$1/.workstation/lib/stow.sh"; STOW_PACKAGES=(nvim); STOW_SOURCE_UNDER_TARGET=1; stow_owners "$2"' _ "$root/dotfiles" "$work/ownership")
    [[ $out = $'1' ]] || fail "ownership-source-subtree:$out"
    mkdir "$work/arch"; out=$(run env PATH=/usr/bin:/bin "$cli2" stow apply --profile arch/omarchy --platform linux --target "$work/arch"); [[ $out = *$'0\nprofile\tarch/omarchy'*$'\nstatus\tsuccess\tapplied' ]] || fail "arch-apply:$out"; [ -L "$work/arch/.config/launch_polybar.sh" ] && [ -L "$work/arch/.config/nvim/.gitignore" ] || fail arch-links
for kind in missing regular dangling escape intermediate; do cp -a "$work/applied" "$work/verify-$kind"; leaf="$work/verify-$kind/.config/nvim/init.lua"; case $kind in missing) rm "$leaf";; regular) rm "$leaf"; : > "$leaf";; dangling) rm "$leaf"; ln -s missing "$leaf";; escape) rm "$leaf"; ln -s /bad "$leaf";; intermediate) rm -rf "$work/verify-$kind/.config/nvim"; ln -s /bad "$work/verify-$kind/.config/nvim";; esac; out=$(run env PATH="$work/bin:$PATH" "$cli2" stow verify --profile shared --platform linux --target "$work/verify-$kind"); [[ $out = $'3\nstatus\tfailed\tSTOW_VERIFY' ]] || fail "verify-$kind:$out"; done
applied_before=$(snapshot "$work/applied")
out=$(run env PATH="$work/no-stow" /usr/bin/bash "$cli2" stow apply --profile shared --platform linux --target "$work/applied")
[[ $out = $'0\nprofile\tshared\npackage\tnvim\npackage\tstarship\npackage\ttmux\npackage\tzshrc\nstatus\tnoop\tunchanged' ]] || fail "noop:$out"
[ "$applied_before" = "$(snapshot "$work/applied")" ] || fail noop-mutation
mkdir "$work/partial"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" STOW_COUNT="$work/count" STOW_PARTIAL=1 "$cli2" stow apply --profile shared --platform linux --target "$work/partial"); [[ $out = *$'3\nprofile\tshared'*$'\nstatus\tfailed\tSTOW_APPLY\nguidance\tdocs/dotfiles/limitations.md' && $out != *secret-stow-prose* && -f "$work/partial/partial" && "$(cat "$work/count")" = 1 && "$(cat "$work/capture")" = $'cwd='"$work/source"$'\nargs=--no-folding --target '"$work/partial"' nvim starship tmux zshrc' ]] || fail partial-failure
mkdir "$work/wrong"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" "$cli2" stow apply --profile shared --platform linux --target "$work/wrong"); [[ $out = *$'3\nprofile\tshared'*$'\nstatus\tfailed\tSTOW_VERIFY\nguidance\tdocs/dotfiles/limitations.md' ]] || fail post-verify
for kind in missing nonempty mode; do cp -a "$root/dotfiles" "$work/$kind"; case $kind in missing) rm "$work/$kind/nvim/.stow-local-ignore";; nonempty) printf x > "$work/$kind/nvim/.stow-local-ignore";; mode) chmod 600 "$work/$kind/nvim/.stow-local-ignore";; esac; mkdir "$work/$kind-target"; out=$(run env PATH="$work/bin:$PATH" "$work/$kind/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/$kind-target"); [[ $out = $'2\nstatus\trefused\tSOURCE' ]] || fail "local-ignore-$kind:$out"; done
cp -a "$root/dotfiles" "$work/race-sim"; mkdir "$work/race-sim-target"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" STOW_COUNT="$work/race-sim-count" STOW_MUTATE=simulation "$work/race-sim/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/race-sim-target"); [[ $out = *$'2\nprofile\tshared'*$'\nstatus\trefused\tSOURCE_CHANGED' && ! -e "$work/race-sim-count" ]] || fail race-simulation
for path in nvim/.config/nvim/init.lua .workstation/lib/common.sh nvim/.stow-local-ignore; do cp -a "$root/dotfiles" "$work/race-source"; mkdir "$work/race-source-target"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" STOW_MUTATE=simulation STOW_MUTATE_PATH="$path" "$work/race-source/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/race-source-target"); [[ $out = *$'2\nprofile\tshared'*$'\nstatus\trefused\tSOURCE_CHANGED' ]] || fail "race-source:$path:$out"; rm -rf "$work/race-source" "$work/race-source-target"; done
cp -a "$root/dotfiles" "$work/race-apply"; mkdir "$work/race-apply-target"; out=$(run env PATH="$work/bin:$PATH" STOW_CAPTURE="$work/capture" STOW_MUTATE=apply "$work/race-apply/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/race-apply-target"); [[ $out = *$'3\nprofile\tshared'*$'\nstatus\tfailed\tSOURCE_CHANGED\nguidance\tdocs/dotfiles/limitations.md' && -L "$work/race-apply-target/.config/nvim/init.lua" ]] || fail race-apply
cp -a "$root/dotfiles" "$work/race-verify"; mkdir "$work/race-verify-target"; env PATH=/usr/bin:/bin "$work/race-verify/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/race-verify-target" >/dev/null; out=$(run env PATH="$work/bin:$PATH" READLINK_COUNT="$work/readlink-count" READLINK_MUTATE_AFTER=3 STOW_MUTATE_ROOT="$work/race-verify" "$work/race-verify/.workstation/bin/workstation-dotfiles" stow verify --profile shared --platform linux --target "$work/race-verify-target"); [[ $out = $'3\nstatus\tfailed\tSOURCE_CHANGED' ]] || fail race-verify
cp -a "$root/dotfiles" "$work/race-noop"; mkdir "$work/race-noop-target"; env PATH=/usr/bin:/bin "$work/race-noop/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/race-noop-target" >/dev/null; out=$(run env PATH="$work/bin:$PATH" READLINK_COUNT="$work/readlink-noop-count" READLINK_MUTATE_AFTER=3 STOW_MUTATE_ROOT="$work/race-noop" "$work/race-noop/.workstation/bin/workstation-dotfiles" stow apply --profile shared --platform linux --target "$work/race-noop-target"); [[ $out = *$'2\nprofile\tshared'*$'\nstatus\trefused\tSOURCE_CHANGED' ]] || fail race-noop
printf 'stow tests: PASS\n'
