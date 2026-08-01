# Workstation consolidation v1 decisions

## Delivery boundary

This is the non-mutating inventory packet for Work Unit 1A. It creates no import,
staging, commit, push, PR, or home mutation.

## Decision records

```text
import_method=pending
backgrounds=include-separately
import_authorization=pending
size_exception=pending
```

| Topic | Current state | Boundary |
|---|---|---|
| Import method | Pending maintainer approval | Snapshot is the proposed bounded method; no import is authorized. |
| Backgrounds | Included separately | All seven images stay media-only and require their own later boundary. |
| Delivery | Feature-branch-chain | Tracker `feat/workstation-blueprint`; this slice `feat/consolidation-inventory`. |
| Repository | Unchanged | Rename, remote changes, archive, and cutover remain deferred. |

## Pinned evidence

- Source: `kattsushi/dotfiles-v2@6e36129058e5b0550ef5345e192557e785befbf5`.
- Destination base: `omarchy-supplement@40b5ac96034cd2afb6f292d62060638b448204f5`.
- Legacy reference: `kattsushi/dotfiles@5a8ec5b2ace3699e3efda3ddd696a1e863da63dd`.
- Seven background objects total 26,445,770 bytes and remain separately reviewed.

## Security review (WU1B)

`security-review.tsv` records 24 deterministic, value-free findings from the pinned tree:
credential/MCP contract, forbidden local state, Darwin identity, secret reference,
executable, and symlink rule families. No probable literal secret or private-key marker
was found. Import remains unauthorized until this PR lands and the import size decision
is recorded.

## Deferred gates

Import authorization and its measured size exception remain pending. Production import,
media import, installers, and all advanced scope are deferred.
