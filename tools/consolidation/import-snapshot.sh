#!/usr/bin/env bash
set -euo pipefail
usage(){ printf '%s\n' 'usage: import-snapshot.sh apply|verify --git-dir DIR --revision SHA --inventory FILE --security-report FILE --destination DIR' >&2; exit 64; }
die(){ printf 'snapshot\tFAIL\t%s\n' "$1" >&2; exit 2; }
[ "$#" = 11 ] || usage
operation=$1; shift
[ "$1" = --git-dir ] && [ "$3" = --revision ] && [ "$5" = --inventory ] && [ "$7" = --security-report ] && [ "$9" = --destination ] || usage
gitdir=$2; revision=$4; inventory=$6; report=$8; destination=${10}
case "$operation" in apply|verify) ;; *) usage;; esac
case "$revision" in ''|*$'\t'*|*$'\n'*|*' '*) die REVISION;; esac
[ -d "$gitdir" ] && [ -f "$inventory" ] && [ -f "$report" ] || die INPUT
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
inventory_tool=$root/tools/consolidation/inventory-from-git.sh
security_tool=$root/tools/consolidation/review-tracked-content.sh
[ -x "$inventory_tool" ] && [ -x "$security_tool" ] || die TOOLS
tmp=$(mktemp -d /tmp/snapshot-import.XXXXXX) || die TEMP
stage=''
cleanup(){ [ -n "$stage" ] && [ -d "$stage" ] && rm -rf -- "$stage"; rm -rf -- "$tmp"; }
trap cleanup EXIT
"$inventory_tool" --git-dir "$gitdir" --revision "$revision" --output "$tmp/inventory.tsv" >/dev/null 2>&1 || die INVENTORY
cmp -s "$tmp/inventory.tsv" "$inventory" || die INVENTORY_MISMATCH
"$security_tool" --git-dir "$gitdir" --revision "$revision" --inventory "$tmp/inventory.tsv" --report "$tmp/security.tsv" >/dev/null 2>&1 || die SECURITY
cmp -s "$tmp/security.tsv" "$report" || die SECURITY_MISMATCH
safe_path(){ case "$1" in ''|/*|*'..'*|.git|.git/*|*/.git|*/.git/*|backgrounds/*|.env|.atl/*|.pi/*) return 1;; *) return 0;; esac; }
safe_link(){ local path=$1 value=$2 base part; [[ "$value" != /* && "$value" != *$'\n'* && "$value" != *$'\t'* ]] || return 1; base=${path%/*}; [ "$base" = "$path" ] && base=''; local -a stack=(); IFS=/ read -ra parts <<< "$base/$value"; for part in "${parts[@]}"; do case "$part" in ''|.) ;; ..) [ "${#stack[@]}" -gt 0 ] || return 1; unset 'stack[${#stack[@]}-1]';; *) stack+=("$part");; esac; done; }
declare -A wanted_type wanted_mode wanted_size wanted_id wanted_oid wanted_dir
count=0
while IFS=$'\t' read -r kind path type mode size identity _ _ disposition _ security extra; do
  [ "$kind" = file ] && [ -z "${extra:-}" ] || die INVENTORY_FORMAT
  [ "$disposition" = include ] || continue
  case "$path" in backgrounds/*) continue;; esac
  safe_path "$path" || die PATH
  case "$type:$mode" in file:100644|executable:100755|symlink:120000) ;; *) die TYPE;; esac
  if [ "$disposition" = include ]; then
    [ "$security" != blocked ] || die BLOCKED
    [ "${wanted_type[$path]+yes}" != yes ] || die DUPLICATE
    wanted_type[$path]=$type; wanted_mode[$path]=$mode; wanted_size[$path]=$size; wanted_id[$path]=$identity; parent_path=${path%/*}; while [ "$parent_path" != "$path" ]; do wanted_dir[$parent_path]=1; path=$parent_path; parent_path=${path%/*}; done; count=$((count+1))
  fi
done < <(tail -n +2 "$inventory")
[ "$count" = 41 ] || die COUNT
tree=$(git --git-dir="$gitdir" rev-parse --verify "$revision^{tree}" 2>/dev/null) || die REVISION
while IFS= read -r -d '' record; do
  meta=${record%%$'\t'*}; path=${record#*$'\t'}; read -r mode _ oid size <<< "$meta"
  [ "${wanted_type[$path]+yes}" = yes ] || continue
  case "$mode" in 100644) type='file';; 100755) type='executable';; 120000) type='symlink';; *) die TYPE;; esac
  [ "$type" = "${wanted_type[$path]}" ] && [ "$mode" = "${wanted_mode[$path]}" ] && [ "$size" = "${wanted_size[$path]}" ] || die IDENTITY
  if [ "$type" = symlink ]; then
    value=$(git --git-dir="$gitdir" cat-file blob "$oid") || die OBJECT
    [ "$value" = "${wanted_id[$path]}" ] || die SYMLINK
    safe_link "$path" "$value" || die SYMLINK
  else
    digest=sha256:$(git --git-dir="$gitdir" cat-file blob "$oid" | sha256sum | awk '{print $1}') || die OBJECT
    [ "$digest" = "${wanted_id[$path]}" ] || die IDENTITY
  fi
  wanted_oid[$path]=$oid
done < <(git --git-dir="$gitdir" ls-tree -r -z -l "$tree")
[ "${#wanted_oid[@]}" = 41 ] || die MISSING
verify(){
  [ -d "$destination" ] || die DESTINATION
  local path actual type digest value entries=0 rel
  [ ! -e "$destination/.git" ] || die NESTED_GIT
  while IFS= read -r -d '' actual; do rel=${actual#"$destination/"}; [ "${wanted_dir[$rel]+yes}" = yes ] || die EXTRA; case "$rel" in .git|*/.git|.git/*|*/.git/*) die NESTED_GIT;; esac; done < <(find "$destination" -mindepth 1 -type d -print0 | LC_ALL=C sort -z)
  while IFS= read -r -d '' actual; do
    rel=${actual#"$destination/"}; [ "${wanted_type[$rel]+yes}" = yes ] || die EXTRA; entries=$((entries+1))
    if [ -L "$actual" ]; then
      type='symlink'
      value=$(readlink "$actual")
      [ "$value" = "${wanted_id[$rel]}" ] || die SYMLINK
      safe_link "$rel" "$value" || die SYMLINK
    elif [ -f "$actual" ]; then
      type='file'
      [ -x "$actual" ] && type='executable'
      digest=sha256:$(sha256sum "$actual" | awk '{print $1}')
      [ "$digest" = "${wanted_id[$rel]}" ] || die IDENTITY
    else die TYPE; fi
    [ "$type" = "${wanted_type[$rel]}" ] || die MODE
    [ "$type" = symlink ] || [ "$(stat -c %a "$actual")" = "${wanted_mode[$rel]#100}" ] || die MODE
  done < <(find "$destination" -mindepth 1 \( -type f -o -type l \) -print0 | LC_ALL=C sort -z)
  [ "$entries" = 41 ] || die MISSING
  printf 'snapshot\tVERIFY\tPASS\tpaths=41\n'
}
if [ "$operation" = verify ]; then verify; exit 0; fi
[ ! -e "$destination" ] || die DESTINATION_EXISTS
parent=$(dirname -- "$destination"); [ -d "$parent" ] || die DESTINATION_PARENT
stage=$(mktemp -d "$parent/.snapshot-stage.XXXXXX") || die STAGE
for path in "${!wanted_oid[@]}"; do
  target=$stage/$path; mkdir -p "$(dirname -- "$target")"
  if [ "${wanted_type[$path]}" = symlink ]; then ln -s -- "${wanted_id[$path]}" "$target"; else git --git-dir="$gitdir" cat-file blob "${wanted_oid[$path]}" > "$target" || die MATERIALIZE; chmod "${wanted_mode[$path]#100}" "$target"; fi
done
saved_destination=$destination; destination=$stage; verify; destination=$saved_destination
mv -- "$stage" "$destination" || die RENAME
stage=''
printf 'snapshot\tAPPLY\tPASS\tpaths=41\n'
