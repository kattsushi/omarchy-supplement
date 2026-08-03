#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cli=$root/bin/workstation-dotfiles
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
work=$(mktemp -d "${TMPDIR:-/tmp}/materialize-test.XXXXXX")
trap 'rm -rf -- "$work"' EXIT
mkdir "$work/bin" "$work/target"
cat > "$work/bin/git" <<'EOF'
#!/usr/bin/env bash
set -eu
args="$*"
case $args in
  *'rev-parse --is-inside-work-tree'*) [ "${MOCK_CASE:-clean}" != non-git ] && printf true ;;
  *'rev-parse --show-toplevel'*) printf '%s\n' "${MOCK_GIT_TOP:-${MOCK_TOP:-$2}}" ;;
  *'remote get-url --all origin'*) [ "${MOCK_CASE:-clean}" != wrong-remote ] && printf '%s\n' "${MOCK_URL:-git@github.com:kattsushi/dotfiles-v2.git}" ;;
  *' remote'*) [ "${MOCK_CASE:-clean}" = multiple ] && printf 'origin\nother\n' || printf 'origin\n' ;;
  *'rev-parse HEAD'*) printf '%s\n' "${MOCK_PIN:-6e36129058e5b0550ef5345e192557e785befbf5}" ;;
  *symbolic-ref*) [ "${MOCK_CASE:-clean}" != detached ] && printf '%s\n' "${MOCK_BRANCH:-master}" ;;
  *'rev-parse --abbrev-ref'*) [ "${MOCK_CASE:-clean}" != ambiguous-upstream ] && printf '%s\n' "${MOCK_UPSTREAM:-origin/master}" ;;
  *show-ref*) [ "${MOCK_CASE:-clean}" != missing-upstream ] ;;
  *'diff --cached --quiet'*) [ "${MOCK_CASE:-clean}" != staged ] ;;
  *'diff --quiet'*) [ "${MOCK_CASE:-clean}" != dirty ] ;;
  *ls-files*) [ "${MOCK_CASE:-clean}" = untracked ] && printf injected-untracked ;;
  *check-ignore*) [ "${MOCK_CASE:-clean}" = ignored ] ;;
  *'merge-base --is-ancestor refs/remotes/origin/master HEAD'*) [ "${MOCK_CASE:-clean}" != divergent ] ;;
  *'merge-base --is-ancestor HEAD refs/remotes/origin/master'*) [ "${MOCK_CASE:-clean}" != unpushed ] ;;
  *'status --porcelain=v1'*) ;;
  *'ls-files -s'*) ;;
  *'config --local --list'*) ;;
  *write-tree*) printf tree ;;
      *) exit 1 ;;
esac
EOF
chmod +x "$work/bin/git"
cat > "$work/bin/df" <<'EOF'
#!/usr/bin/env bash
set -eu
count=$(cat "$DF_COUNT" 2>/dev/null || printf 0); count=$((count + 1)); printf %s "$count" > "$DF_COUNT"
/usr/bin/df "$@"
[ "$count" = 2 ] || exit 0
parent=${!#}; stage=$(find "$parent" -maxdepth 1 -type d -name '.workstation-materialize-stage.*' -print -quit)
case ${DF_MUTATION:-} in
  extra) : > "$stage/extra";; missing) rm "$stage/README.md";; hash) printf x | dd of="$stage/.workstation/lib/common.sh" conv=notrunc status=none;; mode) chmod 600 "$stage/.workstation/lib/common.sh";;
  link) rm "$stage/polybar/.config/launch_polybar.sh"; ln -s ../dotfiles/polybar/.config/not-present "$stage/polybar/.config/launch_polybar.sh";;
  type) rm "$stage/.workstation/lib/common.sh"; ln -s ../README.md "$stage/.workstation/lib/common.sh";; nested-git) mkdir "$stage/.git";; signal) sleep 5;; target) : > "$TARGET_MUTATION";;
