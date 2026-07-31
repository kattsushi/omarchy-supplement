#!/usr/bin/env bash
provider_allowed() {
	local os=$1 provider=$2
	case "$os:$provider" in arch:arch.pacman | arch:arch.aur | arch:none | darwin:darwin.homebrew.formula | darwin:darwin.homebrew.cask | darwin:none) return 0 ;; *) return 1 ;; esac
}
provider_status() {
	local os=$1 provider=$2
	provider_allowed "$os" "$provider" || {
		printf 'PROVIDER_PLATFORM_MISMATCH\n'
		return
	}
	printf 'PROVIDER_APPLY_UNIMPLEMENTED\n'
}
