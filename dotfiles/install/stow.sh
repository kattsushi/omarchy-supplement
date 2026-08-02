#!/usr/bin/env bash
set -euo pipefail

profile="${1:-}"
repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

action="${STOW_ACTION:-stow}"
case "$action" in
stow) stow_args=() ;;
restow) stow_args=(-R) ;;
delete | unstow) stow_args=(-D) ;;
*)
	echo "Unknown STOW_ACTION: $action" >&2
	exit 2
	;;
esac

common=(zshrc starship nvim tmux mcp)
linux=("${common[@]}" ghostty-linux)
darwin=("${common[@]}" ghostty-darwin)
omarchy_desktop=(hyprland hyprlock hyprmocha hyprpaper waybar mako backgrounds)

case "$profile" in
linux | arch)
	packages=("${linux[@]}")
	;;
omarchy | omarchy-desktop | linux-desktop)
	packages=("${omarchy_desktop[@]}")
	;;
linux-full | arch-full)
	packages=("${linux[@]}" "${omarchy_desktop[@]}")
	;;
darwin | macos | mac)
	packages=("${darwin[@]}")
	;;
common)
	packages=("${common[@]}")
	;;
*)
	cat >&2 <<USAGE
Usage: $0 <linux|darwin|common|omarchy-desktop|linux-full>

Profiles:
  linux            Shared packages plus ghostty-linux. Safe default for Arch/Linux.
  darwin           Shared packages plus ghostty-darwin.
  common           Shared packages only.
  omarchy-desktop  Hyprland/Waybar/Mako/background packages only. May conflict with Omarchy-managed real files.
  linux-full       linux + omarchy-desktop.

Optional:
  STOW_ACTION=restow $0 linux
  STOW_ACTION=delete  $0 darwin
USAGE
	exit 2
	;;
esac

cd "$repo_root"
stow --no-folding "${stow_args[@]}" -t "$HOME" "${packages[@]}"
