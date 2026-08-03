# Direct GNU Stow

Use `bin/workstation-dotfiles` for every operational command. It dispatches to the embedded `.workstation` implementation while keeping the repository entry point stable. Every mutating or verification command requires a canonical absolute target path and platform; aliases, traversal, trailing slashes, and symlink components are refused. None uses the active home directory. A copied, verified materialized source at `TARGET/dotfiles` is supported; source-equals-target, target-below-source, and every other ancestor layout are refused.

```bash
bin/workstation-dotfiles stow packages --profile shared --platform linux
bin/workstation-dotfiles stow check --profile shared --platform linux --target /absolute/fixture-target
bin/workstation-dotfiles stow apply --profile arch/omarchy --platform linux --target /absolute/fixture-target
bin/workstation-dotfiles stow verify --profile macos --platform darwin --target /absolute/fixture-target
```

## Legacy imported reference

`dotfiles/README.md` and `dotfiles/install/stow.sh` are imported legacy compatibility/reference behavior. They remain available for provenance and compatibility but are not the supported operational workflow in this repository. The imported snapshot is byte-exact, so this boundary is documented here instead of changing those files.

`apply` first performs exact independent verification. Complete links return `status\tnoop\tunchanged` without invoking Stow. Otherwise it repeats source, ownership, conflict, and simulation preflight, then invokes GNU Stow exactly once from the source root:

```text
stow --no-folding --target TARGET PACKAGE...
```

`check` is read-only and uses `stow --simulate --verbose=2 --no-folding --target TARGET PACKAGE...`. Raw direct GNU Stow remains independently available as legacy compatibility behavior, but only the canonical wrapper produces this evidence. Linux fixtures cover GNU Stow 2.4.1; the macOS package selection is structural only and native macOS remains unverified.
