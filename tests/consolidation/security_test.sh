#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
scanner=$root/tools/consolidation/review-tracked-content.sh
inventory=$root/tools/consolidation/inventory-from-git.sh
fail(){ printf 'FAIL: %s\n' "$*" >&2; exit 1; }
sentinel=sentinel-; sentinel+=never-open
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
make_repo(){
  local name=$1 special=${2:-} src bare
  src=$tmp/$name-src; bare=$tmp/$name.git
  git init -q "$src"; git -C "$src" config user.email fixture@example.invalid; git -C "$src" config user.name fixture
  for n in $(seq 1 51); do printf 'clean\n' > "$src/file-$n"; done
  mkdir -p "$src/mcp" "$src/systems/darwin" "$src/bin" "$src/polybar/.config"
  printf '%s\n' "\${TOKEN}" > "$src/reference"; printf 'reference\n' > "$src/.env.example"; printf 'reference\n' > "$src/mcp/config"; printf 'darwinConfigurations\n' > "$src/systems/darwin/config"
  printf '#!/bin/sh\n' > "$src/bin/run"; chmod +x "$src/bin/run"; ln -s ../target "$src/polybar/.config/link"
  case "$special" in
    literal) printf '%s%s\n' 'token=' 'abcdefgh' > "$src/reference";;
    private) printf '%s%s%s\n' '-----BEGIN ' 'PRIVATE ' 'KEY-----' > "$src/reference";;
    executable-literal) { printf '#!/bin/sh\n'; printf '%s%s\n' 'token=' 'abcdefgh'; } > "$src/bin/run";;
    executable-private) { printf '#!/bin/sh\n'; printf '%s%s%s\n' '-----BEGIN ' 'PRIVATE ' 'KEY-----'; } > "$src/bin/run";;
    machine) printf '/Users/example\n' > "$src/reference";;
    unsafe-link) rm "$src/polybar/.config/link"; ln -s ../../../escape "$src/polybar/.config/link";;
    forbidden) printf '%s\n' "$sentinel" > "$src/.env"; rm "$src/file-51"; git -C "$src" add -f .env;;
  esac
  printf '%s\n' "$sentinel" > "$src/ignored.env"; printf 'ignored.env\n' > "$src/.gitignore"
  git -C "$src" add .; git -C "$src" commit -qm fixture; git clone -q --bare "$src" "$bare"
  "$inventory" --git-dir "$bare" --revision HEAD --output "$tmp/$name.tsv"
  printf '%s\n' "$bare"
}
run_refusal(){
  local case_name=$1 bare=$2 expected=$3 report output
  report=$tmp/$case_name.report
  output=$("$scanner" --git-dir "$bare" --revision HEAD --inventory "$tmp/$case_name.tsv" --report "$report" 2>&1 || true)
  [[ "$output" == *$'refusal\t'*"$expected"* ]] || fail "$case_name rule"
  [ ! -f "$report" ] || fail "$case_name report"
  [[ "$output" != *"$sentinel"* ]] || fail "$case_name leaked"
}
base=$(make_repo base)
"$scanner" --git-dir "$base" --revision HEAD --inventory "$tmp/base.tsv" --report "$tmp/base.report" >/dev/null 2>&1 || fail safe
[ "$(grep -c '^finding' "$tmp/base.report")" -ge 5 ] || fail findings
tail -n +2 "$tmp/base.report" | LC_ALL=C sort -cu || fail deterministic-order
cp "$tmp/base.report" "$tmp/base.first"
"$scanner" --git-dir "$base" --revision HEAD --inventory "$tmp/base.tsv" --report "$tmp/base.report" >/dev/null 2>&1 || fail repeat-safe
cmp -s "$tmp/base.first" "$tmp/base.report" || fail deterministic-unique-report
grep -q $'\tCRED_PATH\tSECURITY\tBLOCKED\t' "$tmp/base.report" || fail credential-path
grep -q $'\tEXECUTABLE_REVIEWED\tSECURITY\tINCLUDE\t' "$tmp/base.report" || fail executable
grep -q $'\tSYMLINK_APPROVED\tSECURITY\tINCLUDE\t' "$tmp/base.report" || fail symlink
for case_name in literal private executable-literal executable-private unsafe-link forbidden; do
  bare=$(make_repo "$case_name" "$case_name")
  case "$case_name" in
    literal|executable-literal) expected=$'reference\tBLOCKED_INCLUDE'; [ "$case_name" = executable-literal ] && expected=$'bin/run\tBLOCKED_INCLUDE';;
    private|executable-private) expected=$'reference\tBLOCKED_INCLUDE'; [ "$case_name" = executable-private ] && expected=$'bin/run\tBLOCKED_INCLUDE';;
    unsafe-link) expected=$'polybar/.config/link\tUNSAFE_SYMLINK';;
    forbidden) expected=$'.env\tFORBIDDEN_LOCAL';;
  esac
  run_refusal "$case_name" "$bare" "$expected"
