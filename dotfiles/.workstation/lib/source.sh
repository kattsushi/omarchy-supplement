#!/usr/bin/env bash
set -euo pipefail

manifest_valid() {
  local manifest=$1 header rows record path type mode size value package class disposition security state expected_package
  IFS= read -r header < "$manifest" 2>/dev/null || refuse DATA
  [ "$header" = $'schema\tinventory-v1' ] || refuse DATA
  rows=$(awk 'END { print NR - 1 }' "$manifest" 2>/dev/null) || refuse DATA
  [ "$rows" = 48 ] || refuse DATA
  awk -F '\t' 'NR > 1 && NF != 11 { exit 1 }' "$manifest" >/dev/null 2>&1 || refuse DATA
  sorted_unique <(awk -F '\t' 'NR > 1 { print $2 }' "$manifest" 2>/dev/null) || refuse DATA
  while IFS=$'\t' read -r record path type mode size value package class disposition security state; do
    [ "$record" = file ] || refuse DATA
    case $path in ''|.*|*/../*|*/./*|*'//'*) refuse DATA ;; esac
    case $type in
      file) [ "$mode" = 100644 ] && [[ $value =~ ^sha256:[0-9a-f]{64}$ ]] ;;
      executable) [ "$mode" = 100755 ] && [[ $value =~ ^sha256:[0-9a-f]{64}$ ]] ;;
      symlink) [ "$mode" = 120000 ] && [[ $value != *$'\t'* && $value != *$'\n'* && $value != /* ]] ;;
      *) false ;;
    esac || refuse DATA
    [[ $size =~ ^[0-9]+$ ]] || refuse DATA
    case $class in shared|arch/omarchy|macos) ;; *) refuse DATA ;; esac
    [ "$disposition" = include ] || refuse DATA
    case $security in approved|media-separate) ;; *) refuse DATA ;; esac
    case $state in clear|reviewed-reference) ;; *) refuse DATA ;; esac
    expected_package=${path%%/*}; [ "$package" = "$expected_package" ] || refuse DATA
  done < <(tail -n +2 "$manifest" 2>/dev/null)
}

controls_valid() {
  local controls=$1 expected
  expected=$'schema\tcontrol-files-v1\nfile\t.workstation/bin/workstation-dotfiles\nfile\t.workstation/control-files.tsv\nfile\t.workstation/lib/common.sh\nfile\t.workstation/lib/materialize.sh\nfile\t.workstation/lib/source.sh\nfile\t.workstation/lib/stow.sh\nfile\t.workstation/profiles.tsv\nfile\t.workstation/source-files.tsv'
  printf '%s\n' "$expected" | cmp -s "$controls" - 2>/dev/null || refuse CONTROL
}

profiles_valid() {
  local profiles=$1 root=$2 expected package
  expected=$'schema\tprofiles-v1\nshared\tany\tnvim,starship,tmux,zshrc\narch/omarchy\tlinux\tbackgrounds,ghostty-linux,hyprland,hyprlock,hyprmocha,hyprpaper,mako,nvim,polybar,starship,tmux,waybar,zshrc\nmacos\tdarwin\tghostty-darwin,nvim,starship,tmux,zshrc'
  printf '%s\n' "$expected" | cmp -s "$profiles" - 2>/dev/null || refuse PROFILE
  while IFS= read -r package; do
    [ -d "$root/$package" ] && [ ! -e "$root/$package/.git" ] || refuse PACKAGE
  done < <(printf '%s\n' backgrounds ghostty-darwin ghostty-linux hyprland hyprlock hyprmocha hyprpaper mako nvim polybar starship tmux waybar zshrc)
}

safe_link() {
  local payload=$1 parent=$2 component depth=0
  [[ $payload != /* && $payload != *$'\t'* && $payload != *$'\n'* ]] || return 1
  IFS=/ read -r -a components <<< "$parent/$payload"
  for component in "${components[@]}"; do
    case $component in ''|.) ;; ..) [ "$depth" -gt 0 ] || return 1; depth=$((depth - 1)) ;; *) depth=$((depth + 1)) ;; esac
  done
}

verify_source() {
  local root=$1 manifest controls profiles work path type mode size value actual_size actual_hash
  manifest=$root/.workstation/source-files.tsv
  controls=$root/.workstation/control-files.tsv
  profiles=$root/.workstation/profiles.tsv
  work=$(mktemp -d "${TMPDIR:-/tmp}/workstation-source.XXXXXX" 2>/dev/null) || refuse SOURCE
  trap 'rm -rf -- "$work"' RETURN
  manifest_valid "$manifest"; controls_valid "$controls"; profiles_valid "$profiles" "$root"
  find "$root" -mindepth 1 -name .git -type d -print -quit 2>/dev/null | grep -q . && refuse NESTED_GIT
  find "$root" -mindepth 1 ! -type f ! -type l ! -type d -print > "$work/special" 2>/dev/null || refuse SOURCE_SET
  [ ! -s "$work/special" ] || refuse SOURCE_SET
  { awk -F '\t' 'NR > 1 { print $2 }' "$manifest" 2>/dev/null; tail -n +2 "$controls" 2>/dev/null | cut -f2; } | LC_ALL=C sort > "$work/expected" 2>/dev/null || refuse SOURCE_SET
  (cd "$root" && find . -mindepth 1 \( -type f -o -type l \) -print | sed 's#^./##' | LC_ALL=C sort) > "$work/actual" 2>/dev/null || refuse SOURCE_SET
  comm -3 "$work/expected" "$work/actual" > "$work/leaves" 2>/dev/null || refuse SOURCE_SET
  [ ! -s "$work/leaves" ] || refuse SOURCE_SET
  awk -F/ '{ p = ""; for (i = 1; i < NF; i++) { p = p ? p "/" $i : $i; print p } }' "$work/expected" | LC_ALL=C sort -u > "$work/expected-dirs" 2>/dev/null || refuse SOURCE_SET
  (cd "$root" && find . -mindepth 1 -type d -print | sed 's#^./##' | LC_ALL=C sort) > "$work/actual-dirs" 2>/dev/null || refuse SOURCE_SET
  comm -3 "$work/expected-dirs" "$work/actual-dirs" > "$work/dirs" 2>/dev/null || refuse SOURCE_SET
  [ ! -s "$work/dirs" ] || refuse SOURCE_SET
  while IFS=$'\t' read -r _ path type mode size value _; do
    [ -e "$root/$path" ] || [ -L "$root/$path" ] || refuse SOURCE
    case $type in
      symlink)
        [ -L "$root/$path" ] || refuse TYPE
        [ "$(readlink "$root/$path" 2>/dev/null)" = "$value" ] || refuse LINK
        safe_link "$value" "${path%/*}" || refuse LINK
        actual_size=$(LC_ALL=C printf '%s' "$value" | wc -c 2>/dev/null) || refuse SOURCE
        [ "$actual_size" = "$size" ] || refuse SIZE
        ;;
      file|executable)
        [ -f "$root/$path" ] && [ ! -L "$root/$path" ] || refuse TYPE
        [ "$(stat -c %a "$root/$path" 2>/dev/null)" = "${mode#100}" ] || refuse MODE
        actual_size=$(stat -c %s "$root/$path" 2>/dev/null) || refuse SOURCE
        [ "$actual_size" = "$size" ] || refuse SIZE
        actual_hash=$(sha256sum "$root/$path" 2>/dev/null | awk '{print $1}') || refuse SOURCE
        [ "sha256:$actual_hash" = "$value" ] || refuse HASH
        ;;
    esac
  done < <(tail -n +2 "$manifest" 2>/dev/null)
  while IFS=$'\t' read -r _ path; do regular "$root/$path"; done < <(tail -n +2 "$controls" 2>/dev/null)
  trap - RETURN
  rm -rf -- "$work"
}
