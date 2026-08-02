# Snapshot provenance

- Source: `https://github.com/kattsushi/dotfiles-v2`, pinned at `6e36129058e5b0550ef5345e192557e785befbf5`.
- Destination base/parent: `8c91d216393c7557451880f74a3942633504d825`.
- Method: reproducible Git-object snapshot. Import date: 2026-08-01.
- Materialized non-media scope: 41 approved paths, 64,784 bytes, and 2,386 text lines. Two regular files retain mode `100755`; one relative symlink retains its literal payload.
- Materialized media scope: seven approved `backgrounds/**` paths, 26,445,770 bytes, all regular files with mode `100644`.
- Combined imported scope: 48 paths and 26,510,554 bytes. The non-media path, byte, and line totals above remain their own unchanged facts.
- Excluded scope: 10 inventory paths.
- Security evidence: 24 findings; zero `PRIVATE_KEY` and zero `LITERAL_SECRET` findings. The media rows retain the inventory's `media-separate` reason and `reviewed-reference` security classification.

The snapshot deliberately preserves bytes and modes without importing source history. The tradeoff is a small, reviewable destination snapshot rather than source commit ancestry. Exact snapshot bytes remain unchanged: 11 upstream `blank-at-eol` occurrences are preserved in `dotfiles/hyprland/.config/hypr/hypridle.conf`, `dotfiles/hyprland/.config/hypr/hyprland.conf`, and `dotfiles/hyprlock/.config/hypr/hyprlock.conf`. Root `.gitattributes` disables only that diagnostic for those three paths; all other whitespace checks remain active. Reproduce with symbolic placeholders only:

```text
import-snapshot.sh apply --git-dir <pinned-git-dir> --revision <pinned-revision> --inventory <inventory> --security-report <security-report> --destination <destination-dotfiles>
```

The pinned Polybar launcher is preserved byte-for-byte without a shebang. Its contents are linted with an explicit POSIX `sh` dialect; direct execution readiness is not claimed here and must be resolved and verified by the later Stow/runtime work unit.

## Separate passive media import

On 2026-08-01, the seven media objects were imported separately from source pin `6e36129058e5b0550ef5345e192557e785befbf5` by reading only pinned Git blobs into a private staging directory, verifying their path, SHA-256, size, and mode, then renaming the verified directory into `dotfiles/backgrounds`. No source working-tree bytes, image decoding, execution, LFS tooling, or image transformations were used.

| Path | Bytes | SHA-256 | Mode |
|---|---:|---|---|
| `backgrounds/.config/backgrounds/arch-rainbow.png` | 25,143 | `624e310533c3fcb65a981f5a917e9bc1d7fc14c55e0b9fed09ea1f4f9249217f` | `100644` |
| `backgrounds/.config/backgrounds/better_shaded_landscape.jpg` | 884,964 | `ef20c68a3b92de301159be52b41c92b71a263174161011fa290ed412eead3e49` | `100644` |
| `backgrounds/.config/backgrounds/car-with-full-moon-background.jpg` | 8,920,055 | `96967a211d4bd3577582b4256b9388aa71f1254133f960a18aff4066f58a2e3c` | `100644` |
| `backgrounds/.config/backgrounds/lofiwallpaper.png` | 2,232,137 | `51d4c6a5f5eb7e5a0adfa816736b9aee3bd8b827a287608005f9451a12fa50cc` | `100644` |
| `backgrounds/.config/backgrounds/nice-blue-background.png` | 7,704,488 | `3e80e56b83d441bdf6520c3b07ac794765ad4db48fe2ac9b9014bfef072eb051` | `100644` |
| `backgrounds/.config/backgrounds/shaded.png` | 2,548,204 | `556969991638b4240c2d78526d37636c6d1affbfbe222c0d9e8eac62efba46a5` | `100644` |
| `backgrounds/.config/backgrounds/shaded_landscape.png` | 4,130,779 | `1199a43751f1234d3fb92ecf614fbf34de2c07334d3fdd355891044f51bddada` | `100644` |

The security report remains the governing review evidence for the source inventory; this separate passive import does not change its 24 findings or its zero `PRIVATE_KEY` and `LITERAL_SECRET` result. Each imported object is below GitHub's 100 MB file limit and is classified by magic as PNG or JPEG rather than an LFS pointer. Rollback is a normal revert of the seven media paths and this documentation boundary only. Repository rename, remotes, runtime materialization, Stow, VM validation, and macOS remain pending.
