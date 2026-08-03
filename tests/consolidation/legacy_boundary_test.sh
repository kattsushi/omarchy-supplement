#!/usr/bin/env bash
set -euo pipefail
root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd)
fail() { printf 'FAIL: %s\n' "$1" >&2; exit 1; }
canonical=$root/bin/workstation-dotfiles
boundary_doc=$root/docs/dotfiles/direct-stow.md
bootstrap_doc=$root/docs/bootstrap-lifecycle.md
snapshot_base=f532a8aaf9fe3da2a0e2404377238803292737ee

[ -x "$canonical" ] || fail canonical-command-missing
[ "$("$canonical" source verify)" = $'source\tVERIFY\tPASS' ] || fail canonical-embedded-source-verification
grep -Fqx 'bin/workstation-dotfiles stow check --profile shared --platform linux --target /absolute/fixture-target' "$boundary_doc" || fail canonical-command-undocumented
! grep -Fq 'dotfiles/.workstation/bin/workstation-dotfiles stow' "$boundary_doc" || fail embedded-command-recommended
grep -Fq 'imported legacy compatibility/reference behavior.' "$boundary_doc" || fail legacy-boundary-undocumented
    grep -Fq 'dotfiles/README.md' "$boundary_doc" || fail legacy-readme-path-undocumented
    grep -Fq 'dotfiles/install/stow.sh' "$boundary_doc" || fail legacy-stow-path-undocumented
grep -Fq "materialized target is \`\${HOME}/dotfiles\`, not an external source checkout." "$bootstrap_doc" || fail materialized-target-undocumented
grep -Fq 'Embedded source verification is read-only' "$bootstrap_doc" || fail embedded-verification-undocumented
grep -Fq 'never clones, fetches, checks out' "$bootstrap_doc" || fail external-source-behavior-undocumented
git -C "$root" diff --quiet "$snapshot_base" -- dotfiles || fail imported-snapshot-changed
printf 'legacy boundary tests: PASS\n'
