#!/usr/bin/env bash
state_root() {
	local base
	if [[ -n ${XDG_STATE_HOME:-} ]]; then
		base=$XDG_STATE_HOME
	elif [[ $(bootstrap_os) == darwin ]]; then
		base="$HOME/Library/Application Support"
	else base="$HOME/.local/state"; fi
	printf '%s/omarchy-supplement/bootstrap\n' "$base"
}
state_guard() {
	local root=$1 parent
	[[ -n ${BOOTSTRAP_TEST_OS:-} ]] || {
		bootstrap_error 'MANAGED_STATE_FIXTURE_ONLY'
		return "$BOOTSTRAP_REFUSAL"
	}
	parent=$(dirname "${XDG_STATE_HOME:-}")
	[[ -n ${XDG_STATE_HOME:-} && -f "$parent/.omarchy-bootstrap-fixture" && $root == "$XDG_STATE_HOME"/* ]] || {
		bootstrap_error 'FIXTURE_GUARD_FAILED'
		return "$BOOTSTRAP_INVALID"
	}
	[[ ! -L $root && (! -e $root || -O $root) ]] || {
		bootstrap_error 'STATE_ROOT_UNSAFE'
		return "$BOOTSTRAP_REFUSAL"
	}
	(
		umask 077
		mkdir -p "$root"/{receipts,backups,locks,managed}
	) || return 70
	chmod 700 "$root" "$root"/{receipts,backups,locks,managed}
}
state_atomic_write() {
	local destination=$1 content=$2 dir tmp
	dir=$(dirname "$destination")
	mkdir -p "$dir" || return 70
	tmp=$(mktemp "$dir/.bootstrap.XXXXXX") || return 70
	(
		umask 077
		printf '%s\n' "$content" >"$tmp"
		chmod 600 "$tmp"
		mv -f "$tmp" "$destination"
	) || {
		rm -f "$tmp"
		return 70
	}
}
state_lock() {
	local root=$1 lock="$root/locks/apply.lock"
	mkdir "$lock" 2>/dev/null || {
		bootstrap_error 'LOCK_EXISTS'
		return "$BOOTSTRAP_REFUSAL"
	}
	state_atomic_write "$lock/metadata" "pid\t$$" || return 70
	STATE_LOCK=$lock
}
state_unlock() {
	if [[ -n ${STATE_LOCK:-} ]]; then
		rm -f "$STATE_LOCK/metadata"
		rmdir "$STATE_LOCK" 2>/dev/null || true
	fi
	STATE_LOCK=
}
state_file_hash() { [[ -f $1 && ! -L $1 ]] && bootstrap_hash <"$1"; }
