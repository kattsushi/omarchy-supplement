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
  IFS=, read -r -a STOW_PACKAGES <<< "$list"; [ "${#STOW_PACKAGES[@]}" -gt 0 ] || return 1
  for package in "${STOW_PACKAGES[@]}"; do case $package in ''|install|mcp|systems/darwin) return 1;; esac; [[ $package =~ ^[a-z0-9][a-z0-9-]*$ ]] || return 1; [ -d "$3/$package" ] && [ ! -L "$3/$package" ] && [ ! -e "$3/$package/.git" ] || return 1; done
  [ "$profile" != arch/omarchy ] || [[ " ${STOW_PACKAGES[*]} " != *' ghostty-darwin '* ]]; [ "$profile" != macos ] || [[ " ${STOW_PACKAGES[*]} " != *' ghostty-linux '* ]]
}
stow_target() {
  local root=$1 target=$2
  target=$(stow_abs "$target") || return 1; stow_no_links_in_path "$target" || return 1
  [ -d "$target" ] && [ ! -L "$target" ] && [ -O "$target" ] && [ -w "$target" ] || return 1
  target=$(CDPATH='' cd -- "$target" 2>/dev/null && pwd -P) || return 1
  case $target in "$root"|"$root"/*) return 1;; esac; case $root in "$target"/*) return 1;; esac
  printf '%s\n' "$target"
}
stow_owners() {
  local root=$1 package leaf relative source
  declare -gA STOW_OWNERS=()
  for package in "${STOW_PACKAGES[@]}"; do
    while IFS= read -r -d '' leaf; do
      relative=${leaf#"$root/$package/"}; stow_safe_rel "$relative" || return 1
      # GNU Stow always ignores exact package-local ignore metadata.
      case $relative in .stow-local-ignore) continue;; .local/share/omarchy|.local/share/omarchy/*) return 1;; esac
      [ -z "${STOW_OWNERS[$relative]:-}" ] || return 1; STOW_OWNERS[$relative]=$package; source="$root/$package/$relative"
      if [ -L "$source" ]; then safe_link "$(readlink "$source" 2>/dev/null)" "$package/${relative%/*}" || return 1; elif [ ! -f "$source" ]; then return 1; fi
    done < <(find -P "$root/$package" -mindepth 1 \( -type f -o -type l \) -print0 2>/dev/null)
    find -P "$root/$package" -mindepth 1 ! -type d ! -type f ! -type l -print -quit 2>/dev/null | grep -q . && return 1
  done
  return 0
}
stow_exact() {
  local root=$1 target=$2 relative source target_leaf link normalized
  for relative in "${!STOW_OWNERS[@]}"; do
    source="$root/${STOW_OWNERS[$relative]}/$relative"; target_leaf="$target/$relative"
    stow_no_links_in_path "${target_leaf%/*}" || return 1
    [ -L "$target_leaf" ] || return 1; link=$(readlink "$target_leaf" 2>/dev/null) || return 1
    case $link in /*) normalized=$(stow_abs "$link");; *) normalized=$(stow_abs "${target_leaf%/*}/$link");; esac
    [ "$normalized" = "$source" ] || return 1
  done
}
stow_existing_safe() {
  local root=$1 target=$2 relative source target_leaf link normalized
  for relative in "${!STOW_OWNERS[@]}"; do
    source="$root/${STOW_OWNERS[$relative]}/$relative"; target_leaf="$target/$relative"
    stow_no_links_in_path "${target_leaf%/*}" || return 1
    [ ! -e "$target_leaf" ] && [ ! -L "$target_leaf" ] && continue
    [ -L "$target_leaf" ] || return 1; link=$(readlink "$target_leaf" 2>/dev/null) || return 1
    case $link in /*) normalized=$(stow_abs "$link");; *) normalized=$(stow_abs "${target_leaf%/*}/$link");; esac
    [ "$normalized" = "$source" ] || return 1
  done
}
stow_inputs() { (verify_source "$1") >/dev/null 2>&1 && stow_profile_packages "$2" "$3" "$1" && stow_owners "$1"; }
stow_rows() { local profile=$1 package; printf 'profile\t%s\n' "$profile"; printf '%s\n' "${STOW_PACKAGES[@]}" | LC_ALL=C sort | while IFS= read -r package; do printf 'package\t%s\n' "$package"; done; }
stow_fingerprint() { local out pattern=$'^fingerprint\tsha256\t([0-9a-f]{64})$'; out=$( (materialize_fingerprint "$1") 2>/dev/null) || return 1; [[ $out =~ $pattern ]] || return 1; printf '%s\n' "${BASH_REMATCH[1]}"; }
stow_args() {
  local root=$1 profile='' platform='' target=''; STOW_ARGUMENT_REASON=ARGUMENT
  shift; while [ "$#" -gt 0 ]; do case $1 in --profile) profile=${2:-}; shift 2;; --platform) platform=${2:-}; shift 2;; --target) target=${2:-}; shift 2;; *) return 1;; esac; done
  [ -n "$profile" ] && [ -n "$platform" ] && [ -n "$target" ] || return 1; case $platform in linux|darwin) ;; *) STOW_ARGUMENT_REASON=PLATFORM; return 1;; esac
  STOW_RAW_TARGET=$target; STOW_ARGUMENT_REASON=TARGET; STOW_PROFILE=$profile STOW_PLATFORM=$platform STOW_TARGET=$(stow_target "$root" "$target") || return 1
}
stow_check() {
  local root=$1; shift
  stow_args "$root" "$@" || { if [ "$STOW_ARGUMENT_REASON" = TARGET ] && stow_abs "$STOW_RAW_TARGET" >/dev/null 2>&1 && ! stow_no_links_in_path "$(stow_abs "$STOW_RAW_TARGET")"; then stow_refuse SYMLINK_TARGET; else stow_refuse "$STOW_ARGUMENT_REASON"; fi; return $?; }
  (verify_source "$root") >/dev/null 2>&1 || { stow_refuse SOURCE; return $?; }
  stow_profile_packages "$STOW_PROFILE" "$STOW_PLATFORM" "$root" || { stow_refuse PROFILE; return $?; }
  stow_owners "$root" || { stow_refuse SOURCE; return $?; }; fp=$(stow_fingerprint "$root") || { stow_refuse SOURCE; return $?; }
  stow_existing_safe "$root" "$STOW_TARGET" || { stow_refuse OCCUPIED; return $?; }
  command -v stow >/dev/null 2>&1 || { printf 'status\tfailed\tDEPENDENCY\n' >&2; return 69; }
  (cd -- "$root" && stow --simulate --verbose=2 --no-folding --target "$STOW_TARGET" "${STOW_PACKAGES[@]}") >/dev/null 2>&1 || { stow_refuse STOW_SIMULATION; return $?; }
  [ "$(stow_fingerprint "$root" 2>/dev/null)" = "$fp" ] || { stow_refuse SOURCE_CHANGED; return $?; }; printf 'status\tsuccess\tchecked\n'
}
stow_verify() {
  local root=$1; shift
  stow_args "$root" "$@" || { printf 'status\tfailed\tSTOW_VERIFY\n' >&2; return 3; }
  stow_inputs "$root" "$STOW_PROFILE" "$STOW_PLATFORM" || { printf 'status\tfailed\tSTOW_VERIFY\n' >&2; return 3; }; fp=$(stow_fingerprint "$root") || { printf 'status\tfailed\tSOURCE_CHANGED\n' >&2; return 3; }
  stow_exact "$root" "$STOW_TARGET" || { printf 'status\tfailed\tSTOW_VERIFY\n' >&2; return 3; }
  [ "$(stow_fingerprint "$root" 2>/dev/null)" = "$fp" ] || { printf 'status\tfailed\tSOURCE_CHANGED\n' >&2; return 3; }; printf 'status\tsuccess\tverified\n'
}
stow_apply() {
  local root=$1; shift
  stow_args "$root" "$@" || { stow_refuse ARGUMENT; return $?; }
  stow_inputs "$root" "$STOW_PROFILE" "$STOW_PLATFORM" || { stow_refuse SOURCE; return $?; }; fp=$(stow_fingerprint "$root") || { stow_refuse SOURCE; return $?; }; stow_rows "$STOW_PROFILE"
  if stow_exact "$root" "$STOW_TARGET"; then [ "$(stow_fingerprint "$root" 2>/dev/null)" = "$fp" ] || { stow_refuse SOURCE_CHANGED; return $?; }; printf 'status\tnoop\tunchanged\n'; return 0; fi
  command -v stow >/dev/null 2>&1 || { printf 'status\tfailed\tDEPENDENCY\n' >&2; return 69; }
  if ! stow_existing_safe "$root" "$STOW_TARGET" || ! (cd -- "$root" && stow --simulate --verbose=2 --no-folding --target "$STOW_TARGET" "${STOW_PACKAGES[@]}") >/dev/null 2>&1; then stow_refuse STOW_SIMULATION; return $?; fi
  [ "$(stow_fingerprint "$root" 2>/dev/null)" = "$fp" ] || { stow_refuse SOURCE_CHANGED; return $?; }
  (cd -- "$root" && stow --no-folding --target "$STOW_TARGET" "${STOW_PACKAGES[@]}") >/dev/null 2>&1 || { printf 'status\tfailed\tSTOW_APPLY\nguidance\tdocs/dotfiles/limitations.md\n' >&2; return 3; }
  [ "$(stow_fingerprint "$root" 2>/dev/null)" = "$fp" ] || { printf 'status\tfailed\tSOURCE_CHANGED\nguidance\tdocs/dotfiles/limitations.md\n' >&2; return 3; }
  stow_verify "$root" --profile "$STOW_PROFILE" --platform "$STOW_PLATFORM" --target "$STOW_TARGET" >/dev/null 2>&1 || { printf 'status\tfailed\tSTOW_VERIFY\nguidance\tdocs/dotfiles/limitations.md\n' >&2; return 3; }
  [ "$(stow_fingerprint "$root" 2>/dev/null)" = "$fp" ] || { printf 'status\tfailed\tSOURCE_CHANGED\nguidance\tdocs/dotfiles/limitations.md\n' >&2; return 3; }; printf 'status\tsuccess\tapplied\n'
}
