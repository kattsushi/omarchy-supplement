#!/usr/bin/env bash
BOOTSTRAP_REFUSAL=2
BOOTSTRAP_INVALID=64
bootstrap_root() { (cd "$(dirname "${BASH_SOURCE[1]}")/.." && pwd -P); }
bootstrap_error() { printf '%s\n' "$1" >&2; }
bootstrap_hash() {
	[[ ${BOOTSTRAP_HASH_TOOL:-} != missing ]] || return 1
	if command -v sha256sum >/dev/null 2>&1; then sha256sum | awk '{print "sha256:" $1}'; elif command -v shasum >/dev/null 2>&1; then shasum -a 256 | awk '{print "sha256:" $1}'; else return 1; fi
}
bootstrap_digest_files() { cat -- "$@" | bootstrap_hash; }
bootstrap_escape() { sed -e 's/%/%25/g' -e 's/\t/%09/g' -e ':a;N;$!ba;s/\n/%0A/g' -e 's/\r/%0D/g'; }
bootstrap_fixture_guard() {
	[[ -n "${BOOTSTRAP_TEST_OS:-}" ]] || return 0
	[[ "$HOME" != "${REAL_HOME:-$HOME}" && -f "${HOME%/*}/.omarchy-bootstrap-fixture" ]] || {
		bootstrap_error "FIXTURE_GUARD_FAILED"
		return "$BOOTSTRAP_INVALID"
	}
}
bootstrap_os() { printf '%s\n' "${BOOTSTRAP_TEST_OS:-$(uname -s | tr '[:upper:]' '[:lower:]')}"; }
bootstrap_arch() { printf '%s\n' "${BOOTSTRAP_TEST_ARCH:-$(uname -m)}"; }
