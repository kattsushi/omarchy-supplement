#!/usr/bin/env bash
dotfiles_status() {
  local expected=$1 checkout="$HOME/dotfiles" remote head
  [[ -L $checkout ]] && { printf 'DOTFILES_SYMLINKED_ROOT\n'; return; }
  [[ -d $checkout ]] || { printf 'DOTFILES_MISSING\n'; return; }
  git -C "$checkout" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { printf 'DOTFILES_NOT_GIT\n'; return; }
  remote=$(git -C "$checkout" remote get-url origin 2>/dev/null || true)
  [[ $remote == https://github.com/kattsushi/dotfiles-v2.git || $remote == git@github.com:kattsushi/dotfiles-v2.git || $remote == ssh://git@github.com/kattsushi/dotfiles-v2.git ]] || { printf 'DOTFILES_REMOTE_MISMATCH\n'; return; }
  head=$(git -C "$checkout" rev-parse HEAD 2>/dev/null || true)
  [[ $expected =~ ^[0-9a-f]{40}$ && $head == "$expected" ]] || { printf 'DOTFILES_REVISION_MISMATCH\n'; return; }
  [[ -z $(git -C "$checkout" status --porcelain) ]] || { printf 'DOTFILES_DIRTY\n'; return; }
  printf 'DOTFILES_READY\n'
}
omarchy_baseline_status() {
  local omarchy_version="${BOOTSTRAP_TEST_OMARCHY_VERSION:-}" hyprland_version="${BOOTSTRAP_TEST_HYPRLAND_VERSION:-}"
  [[ -n $omarchy_version ]] || omarchy_version=$(omarchy version 2>/dev/null | awk 'NR==1 {print $NF}' || true)
  [[ -n $hyprland_version ]] || hyprland_version=$(hyprctl version 2>/dev/null | awk 'NR==1 {for (i=1;i<=NF;i++) if ($i ~ /^v?[0-9]+\\.[0-9]+/) {gsub(/^v/, "", $i); print $i; exit}}' || true)
  [[ $omarchy_version == 3.8.4 && $hyprland_version == 0.56* ]] && printf 'OMARCHY_BASELINE_READY\n' || printf 'OMARCHY_VERSION_UNVERIFIED\n'
}
managed_source_forbidden() { [[ $1 == .local/share/omarchy || $1 == .local/share/omarchy/* ]]; }
ownership_status() {
  local catalog=$1 desired=$2 checkout="$HOME/dotfiles" package source target target_path source_path
  while IFS=$'\t' read -r _ ref package source target; do
    [[ $ref == "$desired" ]] || continue
    managed_source_forbidden "$target" && { printf 'MANAGED_SOURCE_FORBIDDEN\n'; return; }
    source_path="$checkout/$package/$source"; target_path="$HOME/$target"
    [[ -d "$checkout/$package" && -e "$source_path" ]] || { printf 'STOW_PACKAGE_MISSING\n'; return; }
    [[ ! -e "$target_path" && ! -L "$target_path" ]] && continue
    if [[ -L "$target_path" && $(readlink -f "$target_path" 2>/dev/null || true) == $(readlink -f "$source_path") ]]; then continue; fi
    [[ -L "$target_path" ]] && { printf 'TARGET_OWNER_CONFLICT\n'; return; }
    printf 'TARGET_UNMANAGED\n'; return
  done < <(tail -n +2 "$catalog/ownership.tsv")
  printf 'OWNERSHIP_CLEAR\n'
}
