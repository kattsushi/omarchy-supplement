#!/usr/bin/env bash
set -euo pipefail
usage(){ printf '%s\n' 'usage: review-tracked-content.sh --git-dir DIR --revision SHA --inventory FILE --report FILE' >&2; exit 64; }
refuse(){ printf 'refusal\t%s\t%s\n' "$1" "$2" >&2; exit 2; }
[ "$#" = 8 ] && [ "$1" = --git-dir ] && [ "$3" = --revision ] && [ "$5" = --inventory ] && [ "$7" = --report ] || usage
gitdir=$2 rev=$4 inventory=$6 report=$8
[ -f "$inventory" ] || refuse INPUT INVALID
case "$rev" in *$'\t'*|*$'\n'*|*' '*) refuse INPUT REVISION;; esac
case "$report" in ''|*$'\t'*|*$'\n'*) refuse INPUT REPORT;; esac
report_parent=$(dirname -- "$report")
[ -d "$report_parent" ] && [ ! -d "$report" ] || refuse INPUT REPORT
rm -f -- "$report"
tree=$(git --git-dir="$gitdir" rev-parse --verify "$rev^{tree}" 2>/dev/null) || refuse REVISION MISSING
[[ "$tree" =~ ^[0-9a-f]{40,64}$ ]] || refuse REVISION INVALID
declare -A want_type want_mode want_size want_id seen seen_oid
rows=0; previous=''
while IFS=$'\t' read -r kind path entry_type mode size identity _ class disposition _ security extra; do
  [ "$kind" = file ] && [ -z "${extra:-}" ] && [[ "$path" != /* && "$path" != *$'\t'* && "$path" != *$'\n'* && "$path" != *..* ]] || refuse INVENTORY PATH
  [[ "$entry_type:$mode" =~ ^(file:100644|executable:100755|symlink:120000)$ && "$size" =~ ^[0-9]+$ ]] || refuse "$path" IDENTITY
  [[ "$class" =~ ^(shared|arch/omarchy|macos|excluded/local)$ && "$disposition" =~ ^(include|exclude)$ ]] || refuse "$path" POLICY
  [[ "$security" =~ ^(clear|reviewed-reference|blocked)$ ]] || refuse "$path" POLICY
  if [ "$security" = blocked ] && [ "$disposition" != exclude ]; then refuse "$path" POLICY; fi
  { [ "$entry_type" = symlink ] && [[ "$identity" != /* && "$identity" != *$'\t'* && "$identity" != *$'\n'* ]]; } || { [ "$entry_type" != symlink ] && [[ "$identity" =~ ^sha256:[0-9a-f]{64}$ ]]; } || refuse "$path" IDENTITY
  if [ -n "$previous" ] && ! printf '%s\n%s\n' "$previous" "$path" | LC_ALL=C sort -C; then refuse INVENTORY ORDER; fi
  previous=$path; want_type["$path"]=$entry_type; want_mode["$path"]=$mode; want_size["$path"]=$size; want_id["$path"]=$identity
  rows=$((rows + 1))
done < <(tail -n +2 "$inventory")
IFS= read -r header < "$inventory"; [ "$header" = $'schema\tinventory-v1' ] && [ "$rows" = 58 ] || refuse INVENTORY SCHEMA
safe_link(){ local part base=${1%/*} link=$2; [ "$base" = "$1" ] && base=''; IFS=/ read -ra parts <<< "$base/$link"; local -a stack=(); for part in "${parts[@]}"; do case "$part" in ''|.) ;; ..) [ "${#stack[@]}" -gt 0 ] || return 1; unset 'stack[${#stack[@]}-1]';; *) stack+=("$part");; esac; done; }
while IFS= read -r -d '' record; do
  meta=${record%%$'\t'*}; path=${record#*$'\t'}; read -r mode _ oid size <<< "$meta"
  [[ "$path" != *$'\t'* && "$path" != *$'\n'* ]] || refuse TREE PATH
  case "$mode" in 100644) entry_type='file';; 100755) entry_type='executable';; 120000) entry_type='symlink';; *) refuse "$path" TYPE;; esac
  case "$path" in .env|.atl/.skill-registry.cache.json|.pi/*) refuse "$path" FORBIDDEN_LOCAL;; esac
  [ "${want_type[$path]+yes}" = yes ] || refuse "$path" EXTRA
  [ "${want_type[$path]}" = "$entry_type" ] && [ "${want_mode[$path]}" = "$mode" ] && [ "${want_size[$path]}" = "$size" ] || refuse "$path" IDENTITY
  if [ "$entry_type" = symlink ]; then
    value=$(git --git-dir="$gitdir" cat-file blob "$oid" 2>/dev/null) || refuse "$path" OBJECT
    [ "$value" = "${want_id[$path]}" ] || refuse "$path" IDENTITY
    safe_link "$path" "$value" || refuse "$path" UNSAFE_SYMLINK
  else
    digest=sha256:$(git --git-dir="$gitdir" cat-file blob "$oid" 2>/dev/null | sha256sum | awk '{print $1}') || refuse "$path" OBJECT
    [ "$digest" = "${want_id[$path]}" ] || refuse "$path" IDENTITY
  fi
  seen["$path"]=1; seen_oid["$path"]=$oid
done < <(git --git-dir="$gitdir" ls-tree -r -z -l "$tree" 2>/dev/null) || refuse TREE INVALID
[ "${#seen[@]}" = 58 ] || refuse TREE MISSING
for path in "${!want_type[@]}"; do [ "${seen[$path]+yes}" = yes ] || refuse "$path" MISSING; done
tmp=$(mktemp "${report}.tmp.XXXXXX"); trap 'rm -f "$tmp" "${tmp}.sorted"' EXIT
printf 'schema\tsecurity-review-v1\n' > "$tmp"
add(){ printf 'finding\t%s\t%s\tSECURITY\t%s\t%s\n' "$1" "$2" "$3" "$4" >> "$tmp"; }
for path in "${!seen[@]}"; do
  entry_type=${want_type[$path]}
  case "$path" in
    .env.example) add "$path" CRED_PATH BLOCKED credential-shaped-reference;;
    mcp/*) add "$path" MCP_CONTRACT BLOCKED external-secret-contract;;
    .atl/*|.gitignore|.stow-local-ignore|nvim/.config/nvim/.neoconf.json|nvim/.config/nvim/lazy-lock.json|zshrc/.config/zsh/local.example.zsh) add "$path" LOCAL_STATE BLOCKED excluded-local-state;;
    systems/darwin/*) add "$path" DARWIN_IDENTITY BLOCKED machine-specific-darwin;;
  esac
  [ "$entry_type" = executable ] && add "$path" EXECUTABLE_REVIEWED INCLUDE executable-reviewed
  [ "$entry_type" = symlink ] && add "$path" SYMLINK_APPROVED INCLUDE approved-relative-symlink
  { [ "$entry_type" = file ] || [ "$entry_type" = executable ]; } && [[ "$path" != backgrounds/* ]] || continue
  oid=${seen_oid[$path]}
  if git --git-dir="$gitdir" cat-file blob "$oid" 2>/dev/null | grep -Eaq -- '-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----'; then add "$path" PRIVATE_KEY BLOCKED private-key-marker; fi
  # shellcheck disable=SC2016
  if git --git-dir="$gitdir" cat-file blob "$oid" 2>/dev/null | grep -Eaq -- '(^|[[:space:]])(api[_-]?key|token|password|secret)[[:space:]]*[:=][[:space:]]*[^${<][^[:space:]]{7,}'; then add "$path" LITERAL_SECRET BLOCKED likely-literal-secret; fi
  if git --git-dir="$gitdir" cat-file blob "$oid" 2>/dev/null | grep -Eaq -- '(\$\{[^}]+\}|<[^>]*(TOKEN|SECRET|KEY)[^>]*>)'; then add "$path" SECRET_REFERENCE REFERENCE secret-reference-placeholder; fi
  if git --git-dir="$gitdir" cat-file blob "$oid" 2>/dev/null | grep -Eaq -- '(/Users/|nix-darwin|darwinConfigurations)'; then add "$path" DARWIN_IDENTITY REFERENCE machine-specific-darwin-reference; fi
done
blocked=$(awk -F $'\t' 'NR==FNR {include[$2]=($9=="include"); next} $1=="finding" && $5=="BLOCKED" && include[$2] {print $2; exit}' "$inventory" "$tmp")
[ -z "$blocked" ] || refuse "$blocked" BLOCKED_INCLUDE
{ head -n1 "$tmp"; tail -n +2 "$tmp" | LC_ALL=C sort -u; } > "${tmp}.sorted"
mv "${tmp}.sorted" "$report"
printf 'security-review\tPASS\n' >&2
