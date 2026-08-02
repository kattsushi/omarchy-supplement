#!/usr/bin/env bash
set -euo pipefail

materialize_status() { printf 'status\t%s\t%s\n' "$1" "$2"; }

materialize_lineage() {
  local url=$1
  [[ $url != *'@'* || $url == git@github.com:* || $url == ssh://git@github.com/* ]] || return 1
  case $url in
    git@github.com:kattsushi/dotfiles-v2|git@github.com:kattsushi/dotfiles-v2.git|ssh://git@github.com/kattsushi/dotfiles-v2|ssh://git@github.com/kattsushi/dotfiles-v2.git|https://github.com/kattsushi/dotfiles-v2|https://github.com/kattsushi/dotfiles-v2.git) return 0 ;;
    *) return 1 ;;
  esac
}

materialize_inspect() {
  local source=$1 target=$2 top remotes url head branch upstream
  if [ -L "$target" ]; then materialize_status refused SYMLINK_TARGET; return 1; fi
  if [ ! -e "$target" ]; then materialize_status absent eligible; return 0; fi
  if [ ! -d "$target" ]; then materialize_status refused SPECIAL_TARGET; return 1; fi
  top=$(CDPATH='' cd -- "$target" 2>/dev/null && pwd -P) || { materialize_status refused SPECIAL_TARGET; return 1; }
  source=$(CDPATH='' cd -- "$source" 2>/dev/null && pwd -P) || { materialize_status refused SOURCE; return 1; }
  case $source in "$top"|"$top"/*) materialize_status refused MANAGED_SOURCE; return 1;; esac
  git -C "$top" rev-parse --is-inside-work-tree >/dev/null 2>&1 || { if (verify_source "$top" >/dev/null 2>&1); then materialize_status refused UNMANAGED_DIRECTORY; else materialize_status refused NON_GIT; fi; return 1; }
  [ "$(git -C "$top" rev-parse --show-toplevel 2>/dev/null)" = "$top" ] || { materialize_status refused NESTED_GIT; return 1; }
  remotes=$(git -C "$top" remote 2>/dev/null | wc -l) || { materialize_status refused NON_GIT; return 1; }
  [ "$remotes" = 1 ] || { materialize_status refused MULTIPLE_REMOTE; return 1; }
  url=$(git -C "$top" remote get-url --all origin 2>/dev/null) || { materialize_status refused WRONG_REMOTE; return 1; }
  [ "$(printf '%s\n' "$url" | wc -l)" = 1 ] || { materialize_status refused MULTIPLE_REMOTE; return 1; }
  materialize_lineage "$url" || { materialize_status refused WRONG_LINEAGE; return 1; }
  head=$(git -C "$top" rev-parse HEAD 2>/dev/null) || { materialize_status refused WRONG_PIN; return 1; }
  [ "$head" = 6e36129058e5b0550ef5345e192557e785befbf5 ] || { materialize_status refused WRONG_PIN; return 1; }
  branch=$(git -C "$top" symbolic-ref --quiet --short HEAD 2>/dev/null) || { materialize_status refused DETACHED_BRANCH; return 1; }
  [ "$branch" = master ] || { materialize_status refused AMBIGUOUS_BRANCH; return 1; }
  upstream=$(git -C "$top" rev-parse --abbrev-ref --symbolic-full-name '@{upstream}' 2>/dev/null) || { materialize_status refused AMBIGUOUS_UPSTREAM; return 1; }
  if [ "$upstream" != origin/master ] || ! git -C "$top" show-ref --verify --quiet refs/remotes/origin/master; then materialize_status refused AMBIGUOUS_UPSTREAM; return 1; fi
  git -C "$top" diff --quiet --ignore-submodules -- || { materialize_status refused DIRTY; return 1; }
  git -C "$top" diff --cached --quiet --ignore-submodules -- || { materialize_status refused STAGED; return 1; }
  git -C "$top" ls-files --others --exclude-standard | grep -q . && { materialize_status refused UNTRACKED; return 1; }
  if { [ -e "$top/.env" ] && git -C "$top" check-ignore -q -- .env; } || { [ -e "$top/.pi" ] && git -C "$top" check-ignore -q -- .pi; } || { [ -e "$top/.atl/.skill-registry.cache.json" ] && git -C "$top" check-ignore -q -- .atl/.skill-registry.cache.json; }; then materialize_status refused IGNORED_SENSITIVE; return 1; fi
  git -C "$top" merge-base --is-ancestor refs/remotes/origin/master HEAD || { materialize_status refused DIVERGENT; return 1; }
  git -C "$top" merge-base --is-ancestor HEAD refs/remotes/origin/master || { materialize_status refused UNPUSHED; return 1; }
  materialize_status success expected-clean
}

materialize_fingerprint() {
  local root=$1 work path type mode size value hash
  verify_source "$root"
  work=$(mktemp -d "${TMPDIR:-/tmp}/workstation-fingerprint.XXXXXX") || refuse SOURCE
  trap 'rm -rf -- "$work"' RETURN
  {
    while IFS=$'\t' read -r _ path type mode size value _; do
      case $type in file|executable) printf '%s\t%s\t%s\t%s\t%s\n' "$path" "$type" "$mode" "$size" "$value";; symlink) printf '%s\tlink\t%s\t%s\t%s\n' "$path" "$mode" "$size" "$value";; esac
    done < <(tail -n +2 "$root/.workstation/source-files.tsv")
    while IFS=$'\t' read -r _ path; do
      mode=100$(stat -c %a "$root/$path"); size=$(stat -c %s "$root/$path"); hash=$(sha256sum "$root/$path" | awk '{print $1}')
      printf '%s\tfile\t%s\t%s\tsha256:%s\n' "$path" "$mode" "$size" "$hash"
    done < <(tail -n +2 "$root/.workstation/control-files.tsv")
  } | LC_ALL=C sort > "$work/records"
  hash=$(sha256sum "$work/records" | awk '{print $1}')
  trap - RETURN; rm -rf -- "$work"
  printf 'fingerprint\tsha256\t%s\n' "$hash"
}

materialize_fail() { if declare -F cleanup >/dev/null; then cleanup || :; fi; materialize_status failed "$1"; return 3; }
materialize_refuse() { materialize_status refused "$1"; return 2; }

materialize_parent() {
  local target=$1 parent part current=/
  parent=${target%/*}; [ -n "$parent" ] || parent=/
  [ -d "$parent" ] || return 1
  case $target in /*) ;; *) return 1;; esac
  IFS=/ read -r -a parts <<< "${parent#/}"
  for part in "${parts[@]}"; do
    [ -n "$part" ] || continue
    current=$current$part
    [ ! -L "$current" ] && [ -d "$current" ] || return 1
    current=$current/
  done
  CDPATH='' cd -- "$parent" 2>/dev/null && pwd -P
}

materialize_parent_ok() {
  local parent=$1 uid
  uid=$(id -u) || return 1
  [ "$(stat -c %u "$parent" 2>/dev/null)" = "$uid" ] && [ -w "$parent" ] && [ "$(stat -c %d "$parent" 2>/dev/null)" ]
}

materialize_space_ok() {
  local source=$1 parent=$2 bytes avail
  bytes=$( { tail -n +2 "$source/.workstation/source-files.tsv" | awk -F '\t' '$3 != "symlink" { n += $5 } END { print n+0 }'; tail -n +2 "$source/.workstation/control-files.tsv" | while IFS=$'\t' read -r _ path; do stat -c %s "$source/$path"; done; } | awk '{n += $1} END {print n+1048576}') || return 1
  avail=$(df -Pk "$parent" 2>/dev/null | awk 'NR==2 {print $4}') || return 1
  [[ $avail =~ ^[0-9]+$ ]] && [ "$avail" -ge $(( (bytes * 2 + 1023) / 1024 )) ]
}

materialize_stage_ok() {
  local stage=$1 fingerprint=$2 staged
  (verify_source "$stage" >/dev/null 2>&1) || return 1
  staged=$(materialize_fingerprint "$stage" 2>/dev/null) || return 1
  [ "$staged" = "$fingerprint" ]
}

materialize_copy() {
  local source=$1 stage=$2 path type mode size value _
  while IFS=$'\t' read -r _ path type mode size value _; do
    mkdir -p -- "$stage/$(dirname -- "$path")" || return 1
    case $type in
      symlink) ln -s -- "$value" "$stage/$path" || return 1 ;;
      file|executable) cp -- "$source/$path" "$stage/$path" && chmod "${mode#100}" "$stage/$path" || return 1 ;;
    esac
  done < <(tail -n +2 "$source/.workstation/source-files.tsv")
  while IFS=$'\t' read -r _ path; do
    mkdir -p -- "$stage/$(dirname -- "$path")" || return 1
    cp -- "$source/$path" "$stage/$path" && chmod "$(stat -c %a "$source/$path")" "$stage/$path" || return 1
  done < <(tail -n +2 "$source/.workstation/control-files.tsv")
}

materialize_apply() {
  local source=$1 target=${3:-} parent='' stage='' lock='' marker='' owner='' fp='' installed_fp='' reason='' dev=''
  [ "$#" = 3 ] && [ "${2:-}" = --target ] || { materialize_status refused ARGUMENT; return 64; }
  case $target in /*) ;; *) materialize_refuse TARGET; return $?;; esac
  [[ $target != *$'\t'* && $target != *$'\n'* && $target != */./* && $target != */../* && $target != */. && $target != */.. && ${target##*/} =~ ^[A-Za-z0-9._-]+$ ]] || { materialize_refuse TARGET; return $?; }
  [ "$target" != / ] && [ ! -e "$target" ] && [ ! -L "$target" ] || {
    if (verify_source "$target" >/dev/null 2>&1) && fp=$(materialize_fingerprint "$source" 2>/dev/null) && [ "$fp" = "$(materialize_fingerprint "$target" 2>/dev/null)" ]; then materialize_status noop unchanged; return 0; fi
    reason=$(materialize_inspect "$source" "$target" 2>/dev/null || :)
    case $reason in $'status\tsuccess\texpected-clean') materialize_refuse EXPECTED_CLEAN_PENDING;; $'status\trefused\t'*) printf '%s\n' "$reason";; *) materialize_refuse PRESENT_TARGET;; esac
    return 2
  }
  parent=$(materialize_parent "$target") || { materialize_refuse PARENT; return $?; }
  source=$(CDPATH='' cd -- "$source" 2>/dev/null && pwd -P) || { materialize_refuse SOURCE; return $?; }
  case $target in "$source"|"$source"/*) materialize_refuse RELATION; return $?;; esac
  case $source in "$parent/${target##*/}"|"$parent/${target##*/}"/*) materialize_refuse RELATION; return $?;; esac
  [ "$(uname -s)" = Linux ] || { materialize_refuse PLATFORM_UNVERIFIED; return $?; }
  local dependency
  for dependency in awk cp df mktemp sha256sum stat; do
    if ! command -v "$dependency" >/dev/null 2>&1; then
      materialize_status failed DEPENDENCY
      return 69
    fi
  done
  (verify_source "$source" >/dev/null 2>&1) || { materialize_fail SOURCE; return $?; }
  fp=$(materialize_fingerprint "$source" 2>/dev/null) || { materialize_fail SOURCE; return $?; }
  if ! materialize_parent_ok "$parent" "$parent" || ! materialize_space_ok "$source" "$parent"; then
    materialize_refuse PARENT
    return $?
  fi
  lock=$parent/.workstation-materialize-lock
  mkdir -- "$lock" 2>/dev/null || { materialize_refuse LOCKED; return $?; }
  owner="$$:$RANDOM"; marker=$lock/owner; umask 077; printf '%s' "$owner" > "$marker" || { materialize_fail LOCK; return $?; }
  cleanup() { [ -n "${stage:-}" ] && [ -d "${stage:-}" ] && rm -rf -- "$stage" || :; [ -f "${marker:-}" ] && [ "$(cat "$marker" 2>/dev/null)" = "${owner:-}" ] && rm -rf -- "$lock" || :; return 0; }
  trap cleanup EXIT
  trap 'cleanup; exit 3' HUP INT TERM
  stage=$(mktemp -d "$parent/.workstation-materialize-stage.XXXXXX" 2>/dev/null) || { materialize_fail STAGE; return $?; }
  chmod 700 "$stage" || { materialize_fail STAGE; return $?; }
  dev=$(stat -c %d "$parent")
  [ "$(stat -c %d "$stage")" = "$dev" ] || { materialize_fail DEVICE; return $?; }
  materialize_copy "$source" "$stage" || { materialize_fail COPY; return $?; }
  if ! materialize_stage_ok "$stage" "$fp"; then materialize_fail VERIFY; return $?; fi
  if [ -e "$target" ] || [ -L "$target" ]; then materialize_fail RECHECK; return $?; fi
  if ! materialize_parent_ok "$parent" "$parent"; then materialize_fail RECHECK; return $?; fi
  if ! materialize_space_ok "$source" "$parent"; then materialize_fail RECHECK; return $?; fi
  if [ "$(stat -c %d "$parent")" != "$dev" ]; then materialize_fail RECHECK; return $?; fi
  if [ "$(cat "$marker" 2>/dev/null)" != "$owner" ]; then materialize_fail RECHECK; return $?; fi
  if [ "$(materialize_fingerprint "$source" 2>/dev/null)" != "$fp" ]; then materialize_fail SOURCE_CHANGED; return $?; fi
  if ! materialize_stage_ok "$stage" "$fp"; then materialize_fail VERIFY; return $?; fi
  mv -- "$stage" "$target" 2>/dev/null || { materialize_fail RENAME; return $?; }
  stage=
  if ! (verify_source "$target" >/dev/null 2>&1) || ! installed_fp=$(materialize_fingerprint "$target" 2>/dev/null) || [ "$installed_fp" != "$fp" ]; then
    [ -f "$marker" ] && [ "$(cat "$marker" 2>/dev/null)" = "$owner" ] && rm -rf -- "$lock"; trap - EXIT HUP INT TERM
    materialize_status failed INSTALLED_VERIFY; return 3
  fi
  materialize_status success materialized
  cleanup
  trap - EXIT HUP INT TERM
}

materialize() {
  local root=$1; shift
  case "${1:-}" in
    inspect) [ "${2:-}" = --target ] && [ -n "${3:-}" ] && [ "$#" = 3 ] || { materialize_status refused ARGUMENT; return 1; }; materialize_inspect "$root" "$3" ;;
    fingerprint) [ "$#" = 1 ] || { materialize_status refused ARGUMENT; return 1; }; materialize_fingerprint "$root" ;;
    apply) shift; materialize_apply "$root" "$@" ;;
    *) materialize_status refused COMMAND; return 1 ;;
  esac
}
