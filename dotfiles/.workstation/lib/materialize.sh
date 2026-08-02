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
      mode=100$(stat -c %a "$root/$path")
      size=$(stat -c %s "$root/$path")
      hash=$(sha256sum "$root/$path" | awk '{print $1}')
      printf '%s\tfile\t%s\t%s\tsha256:%s\n' "$path" "$mode" "$size" "$hash"
    done < <(tail -n +2 "$root/.workstation/control-files.tsv")
  } | LC_ALL=C sort > "$work/records"
  hash=$(sha256sum "$work/records" | awk '{print $1}')
  trap - RETURN; rm -rf -- "$work"
  printf 'fingerprint\tsha256\t%s\n' "$hash"
}

materialize() {
  local root=$1; shift
  case "${1:-}" in
    inspect) [ "${2:-}" = --target ] && [ -n "${3:-}" ] && [ "$#" = 3 ] || { materialize_status refused ARGUMENT; return 1; }; materialize_inspect "$root" "$3" ;;
    fingerprint) [ "$#" = 1 ] || { materialize_status refused ARGUMENT; return 1; }; materialize_fingerprint "$root" ;;
    *) materialize_status refused COMMAND; return 1 ;;
  esac
}