done
machine=$(make_repo machine machine)
"$scanner" --git-dir "$machine" --revision HEAD --inventory "$tmp/machine.tsv" --report "$tmp/machine.report" >/dev/null 2>&1 || fail machine
grep -q $'reference\tDARWIN_IDENTITY\tSECURITY\tREFERENCE\t' "$tmp/machine.report" || fail machine-reference
! grep -Eq $'\t(PRIVATE_KEY|LITERAL_SECRET)\t' "$tmp/machine.report" || fail safe-findings
! "$scanner" --git-dir "$base" --revision bad --inventory "$tmp/base.tsv" --report "$tmp/bad.report" >/dev/null 2>&1 || fail wrong-revision
cp "$tmp/base.tsv" "$tmp/mismatch.tsv"; sed -i '2s/sha256:[0-9a-f]*/sha256:0000000000000000000000000000000000000000000000000000000000000000/' "$tmp/mismatch.tsv"
! "$scanner" --git-dir "$base" --revision HEAD --inventory "$tmp/mismatch.tsv" --report "$tmp/mismatch.report" >/dev/null 2>&1 || fail mismatch
cp "$tmp/base.tsv" "$tmp/missing.tsv"; sed -i '2d' "$tmp/missing.tsv"
! "$scanner" --git-dir "$base" --revision HEAD --inventory "$tmp/missing.tsv" --report "$tmp/missing.report" >/dev/null 2>&1 || fail missing-inventory
cp "$tmp/base.tsv" "$tmp/extra.tsv"; sed -i 's/\tfile-1\t/\textra-file\t/' "$tmp/extra.tsv"
! "$scanner" --git-dir "$base" --revision HEAD --inventory "$tmp/extra.tsv" --report "$tmp/extra.report" >/dev/null 2>&1 || fail extra-inventory
cp "$tmp/base.tsv" "$tmp/malformed.tsv"; sed -i '2s/\tfile\t/\tbogus\t/' "$tmp/malformed.tsv"
! "$scanner" --git-dir "$base" --revision HEAD --inventory "$tmp/malformed.tsv" --report "$tmp/malformed.report" >/dev/null 2>&1 || fail malformed-inventory
printf 'stale-pass\n' > "$tmp/stale.report"
output=$("$scanner" --git-dir "$base" --revision bad --inventory "$tmp/base.tsv" --report "$tmp/stale.report" 2>&1 || true)
[[ "$output" == *$'refusal\tREVISION\tMISSING'* ]] || fail stale-rule
[ ! -e "$tmp/stale.report" ] || fail stale-report
forbidden=$(make_repo forbidden-nonread forbidden)
forbidden_oid=$(git --git-dir="$forbidden" ls-tree HEAD -- .env | awk '{print $3}')
mkdir "$tmp/git-bin"
cat > "$tmp/git-bin/git" <<EOF
#!/usr/bin/env bash
git_dir=\${1:-}
[ "\$git_dir" = "--git-dir=$forbidden" ] && shift
if [ "\${1:-}" = cat-file ] && [ "\${2:-}" = blob ] && [ "\${3:-}" = "$forbidden_oid" ]; then
  printf 'forbidden blob read\n' >> "$tmp/forbidden-read.log"
  exit 97
fi
exec "$(command -v git)" "\$git_dir" "\$@"
EOF
chmod +x "$tmp/git-bin/git"
output=$(PATH="$tmp/git-bin:$PATH" "$scanner" --git-dir "$forbidden" --revision HEAD --inventory "$tmp/forbidden-nonread.tsv" --report "$tmp/nonread.report" 2>&1 || true)
[[ "$output" == *$'refusal\t.env\tFORBIDDEN_LOCAL'* ]] || fail forbidden-nonread-rule
[ ! -e "$tmp/forbidden-read.log" ] || fail forbidden-blob-read
[[ "$output" != *"$sentinel"* ]] || fail forbidden-value-leak
printf 'security tests: PASS\n'
