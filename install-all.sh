#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
printf '%s\n' 'LEGACY_REDIRECTED_READ_ONLY: inspect bootstrap plan; installers are not run.' >&2
exec "$ROOT/bin/workstation-bootstrap" plan --profile base --profile omarchy
