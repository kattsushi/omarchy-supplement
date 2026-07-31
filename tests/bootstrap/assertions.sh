#!/usr/bin/env bash
ASSERT_FAILED=0
fail() {
	ASSERT_FAILED=1
	printf 'FAIL %s\n' "$*" >&2
	return 1
}
run_test() {
	local name=$1
	shift
	ASSERT_FAILED=0
	"$@" || true
	if ((ASSERT_FAILED)); then
		printf 'FAIL %s\n' "$name" >&2
		return 1
	fi
	printf 'PASS %s\n' "$name"
}
assert_file_contains() { grep -Fq -- "$2" "$1" || fail "expected '$2' in $1"; }
assert_file_not_contains() { ! grep -Fq -- "$2" "$1" || fail "did not expect '$2' in $1"; }
expect_exit() {
	local expected=$1
	shift
	set +e
	"$@" >/dev/null 2>&1
	local rc=$?
	set -e
	[[ $rc -eq $expected ]] || fail "expected exit $expected, got $rc"
}
tree_fingerprint() { (cd "$1" && find . -path './state' -prune -o -path './cache' -prune -o -type f -print0 | LC_ALL=C sort -z | xargs -0 -r sha256sum) | sha256sum | awk '{print $1}'; }
