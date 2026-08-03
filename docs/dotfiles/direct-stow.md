# Direct GNU Stow

The copied dispatcher and repository wrapper expose package selection, preflight, apply, and independent link verification. Every mutating or verification command requires an explicit absolute target and platform; none uses the active home directory.

```bash
dotfiles/.workstation/bin/workstation-dotfiles stow packages --profile shared --platform linux
bin/workstation-dotfiles stow check --profile shared --platform linux --target /absolute/fixture-target
bin/workstation-dotfiles stow apply --profile arch/omarchy --platform linux --target /absolute/fixture-target
bin/workstation-dotfiles stow verify --profile macos --platform darwin --target /absolute/fixture-target
```

`apply` first performs exact independent verification. Complete links return `status\tnoop\tunchanged` without invoking Stow. Otherwise it repeats source, ownership, conflict, and simulation preflight, then invokes GNU Stow exactly once from the source root:

```text
stow --no-folding --target TARGET PACKAGE...
```

`check` is read-only and uses `stow --simulate --verbose=2 --no-folding --target TARGET PACKAGE...`. Raw direct GNU Stow remains independently available, but only the wrapper produces this evidence. Linux fixtures cover GNU Stow 2.4.1; the macOS package selection is structural only and native macOS remains unverified.
