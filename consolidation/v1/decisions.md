# Workstation consolidation v1 decisions

## Delivery boundary

This is the non-mutating inventory packet for Work Unit 1A. It creates no import,
staging, commit, push, PR, or home mutation.

## Decision records

```text
import_method=snapshot
backgrounds=imported-separately-verified
import_authorization=approved-non-media-plus-passive-media
size_exception=approved-41-path-snapshot-plus-7-media-paths
```

| Topic | Current state | Boundary |
|---|---|---|
| Import method | Approved snapshot with separate passive media unit | The 41 approved non-media paths remain imported and verified; seven approved background objects are separately imported and verified. Runtime materialization remains pending. |
| Backgrounds | Imported and verified separately | All seven images were materialized byte-for-byte from pinned Git objects as a passive media-only unit; Stow and runtime use remain pending. |
| Delivery | Feature-branch-chain | Tracker `feat/workstation-blueprint`; this passive media child unit `feat/consolidation-media`. |
| Repository | Unchanged | Rename, remote changes, archive, and cutover remain deferred. |

## Pinned evidence

- Source: `kattsushi/dotfiles-v2@6e36129058e5b0550ef5345e192557e785befbf5`.
- Destination base: `omarchy-supplement@40b5ac96034cd2afb6f292d62060638b448204f5`.
- Legacy reference: `kattsushi/dotfiles@5a8ec5b2ace3699e3efda3ddd696a1e863da63dd`.
- Seven background objects total 26,445,770 bytes and are imported and verified as a separate passive unit.

## Security review (WU1B)

`security-review.tsv` records 24 deterministic, value-free findings from the pinned tree:
credential/MCP contract, forbidden local state, Darwin identity, secret reference,
executable, and symlink rule families. No probable literal secret or private-key marker
was found. Import remains unauthorized until this PR lands and the import size decision
is recorded.

## Deferred gates

Runtime materialization (applying repository bytes to a home), Stow, VM validation, macOS validation, and repository rename remain pending. Installers,
remote changes, and all advanced scope are deferred; overall consolidation is not complete.