esac
EOF
chmod +x "$work/bin/df"
cat > "$work/bin/mv" <<'EOF'
#!/usr/bin/env bash
set -eu
if [ -n "${MV_COUNT:-}" ]; then count=$(cat "$MV_COUNT" 2>/dev/null || printf 0); printf %s "$((count + 1))" > "$MV_COUNT"; fi
exec /usr/bin/mv "$@"
EOF
chmod +x "$work/bin/mv"
cat > "$work/bin/rmdir" <<'EOF'
#!/usr/bin/env bash
set -eu
path=${!#}
if [ -n "${RMDIR_INJECTED:-}" ] && [[ $path == *.workstation-backup.* ]]; then
  printf '%s' "$RMDIR_INJECTED" > "$path/foreign-marker"
fi
exec /usr/bin/rmdir "$@"
EOF
chmod +x "$work/bin/rmdir"
run() { [ "${1:-clean}" != ignored ] || : > "$work/target/.env"; PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_CASE=${1:-clean} "$cli" materialize inspect --target "$work/target"; }
expect() { local got want; want=$1; shift; set +e; got=$("$@" 2>&1); status=$?; set -e; [ "$got" = "$want" ] || fail "$want:$got"; case $want in $'status\trefused'*) [ "$status" -ne 0 ] || fail status;; *) [ "$status" = 0 ] || fail status;; esac; [[ $got != *"$work"* && $got != *injected* ]] || fail leak; }
expect $'status\tabsent\teligible' env PATH="$work/bin:$PATH" MOCK_TOP="$work/missing" "$cli" materialize inspect --target "$work/missing"
expect $'status\tsuccess\texpected-clean' run clean
for pair in 'non-git NON_GIT' 'wrong-remote WRONG_REMOTE' 'multiple MULTIPLE_REMOTE' 'dirty DIRTY' 'staged STAGED' 'untracked UNTRACKED' 'ignored IGNORED_SENSITIVE' 'unpushed UNPUSHED' 'divergent DIVERGENT' 'detached DETACHED_BRANCH' 'ambiguous-upstream AMBIGUOUS_UPSTREAM'; do read -r case_name expected < <(printf '%s\n' "$pair"); expect $'status\trefused\t'"$expected" run "$case_name"; done
expect $'status\trefused\tWRONG_LINEAGE' env PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_URL=ssh://evil.example/injected "$cli" materialize inspect --target "$work/target"
expect $'status\trefused\tWRONG_LINEAGE' env PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_URL=https://user:secret@github.com/kattsushi/dotfiles-v2 "$cli" materialize inspect --target "$work/target"
expect $'status\trefused\tWRONG_PIN' env PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_PIN=bad "$cli" materialize inspect --target "$work/target"
expect $'status\trefused\tAMBIGUOUS_BRANCH' env PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_BRANCH=other "$cli" materialize inspect --target "$work/target"
expect $'status\trefused\tAMBIGUOUS_UPSTREAM' run missing-upstream
expect $'status\trefused\tAMBIGUOUS_UPSTREAM' env PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_UPSTREAM=origin/other "$cli" materialize inspect --target "$work/target"
expect $'status\trefused\tNESTED_GIT' env PATH="$work/bin:$PATH" MOCK_TOP="$work/target" MOCK_GIT_TOP="$work" "$cli" materialize inspect --target "$work/target"
ln -s "$work/target" "$work/link"
expect $'status\trefused\tSYMLINK_TARGET' "$cli" materialize inspect --target "$work/link"
printf x > "$work/special"
expect $'status\trefused\tSPECIAL_TARGET' "$cli" materialize inspect --target "$work/special"
expect $'status\trefused\tMANAGED_SOURCE' "$cli" materialize inspect --target "$root/dotfiles"
expect $'status\trefused\tMANAGED_SOURCE' "$cli" materialize inspect --target "$root"
cp -R "$root/dotfiles" "$work/exact-content"
expect $'status\trefused\tUNMANAGED_DIRECTORY' "$cli" materialize inspect --target "$work/exact-content"
fp=$($cli materialize fingerprint); pattern=$'fingerprint\tsha256\t[0-9a-f]{64}'; [[ $fp =~ $pattern ]] || fail fingerprint
cp -R "$root/dotfiles" "$work/dotfiles"
fp_before=$("$work/dotfiles/.workstation/bin/workstation-dotfiles" materialize fingerprint)
printf '\n# sensitivity\n' >> "$work/dotfiles/.workstation/lib/materialize.sh"
fp_after=$("$work/dotfiles/.workstation/bin/workstation-dotfiles" materialize fingerprint)
[ "$fp_before" != "$fp_after" ] || fail fingerprint-sensitivity
# Absent targets install the 48 manifest leaves plus eight control leaves exactly once.
apply_target="$work/apply-target"
apply_output=$("$cli" materialize apply --target "$apply_target" 2>&1) || fail "apply:$apply_output"
[ "$apply_output" = $'status\tsuccess\tmaterialized' ] || fail "apply:$apply_output"
[ "$(find "$apply_target" -type f -o -type l | wc -l)" = 56 ] || fail apply-leaves
before=$(find "$work" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
apply_output=$("$cli" materialize apply --target "$apply_target" 2>&1) || fail "noop:$apply_output"
[ "$apply_output" = $'status\tnoop\tunchanged' ] || fail "noop:$apply_output"
after=$(find "$work" -mindepth 1 -maxdepth 1 -printf '%f\n' | LC_ALL=C sort)
[ "$before" = "$after" ] || fail noop-sibling-mutation
# Triangulation: unsafe, present, and locked targets are refused without mutation or leaks.
expect_apply() { local want got status; want=$1; shift; set +e; got=$("$@" 2>&1); status=$?; set -e; [ "$got" = "$want" ] || fail "apply-refusal:$got"; [ "$status" = 2 ] || fail apply-refusal-status; [[ $got != *"$work"* && $got != *injected* ]] || fail apply-refusal-leak; }
expect_apply $'status\trefused\tTARGET' "$cli" materialize apply --target relative
expect_apply $'status\trefused\tRELATION' "$cli" materialize apply --target "$root/dotfiles/not-a-target"
set +e; expected_output=$(env PATH="$work/bin:$PATH" DF_COUNT="$work/expected-df-count" MOCK_CASE=clean "$cli" materialize apply --target "$work/target" 2>&1); status=$?; set -e
[ "$status" = 0 ] && [[ $expected_output =~ ^$'status\tsuccess\tmaterialized\nbackup\tsibling:'[A-Za-z0-9]+$ ]] || fail "expected-clean:$expected_output"
[ -d "$(find "$work" -maxdepth 1 -type d -name '.workstation-backup.*' -print -quit)" ] || fail expected-clean-backup
# A target mutation during final df recheck must stop before either rename.
mkdir "$work/target-race"
set +e; race_output=$(env PATH="$work/bin:$PATH" DF_COUNT="$work/race-df-count" DF_MUTATION=target TARGET_MUTATION="$work/target-race/race" MV_COUNT="$work/race-mv-count" MOCK_CASE=clean "$cli" materialize apply --target "$work/target-race" 2>&1); race_status=$?; set -e
[ "$race_status" = 3 ] && [ "$race_output" = $'status\tfailed\tRECHECK' ] && [ "$(cat "$work/race-mv-count" 2>/dev/null || printf 0)" = 0 ] && [ -d "$work/target-race" ] || fail target-race
# A foreign reservation blocks safely without exposing its path or rmdir diagnostics.
mkdir "$work/target-collision"
set +e; collision_output=$(env PATH="$work/bin:$PATH" DF_COUNT="$work/collision-df-count" RMDIR_INJECTED=INJECTED_RESERVATION "$cli" materialize apply --target "$work/target-collision" 2>&1); collision_status=$?; set -e
[ "$collision_status" = 3 ] && [ "$collision_output" = $'status\tfailed\tBACKUP' ] && [[ $collision_output != *INJECTED_RESERVATION* && $collision_output != */tmp/* && $collision_output != *rmdir* ]] && find "$work" -path '*/.workstation-backup.*/foreign-marker' -exec grep -qx INJECTED_RESERVATION {} \; -print | grep -q . && [ -d "$work/target-collision" ] || fail reservation-collision
mkdir "$work/.workstation-materialize-lock"
expect_apply $'status\trefused\tLOCKED' "$cli" materialize apply --target "$work/locked-target"
[ ! -e "$work/locked-target" ] && [ -d "$work/.workstation-materialize-lock" ] || fail refusal-mutation
rmdir "$work/.workstation-materialize-lock"
# A PATH-only df shim mutates the stage during the final parent-space recheck.
for mutation in extra missing hash mode link type nested-git; do
  parent="$work/recheck-$mutation"; target="$parent/target"; mkdir "$parent"; : > "$parent/external-sentinel"
  set +e; output=$(env PATH="$work/bin:$PATH" DF_COUNT="$parent/count" DF_MUTATION="$mutation" "$cli" materialize apply --target "$target" 2>&1); status=$?; set -e
  [ "$status" -ne 0 ] && [ ! -e "$target" ] && [ -f "$parent/external-sentinel" ] || fail "recheck-$mutation:$output"
  ! find "$parent" -maxdepth 1 -name '.workstation-materialize-*' -print -quit | grep -q . || fail "recheck-cleanup-$mutation"
done
mkdir "$work/no-df"; ln -s /usr/bin/bash "$work/no-df/bash"; ln -s /usr/bin/dirname "$work/no-df/dirname"; ln -s /usr/bin/uname "$work/no-df/uname"
set +e; output=$(env PATH="$work/no-df" /usr/bin/bash "$cli" materialize apply --target "$work/missing-df" 2>&1); status=$?; set -e
[ "$status" = 69 ] && [ "$output" = $'status\tfailed\tDEPENDENCY' ] || fail missing-df
parent="$work/signal"; mkdir "$parent"; env PATH="$work/bin:$PATH" DF_COUNT="$parent/count" DF_MUTATION=signal "$cli" materialize apply --target "$parent/target" >"$parent/out" 2>&1 & pid=$!
for _ in 1 2 3 4 5; do find "$parent" -name '.workstation-materialize-stage.*' -print -quit | grep -q . && break; sleep 1; done
kill -TERM "$pid"; wait "$pid" || status=$?
if [ -e "$parent/target" ] || find "$parent" -name '.workstation-materialize-*' -print -quit | grep -q .; then fail signal-cleanup; fi
printf 'materialize tests: PASS\n'
