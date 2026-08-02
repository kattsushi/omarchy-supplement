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
  *'rev-parse --show-toplevel'*) printf '%s\n' "${MOCK_GIT_TOP:-$MOCK_TOP}" ;;
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
  *) exit 1 ;;
esac
EOF
chmod +x "$work/bin/git"
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
printf 'materialize tests: PASS\n'
