#!/usr/bin/env bash
dotfiles_root() {
	CDPATH='' cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." 2>/dev/null && pwd -P
}
dotfiles_fingerprint() {
	local root=$1 output record algorithm digest extra
	output=$("$root/bin/workstation-dotfiles" materialize fingerprint 2>/dev/null) || return 1
	IFS=$'\t' read -r record algorithm digest extra <<<"$output"
	[[ $record == fingerprint && $algorithm == sha256 && $digest =~ ^[0-9a-f]{64}$ && -z $extra ]] || return 1
	printf '%s\n' "$digest"
}
dotfiles_source_verified() {
	local root=$1 output
	output=$("$root/bin/workstation-dotfiles" source verify 2>/dev/null) || return 1
	[[ $output == $'source\tVERIFY\tPASS' ]]
}
dotfiles_status() {
	local expected=$1 root before inspect after checkout="$HOME/dotfiles"
	[[ $expected =~ ^sha256:[0-9a-f]{64}$ ]] || { printf 'DOTFILES_EMBEDDED_PIN_INVALID\n'; return; }
	root=$(dotfiles_root) || { printf 'DOTFILES_EMBEDDED_SOURCE_UNVERIFIED\n'; return; }
	dotfiles_source_verified "$root" || { printf 'DOTFILES_EMBEDDED_SOURCE_UNVERIFIED\n'; return; }
	before=$(dotfiles_fingerprint "$root") || { printf 'DOTFILES_EMBEDDED_SOURCE_UNVERIFIED\n'; return; }
	[[ sha256:$before == "$expected" ]] || { printf 'DOTFILES_EMBEDDED_PIN_MISMATCH\n'; return; }
	inspect=$("$root/bin/workstation-dotfiles" materialize inspect --target "$checkout" 2>/dev/null || true)
	dotfiles_source_verified "$root" || { printf 'DOTFILES_EMBEDDED_SOURCE_UNVERIFIED\n'; return; }
	after=$(dotfiles_fingerprint "$root") || { printf 'DOTFILES_EMBEDDED_SOURCE_UNVERIFIED\n'; return; }
	[[ $after == "$before" && sha256:$after == "$expected" ]] || { printf 'DOTFILES_EMBEDDED_SOURCE_CHANGED\n'; return; }
	case $inspect in
	$'status\tsuccess\tmaterialized') printf 'DOTFILES_READY\n' ;;
	$'status\tabsent\teligible') printf 'DOTFILES_MISSING\n' ;;
	$'status\tsuccess\texpected-clean') printf 'DOTFILES_MIGRATION_READY\n' ;;
	$'status\trefused\tSYMLINK_TARGET') printf 'DOTFILES_SYMLINKED_ROOT\n' ;;
	$'status\trefused\tDIRTY'|$'status\trefused\tSTAGED'|$'status\trefused\tUNTRACKED') printf 'DOTFILES_DIRTY\n' ;;
	$'status\trefused\tWRONG_REMOTE'|$'status\trefused\tWRONG_LINEAGE') printf 'DOTFILES_REMOTE_MISMATCH\n' ;;
	$'status\trefused\tWRONG_PIN') printf 'DOTFILES_REVISION_MISMATCH\n' ;;
	$'status\trefused\tNON_GIT'|$'status\trefused\tUNMANAGED_DIRECTORY') printf 'DOTFILES_NOT_GIT\n' ;;
	*) printf 'DOTFILES_UNSAFE_TARGET\n' ;;
	esac
}
omarchy_baseline_status() {
	local omarchy_version="${BOOTSTRAP_TEST_OMARCHY_VERSION:-}" hyprland_version="${BOOTSTRAP_TEST_HYPRLAND_VERSION:-}"
	[[ -n $omarchy_version ]] || omarchy_version=$(omarchy version 2>/dev/null | awk 'NR==1 {print $NF}' || true)
	[[ -n $hyprland_version ]] || hyprland_version=$(hyprctl version 2>/dev/null | awk 'NR==1 {for (i=1;i<=NF;i++) if ($i ~ /^v?[0-9]+\\.[0-9]+/) {gsub(/^v/, "", $i); print $i; exit}}' || true)
	[[ $omarchy_version == 3.8.4 && $hyprland_version == 0.56* ]] && printf 'OMARCHY_BASELINE_READY\n' || printf 'OMARCHY_VERSION_UNVERIFIED\n'
}
managed_source_forbidden() { [[ $1 == .local/share/omarchy || $1 == .local/share/omarchy/* ]]; }
ownership_status() {
	local catalog=$1 desired=$2 checkout="$HOME/dotfiles" source target target_path source_path
	while IFS=$'\t' read -r _ ref _ source target; do
		[[ $ref == "$desired" ]] || continue
		managed_source_forbidden "$target" && {
			printf 'MANAGED_SOURCE_FORBIDDEN\n'
			return
		}
		source_path="$checkout/$source"
		target_path="$HOME/$target"
		[[ -f "$source_path" || -L "$source_path" ]] || {
			printf 'STOW_PACKAGE_MISSING\n'
			return
		}
		[[ ! -e "$target_path" && ! -L "$target_path" ]] && continue
		if [[ -L "$target_path" && $(readlink -f "$target_path" 2>/dev/null || true) == $(readlink -f "$source_path") ]]; then continue; fi
		[[ -L "$target_path" ]] && {
			printf 'TARGET_OWNER_CONFLICT\n'
			return
		}
		printf 'TARGET_UNMANAGED\n'
		return
	done < <(tail -n +2 "$catalog/ownership.tsv")
	printf 'OWNERSHIP_CLEAR\n'
}
