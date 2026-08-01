#!/usr/bin/env bash
set -euo pipefail
usage() { echo 'usage: inventory-from-git.sh --git-dir DIR --revision SHA --output FILE | --validate FILE | --validate-decisions FILE' >&2; exit 64; }
classify() {
  package=${1%%/*}; class=arch/omarchy; disposition=include; reason=approved; security=clear
  case "$1" in
    backgrounds/*) package=backgrounds; reason=media-separate; security=reviewed-reference ;;
    mcp/*) package=mcp; class=excluded/local; disposition=exclude; reason=external-secret-contract; security=reviewed-reference ;;
    systems/darwin/*) package=systems/darwin; class=macos; disposition=exclude; reason=machine-specific-darwin ;;
    nvim/.config/nvim/.neoconf.json|nvim/.config/nvim/lazy-lock.json) package=nvim; class=excluded/local; disposition=exclude; reason=generated-or-cache ;;
    .atl/*) package=.atl; class=excluded/local; disposition=exclude; reason=generated-local-metadata ;;
    .env.example) package=.env.example; class=excluded/local; disposition=exclude; reason=credential-shaped-reference; security=reviewed-reference ;;
    .gitignore|.stow-local-ignore) package=$1; class=excluded/local; disposition=exclude; reason=local-ignore-policy ;;
    ghostty-darwin/*) package=ghostty-darwin; class=macos ;;
    nvim/*|tmux/*|starship/*) class=shared ;;
    zshrc/.config/zsh/darwin.zsh) package=zshrc; class=macos ;;
    zshrc/.config/zsh/local.example.zsh) package=zshrc; class=excluded/local; disposition=exclude; reason=machine-specific-template ;;
    zshrc/*) package=zshrc; class=shared ;;
  esac
}
validate() {
  local f=$1 rows=0 prev='' line kind path type mode size digest package class disposition reason security extra
  [ -f "$f" ] && IFS= read -r line < "$f" && [ "$line" = $'schema\tinventory-v1' ] || return 2
  while IFS=$'\t' read -r kind path type mode size digest package class disposition reason security extra; do
    [ -z "${extra:-}" ] && [ "$kind" = file ] && [[ "$path" != /* && "$path" != *..* ]] || return 2
    case "$type:$mode" in file:100644|executable:100755|symlink:120000) ;; *) return 2;; esac
    [[ "$size" =~ ^[0-9]+$ && "$class" =~ ^(shared|arch/omarchy|macos|excluded/local)$ ]] || return 2
    [[ "$disposition" =~ ^(include|exclude)$ && "$security" =~ ^(clear|reviewed-reference)$ ]] || return 2
    { [ "$type" = symlink ] && [[ "$digest" != /* ]]; } || { [ "$type" != symlink ] && [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; } || return 2
    [ -z "$prev" ] || { [ "$prev" != "$path" ] && printf '%s\n%s\n' "$prev" "$path" | LC_ALL=C sort -C; } || return 2
    prev=$path; rows=$((rows + 1))
  done < <(tail -n +2 "$f")
  [ "$rows" -eq 58 ]
}
validate_decisions() {
  local f=$1
  [ "$(grep -cx 'import_method=pending' "$f")" = 1 ] &&
    [ "$(grep -cx 'backgrounds=include-separately' "$f")" = 1 ] &&
    [ "$(grep -cx 'import_authorization=pending' "$f")" = 1 ] &&
    [ "$(grep -cx 'size_exception=pending' "$f")" = 1 ]
}
if [ "${1:-}" = --validate ]; then [ "$#" = 2 ] || usage; validate "$2"; exit $?; fi
if [ "${1:-}" = --validate-decisions ]; then [ "$#" = 2 ] || usage; validate_decisions "$2"; exit $?; fi
[ "$#" = 6 ] && [ "$1" = --git-dir ] && [ "$3" = --revision ] && [ "$5" = --output ] || usage
gitdir=$2; commit=$4; output=$6
git --git-dir="$gitdir" cat-file -e "$commit^{tree}" || exit 2
mkdir -p "$(dirname "$output")"; tmp=$(mktemp "${output}.tmp.XXXXXX"); trap 'rm -f "$tmp"' EXIT
printf 'schema\tinventory-v1\n' > "$tmp"
while IFS= read -r -d '' record; do
  meta=${record%%$'\t'*}; path=${record#*$'\t'}; read -r mode _ oid size <<< "$meta"
  case "$mode" in 100644) type="file";; 100755) type="executable";; 120000) type="symlink";; *) exit 2;; esac
  classify "$path"
  if [ "$type" = symlink ]; then digest=$(git --git-dir="$gitdir" cat-file blob "$oid"); [[ "$digest" != /* ]] || exit 2
  else digest="sha256:$(git --git-dir="$gitdir" cat-file blob "$oid" | sha256sum | awk '{print $1}')"; fi
  printf 'file\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\t%s\n' "$path" "$type" "$mode" "$size" "$digest" "$package" "$class" "$disposition" "$reason" "$security" >> "$tmp"
done < <(git --git-dir="$gitdir" ls-tree -r -z -l "$commit")
{ head -n1 "$tmp"; tail -n +2 "$tmp" | LC_ALL=C sort -t $'\t' -k2,2; } > "$output"
validate "$output" || { rm -f "$output"; exit 2; }
