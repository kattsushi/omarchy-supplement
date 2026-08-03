#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
cli=$root/bin/workstation-dotfiles
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
expect() { local actual expected; actual=$("$@"); expected=$(cat); [ "$actual" = "$expected" ] || fail output; }
expect_refusal() {
  local fixture=$1 expected=$2 forbidden=${3:-} output status
  set +e
  output=$("$fixture/bin/workstation-dotfiles" source verify 2>&1)
  status=$?
  set -e
  [ "$status" -ne 0 ] || fail "refusal-status-$expected"
  [ "$output" = $'refusal\t'"$expected" ] || fail "refusal-$expected"
  [[ $output != *"$fixture"* && $output != *"/tmp/"* && $output != *$'\n'* ]] || fail diagnostic-leak
  { [ -z "$forbidden" ] || [[ $output != *"$forbidden"* ]]; } || fail diagnostic-value-leak
}
expect_cli_refusal() {
  local expected=$1 forbidden=$2 output status
  shift 2
  set +e
  output=$("$@" 2>&1)
  status=$?
  set -e
  [ "$status" -ne 0 ] || fail "refusal-status-$expected"
  [ "$output" = $'refusal\t'"$expected" ] || fail "refusal-$expected"
  [[ $output != *"$root"* && $output != *"/tmp/"* && $output != *$'\n'* ]] || fail diagnostic-leak
  [[ $output != *"$forbidden"* ]] || fail diagnostic-value-leak
}
fixture() {
  local d
  d=$(mktemp -d "${TMPDIR:-/tmp}/profiles-test.XXXXXX")
  cp -R "$root/dotfiles" "$d/dotfiles"
  mkdir "$d/bin"
  cp "$root/bin/workstation-dotfiles" "$d/bin/workstation-dotfiles"
  printf '%s\n' "$d"
}
cleanup() { [ -n "${work:-}" ] && rm -rf -- "$work"; }
trap cleanup EXIT
"$cli" inventory verify | grep -qx $'inventory\tVERIFY\tPASS' || fail inventory
"$cli" source verify | grep -qx $'source\tVERIFY\tPASS' || fail source
expect "$cli" stow packages --profile shared --platform linux <<'EOF'
package	nvim
package	starship
package	tmux
package	zshrc
EOF
expect "$cli" stow packages --profile arch/omarchy --platform linux <<'EOF'
package	backgrounds
package	ghostty-linux
package	hyprland
package	hyprlock
package	hyprmocha
package	hyprpaper
package	mako
package	nvim
package	polybar
package	starship
package	tmux
package	waybar
package	zshrc
EOF
expect "$cli" stow packages --profile macos --platform darwin <<'EOF'
package	ghostty-darwin
package	nvim
package	starship
package	tmux
package	zshrc
EOF
expect_cli_refusal PLATFORM darwin "$cli" stow packages --profile arch/omarchy --platform darwin
expect_cli_refusal PROFILE unknown-selector "$cli" stow packages --profile unknown-selector --platform linux
work=$(mktemp -d "${TMPDIR:-/tmp}/profiles-work.XXXXXX")
for case_name in extra-file mcp empty-dir unsafe-link stale-size stale-class stale-package bad-inventory-header bad-control-header bad-profile-header duplicate-inventory extra-control install-profile shared-linux duplicate-profile missing-macos; do
  d=$(fixture)
  case $case_name in
    extra-file) touch "$d/dotfiles/nvim/extra"; expected=SOURCE_SET ;;
    mcp) mkdir "$d/dotfiles/mcp"; touch "$d/dotfiles/mcp/x"; expected=SOURCE_SET ;;
    empty-dir) mkdir "$d/dotfiles/empty"; expected=SOURCE_SET ;;
    unsafe-link) sed -i 's#../dotfiles/polybar/.config/launch_polybar.sh#/etc/passwd#' "$d/dotfiles/.workstation/source-files.tsv"; ln -snf /etc/passwd "$d/dotfiles/polybar/.config/launch_polybar.sh"; expected=DATA ;;
    stale-size) sed -i '2s/1502/1503/' "$d/dotfiles/.workstation/source-files.tsv"; expected=SIZE ;;
    stale-class) sed -i '2s/arch\/omarchy/not-a-class/' "$d/dotfiles/.workstation/source-files.tsv"; expected=DATA ;;
    stale-package) sed -i '2s/README.md/not-a-package/' "$d/dotfiles/.workstation/source-files.tsv"; expected=DATA ;;
    bad-inventory-header) sed -i '1cwrong' "$d/dotfiles/.workstation/source-files.tsv"; expected=DATA ;;
    bad-control-header) sed -i '1cwrong' "$d/dotfiles/.workstation/control-files.tsv"; expected=CONTROL ;;
    bad-profile-header) sed -i '1cwrong' "$d/dotfiles/.workstation/profiles.tsv"; expected=PROFILE ;;
    duplicate-inventory) sed -i '3s#^#file\tREADME.md\tfile\t100644\t1502\tsha256:49782c92cb12d63f28139ab0be8ca93a7528be1ec3ae1a6ff4e966709fabccd2\tREADME.md\tarch/omarchy\tinclude\tapproved\treviewed-reference\n#' "$d/dotfiles/.workstation/source-files.tsv"; expected=DATA ;;
    extra-control) printf 'file\t.workstation/extra\n' >> "$d/dotfiles/.workstation/control-files.tsv"; expected=CONTROL ;;
    install-profile) sed -i '2s/nvim,starship,tmux,zshrc/install,nvim,starship,tmux,zshrc/' "$d/dotfiles/.workstation/profiles.tsv"; expected=PROFILE ;;
    shared-linux) sed -i '2s/shared\tany/shared\tlinux/' "$d/dotfiles/.workstation/profiles.tsv"; expected=PROFILE ;;
    duplicate-profile) sed -i '3s/arch\/omarchy/shared/' "$d/dotfiles/.workstation/profiles.tsv"; expected=PROFILE ;;
    missing-macos) sed -i '4s/macos/other/' "$d/dotfiles/.workstation/profiles.tsv"; expected=PROFILE ;;
  esac
  expect_refusal "$d" "$expected"
  rm -rf -- "$d"
done

missing_control=$(fixture)
sed -i '/\.workstation\/lib\/source\.sh/d' "$missing_control/dotfiles/.workstation/control-files.tsv"
expect_refusal "$missing_control" CONTROL '.workstation/lib/source.sh'
rm -rf -- "$missing_control"

relative_escape=$(fixture)
sed -i '39s#../dotfiles/polybar/.config/launch_polybar.sh#../../../escape#' "$relative_escape/dotfiles/.workstation/source-files.tsv"
ln -snf ../../../escape "$relative_escape/dotfiles/polybar/.config/launch_polybar.sh"
expect_refusal "$relative_escape" LINK '../../../escape'
rm -rf -- "$relative_escape"

profile_mcp=$(fixture)
sed -i '2s/nvim/mcp,nvim/' "$profile_mcp/dotfiles/.workstation/profiles.tsv"
expect_refusal "$profile_mcp" PROFILE mcp
rm -rf -- "$profile_mcp"

profile_darwin=$(fixture)
sed -i '2s/nvim/systems\/darwin,nvim/' "$profile_darwin/dotfiles/.workstation/profiles.tsv"
expect_refusal "$profile_darwin" PROFILE systems/darwin
rm -rf -- "$profile_darwin"

embedded=$(fixture)
"$embedded/bin/workstation-dotfiles" source verify | grep -qx $'source\tVERIFY\tPASS' || fail copied-dispatcher
rm -rf -- "$embedded"
printf 'profiles tests: PASS\n'
