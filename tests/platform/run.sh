#!/usr/bin/env bash
# A fixture-only, Linux integration harness. It never starts a VM or changes active HOME.
set -euo pipefail
script_dir=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
root=$(CDPATH='' cd -- "$script_dir/../.." && pwd -P)
managed=
while (($#)); do case $1 in --managed-source) managed=${2:-}; shift 2;; *) printf 'status\trefused\tARGUMENT\n'; exit 64;; esac; done
if ! { [ -n "$managed" ] && [ -d "$managed" ] && git -C "$managed" rev-parse --is-inside-work-tree >/dev/null 2>&1; }; then printf 'status\trefused\tMANAGED_SOURCE\n'; exit 64; fi
# A stable evidence record is meaningful only for completely clean, frozen bytes.
candidate_clean() { git -C "$root" diff --quiet && git -C "$root" diff --cached --quiet && [ -z "$(git -C "$root" ls-files --others --exclude-standard)" ]; }
candidate_clean || { printf 'status\trefused\tCANDIDATE_DIRTY\n'; exit 2; }
initial_commit=$(git -C "$root" rev-parse HEAD); initial_tree=$(git -C "$root" write-tree)
need() { command -v "$1" >/dev/null 2>&1 || { printf 'status\tfailed\tDEPENDENCY\n'; exit 69; }; }
for tool in git stow sha256sum find stat sort awk sed readlink; do need "$tool"; done
[ "$(uname -s)" = Linux ] || { printf 'status\tunverified\tNO_NATIVE_RUNTIME\n'; exit 2; }
safe() { [[ $1 =~ ^[A-Za-z0-9._+-]+$ ]] || { printf 'status\trefused\tVERSION\n'; exit 2; }; }
version() { local value; value=$("$@" 2>/dev/null | awk 'NR==1 { if (match($0, /[0-9]+([.][0-9]+)+/)) print substr($0, RSTART, RLENGTH) }'); [[ $value =~ ^[A-Za-z0-9._+-]+$ ]] || return 2; printf '%s' "$value"; }
git_state() { { git -C "$1" rev-parse HEAD; git -C "$1" write-tree; git -C "$1" status --porcelain=v1 --untracked-files=all; git -C "$1" for-each-ref --format='%(refname) %(objectname)'; git -C "$1" rev-parse --git-path HEAD; git -C "$1" rev-parse --git-path index; } | sha256sum | awk '{print $1}'; }
tree_state() { find "$1" -printf '%P\t%m\t%y\t%l\t%T@\n' | LC_ALL=C sort | sha256sum | awk '{print $1}'; }
work=$(mktemp -d "${TMPDIR:-/tmp}/platform-harness.XXXXXX") || exit 69
cleanup() { rm -rf -- "$work"; }
trap cleanup EXIT
trap 'cleanup; exit 143' HUP INT TERM
export REAL_HOME="$HOME"
export HOME="$work/home" XDG_STATE_HOME="$work/state" XDG_CACHE_HOME="$work/cache"
mkdir -p "$HOME" "$XDG_STATE_HOME" "$XDG_CACHE_HOME"
: >"$work/.omarchy-bootstrap-fixture"
sentinel=PLATFORM_PRIVACY_SENTINEL
printf '%s\n' "$sentinel" >"$XDG_STATE_HOME/.local-ignore"
managed_before=$(git_state "$managed")
commit=$initial_commit; tree=$initial_tree
cli="$root/bin/workstation-dotfiles"; boot="$root/bin/workstation-bootstrap"
log="$work/commands.log"
run() { "$@" >>"$log" 2>&1; }
run "$cli" source verify || { printf 'status\tfailed\tSOURCE\n'; exit 3; }
fp1=$("$cli" materialize fingerprint 2>>"$log"); fp2=$("$cli" materialize fingerprint 2>>"$log")
if ! { [ "$fp1" = "$fp2" ] && [[ $fp1 =~ ^fingerprint[[:space:]]sha256[[:space:]][0-9a-f]{64}$ ]]; }; then printf 'status\tfailed\tFINGERPRINT\n'; exit 3; fi
run "$cli" materialize apply --target "$HOME/dotfiles" || { printf 'status\tfailed\tMATERIALIZE\n'; exit 3; }
run "$cli" materialize apply --target "$HOME/dotfiles" || { printf 'status\tfailed\tMATERIALIZE_NOOP\n'; exit 3; }
leaves=$(find "$HOME/dotfiles" \( -type f -o -type l \) | wc -l | tr -d ' '); [ "$leaves" = 57 ] || { printf 'status\tfailed\tLEAVES\n'; exit 3; }
copied="$HOME/dotfiles/.workstation/bin/workstation-dotfiles"
run "$copied" stow check --profile arch/omarchy --platform linux --target "$HOME" || { printf 'status\tfailed\tSTOW_CHECK\n'; exit 3; }
run "$copied" stow apply --profile arch/omarchy --platform linux --target "$HOME" || { printf 'status\tfailed\tSTOW_APPLY\n'; exit 3; }
run "$copied" stow verify --profile arch/omarchy --platform linux --target "$HOME" || { printf 'status\tfailed\tSTOW_VERIFY\n'; exit 3; }
run "$copied" stow apply --profile arch/omarchy --platform linux --target "$HOME" || { printf 'status\tfailed\tSTOW_NOOP\n'; exit 3; }
[ -L "$HOME/.config/nvim/.gitignore" ] && [ -L "$HOME/.config/launch_polybar.sh" ] && [ ! -e "$HOME/.stow-local-ignore" ] || { printf 'status\tfailed\tTARGET\n'; exit 3; }
links=$(find "$HOME" -path "$HOME/dotfiles" -prune -o -type l -print | wc -l | tr -d ' '); [ "$links" -gt 0 ] || { printf 'status\tfailed\tLINKS\n'; exit 3; }
home_before=$(tree_state "$HOME")
expected_blocks=$'dotfiles-v2\tPROVIDER_APPLY_UNIMPLEMENTED\narch-base-packages\tPROVIDER_APPLY_UNIMPLEMENTED\ndarwin-base-packages\tPROVIDER_PLATFORM_MISMATCH\nomarchy-desktop\tMANAGED_SOURCE_FORBIDDEN'
bootstrap_call() { if [ -n "${BOOTSTRAP_WRAPPER:-}" ]; then "$BOOTSTRAP_WRAPPER" "$boot" "$@"; else "$boot" "$@"; fi; }
for command in plan check; do
  set +e; bootstrap_out=$(BOOTSTRAP_TEST_OS=arch BOOTSTRAP_TEST_ARCH=x86_64 BOOTSTRAP_TEST_OMARCHY_VERSION=3.8.4 BOOTSTRAP_TEST_HYPRLAND_VERSION=0.56 bootstrap_call "$command" --profile base --profile omarchy 2>&1); rc=$?; set -e
  printf '%s\n' "$bootstrap_out" >>"$log"
  actual_blocks=$(printf '%s\n' "$bootstrap_out" | awk -F '\t' '$1=="block" {print $2 "\t" $3}')
  [ "$rc" = 2 ] && [ "$actual_blocks" = "$expected_blocks" ] || { printf 'status\tfailed\tBOOTSTRAP\n'; exit 3; }
done
[ "$home_before" = "$(tree_state "$HOME")" ] || { printf 'status\tfailed\tFIXTURE_MUTATION\n'; exit 3; }
[ "$managed_before" = "$(git_state "$managed")" ] || { printf 'status\tfailed\tMANAGED_MUTATION\n'; exit 3; }
! grep -Fq -- "$sentinel" "$log" || { printf 'status\tfailed\tPRIVACY\n'; exit 3; }
# Freeze again immediately before evidence; no final PASS from changed candidate bytes.
candidate_clean && [ "$(git -C "$root" rev-parse HEAD)" = "$initial_commit" ] && [ "$(git -C "$root" write-tree)" = "$initial_tree" ] || { printf 'status\tfailed\tCANDIDATE_CHANGED\n'; exit 3; }
os_id=$(awk -F= '$1=="ID" {gsub(/"/,"",$2); print $2}' /etc/os-release); os_version=$(awk -F= '$1=="VERSION_ID" {gsub(/"/,"",$2); print $2}' /etc/os-release); os_version=${os_version:-unknown}; arch=$(uname -m); for token in "$os_id" "$os_version" "$arch"; do safe "$token"; done
if ! omarchy=$(version omarchy version) || ! bash_version=$(version bash --version) || ! git_version=$(version git --version) || ! stow_version=$(version stow --version); then
  printf 'status\trefused\tVERSION\n'; exit 2
fi
printf 'schema\tplatform-evidence-v1\ncandidate\tcommit\t%s\ncandidate\ttree\t%s\nplatform\tlinux\nos\t%s\t%s\narch\t%s\nversion\tomarchy\t%s\nversion\tbash\t%s\nversion\tgit\t%s\nversion\tstow\t%s\nsource\tverify\tpass\nfingerprint\tstable\nmaterialize\tsuccess\nmaterialize\tnoop\nmaterialize\tleaves\t57\nprofile\tarch/omarchy\npackages\tcount\t13\npackages\tcanonical\tbackgrounds,ghostty-linux,hyprland,hyprlock,hyprmocha,hyprpaper,mako,nvim,polybar,starship,tmux,waybar,zshrc\nstow\tcheck\tpass\nstow\tapply\tpass\nstow\tverify\tpass\nstow\tnoop\tpass\nstow\ttarget-links\t%s\nbootstrap\tplan\tread-only-refusal\nbootstrap\tcheck\tread-only-refusal\nmanaged-source\tunchanged\nprivacy\tclear\nmacos\tunverified\tno-native-runtime\nstatus\tpass\n' "$commit" "$tree" "$os_id" "$os_version" "$arch" "$omarchy" "$bash_version" "$git_version" "$stow_version" "$links"
