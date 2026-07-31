#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
printf '%s\n' 'LEGACY_REDIRECTED_READ_ONLY: dotfile deployment remains blocked; running checks only.' >&2
"$ROOT/bin/workstation-bootstrap" check --profile base
exit 2
