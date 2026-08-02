# Snapshot provenance

- Source: `https://github.com/kattsushi/dotfiles-v2`, pinned at `6e36129058e5b0550ef5345e192557e785befbf5`.
- Destination base/parent: `8c91d216393c7557451880f74a3942633504d825`.
- Method: reproducible Git-object snapshot. Import date: 2026-08-01.
- Materialized scope: 41 approved non-media paths, 64,784 bytes, and 2,386 text lines. Two regular files retain mode `100755`; one relative symlink retains its literal payload.
- Excluded scope: 10 inventory paths. Deferred media: seven `backgrounds/**` paths.
- Security evidence: 24 findings; zero `PRIVATE_KEY` and zero `LITERAL_SECRET` findings.

The snapshot deliberately preserves bytes and modes without importing source history. The tradeoff is a small, reviewable destination snapshot rather than source commit ancestry. Exact snapshot bytes remain unchanged: 11 upstream `blank-at-eol` occurrences are preserved in `dotfiles/hyprland/.config/hypr/hypridle.conf`, `dotfiles/hyprland/.config/hypr/hyprland.conf`, and `dotfiles/hyprlock/.config/hypr/hyprlock.conf`. Root `.gitattributes` disables only that diagnostic for those three paths; all other whitespace checks remain active. Reproduce with symbolic placeholders only:

```text
import-snapshot.sh apply --git-dir <pinned-git-dir> --revision <pinned-revision> --inventory <inventory> --security-report <security-report> --destination <destination-dotfiles>
```

The pinned Polybar launcher is preserved byte-for-byte without a shebang. Its contents are linted with an explicit POSIX `sh` dialect; direct execution readiness is not claimed here and must be resolved and verified by the later Stow/runtime work unit.

Rollback is a normal revert of this work unit. This record makes no claim about repository rename, remotes, media import, runtime materialization, Stow, or macOS.
