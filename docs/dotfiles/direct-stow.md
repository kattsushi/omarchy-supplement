# Direct GNU Stow preflight

The copied dispatcher and repository wrapper expose the same read-only package listing:

```bash
dotfiles/.workstation/bin/workstation-dotfiles stow packages --profile shared --platform linux
bin/workstation-dotfiles stow packages --profile arch/omarchy --platform linux
bin/workstation-dotfiles stow packages --profile macos --platform darwin
```

Check an explicit, absolute fixture target before any future apply work:

```bash
bin/workstation-dotfiles stow check --profile shared --platform linux --target /absolute/fixture-target
```

The only Stow invocation made by `check` is, from the dotfiles source root:

```text
stow --simulate --verbose=2 --no-folding --target TARGET PACKAGE...
```

It verifies the fixed source/control fingerprint, exact profile ownership, source leaves, target conflicts, and an exact simulation. It does not mutate source or target; Stow prose is suppressed and only stable status output is evidence. `--no-folding` keeps ownership checks leaf-exact. Apply, de-stow, adoption, and deletion are explicitly pending the next PR.

Raw GNU Stow remains independently possible, but only this CLI check produces preflight evidence. GNU Stow 2.4.1 behavior is verified on Linux; macOS is unverified.
