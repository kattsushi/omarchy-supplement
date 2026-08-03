#!/usr/bin/env bash
set -euo pipefail

stow_refuse() { printf 'status\trefused\t%s\n' "$1" >&2; return 2; }
stow_abs() { [[ $1 = /* ]] || return 1; printf '%s\n' "$1" | awk -F/ '{ out=""; for (i=1;i<=NF;i++) { if ($i=="" || $i==".") continue; if ($i=="..") { sub("/[^/]+$", "", out); continue }; out=out "/" $i }; print out ? out : "/" }'; }
stow_safe_rel() { local p=$1 c depth=0; [[ -n $p && $p != /* && $p != *$'\t'* && $p != *$'\n'* ]] || return 1; IFS=/ read -r -a a <<< "$p"; for c in "${a[@]}"; do case $c in ''|.) return 1;; ..) (( depth > 0 )) || return 1; depth=$((depth-1));; *) depth=$((depth+1));; esac; done; }
stow_no_links_in_path() { local p=$1 part=/ c; IFS=/ read -r -a a <<< "${p#/}"; for c in "${a[@]}"; do [ -n "$c" ] || continue; part=$part$c; [ ! -L "$part" ] || return 1; part=$part/; done; }
stow_profile_packages() {
  local profile=$1 platform=$2 row expected list package
  row=$(awk -F '\t' -v p="$profile" '$1==p {print}' "$3/.workstation/profiles.tsv" 2>/dev/null) || return 1
  [ "$(printf '%s\n' "$row" | sed '/^$/d' | wc -l 2>/dev/null)" = 1 ] || return 1
  IFS=$'\t' read -r _ expected list <<< "$row"; [ "$expected" = any ] || [ "$expected" = "$platform" ] || return 1
  IFS=, read -r -a STOW_PACKAGES <<< "$list"
  [ "${#STOW_PACKAGES[@]}" -gt 0 ] || return 1
  for package in "${STOW_PACKAGES[@]}"; do
    case $package in ''|install|mcp|systems/darwin) return 1;; esac
    [[ $package =~ ^[a-z0-9][a-z0-9-]*$ ]] || return 1
    [ -d "$3/$package" ] && [ ! -L "$3/$package" ] && [ ! -e "$3/$package/.git" ] || return 1
  done
  [ "$profile" != arch/omarchy ] || [[ " ${STOW_PACKAGES[*]} " != *' ghostty-darwin '* ]]
  [ "$profile" != macos ] || [[ " ${STOW_PACKAGES[*]} " != *' ghostty-linux '* ]]
}
stow_check() {
  local root=$1 profile='' platform='' target='' package leaf relative source target_leaf link normalized
  shift
  while [ "$#" -gt 0 ]; do case $1 in --profile) profile=${2:-}; shift 2;; --platform) platform=${2:-}; shift 2;; --target) target=${2:-}; shift 2;; *) stow_refuse ARGUMENT; return $?;; esac; done
  [ -n "$profile" ] && [ -n "$platform" ] && [ -n "$target" ] || { stow_refuse ARGUMENT; return $?; }
  case $platform in linux|darwin) ;; *) stow_refuse PLATFORM; return $?;; esac
  verify_source "$root" || { stow_refuse SOURCE; return $?; }
  stow_profile_packages "$profile" "$platform" "$root" || { stow_refuse PROFILE; return $?; }
  target=$(stow_abs "$target") || { stow_refuse TARGET; return $?; }
  stow_no_links_in_path "$target" || { stow_refuse SYMLINK_TARGET; return $?; }
  [ -d "$target" ] && [ ! -L "$target" ] && [ -O "$target" ] && [ -w "$target" ] || { stow_refuse TARGET; return $?; }
  target=$(CDPATH='' cd -- "$target" 2>/dev/null && pwd -P) || { stow_refuse TARGET; return $?; }
  case $target in "$root"|"$root"/*) stow_refuse RELATION; return $?;; esac
  case $root in "$target"/*) stow_refuse RELATION; return $?;; esac
  declare -A owners=()
  for package in "${STOW_PACKAGES[@]}"; do
    while IFS= read -r -d '' leaf; do
      relative=${leaf#"$root/$package/"}; stow_safe_rel "$relative" || { stow_refuse SOURCE_PATH; return $?; }
      case $relative in .local/share/omarchy|.local/share/omarchy/*) stow_refuse OMARCHY; return $?;; esac
      [ -z "${owners[$relative]:-}" ] || { stow_refuse DUPLICATE; return $?; }; owners[$relative]=$package
      source="$root/$package/$relative"
      if [ -L "$source" ]; then safe_link "$(readlink "$source" 2>/dev/null)" "$package/${relative%/*}" || { stow_refuse SOURCE_LINK; return $?; }; elif [ ! -f "$source" ]; then stow_refuse SOURCE_TYPE; return $?; fi
    done < <(find -P "$root/$package" -mindepth 1 \( -type f -o -type l \) -print0 2>/dev/null)
    find -P "$root/$package" -mindepth 1 ! -type d ! -type f ! -type l -print -quit 2>/dev/null | grep -q . && { stow_refuse SOURCE_TYPE; return $?; }
  done
  for relative in "${!owners[@]}"; do
    target_leaf="$target/$relative"; source="$root/${owners[$relative]}/$relative"
    stow_no_links_in_path "${target_leaf%/*}" || { stow_refuse SYMLINK_TARGET; return $?; }
    [ ! -e "$target_leaf" ] && [ ! -L "$target_leaf" ] && continue
    [ -L "$target_leaf" ] || { stow_refuse OCCUPIED; return $?; }
    link=$(readlink "$target_leaf" 2>/dev/null) || { stow_refuse OCCUPIED; return $?; }
    case $link in /*) normalized=$(stow_abs "$link");; *) normalized=$(stow_abs "${target_leaf%/*}/$link");; esac
    [ "$normalized" = "$source" ] || { stow_refuse OCCUPIED; return $?; }
  done
  command -v stow >/dev/null 2>&1 || { printf 'status\tfailed\tDEPENDENCY\n' >&2; return 69; }
  if (cd -- "$root" && stow --simulate --verbose=2 --no-folding --target "$target" "${STOW_PACKAGES[@]}") >/dev/null 2>&1; then printf 'status\tsuccess\tchecked\n'; return 0; fi
  stow_refuse STOW_SIMULATION
}
