# Dotfile materialization

Materialize the approved dotfile tree only into an **absent** absolute target:

```bash
bin/workstation-dotfiles materialize apply --target /absolute/path/to/dotfiles
```

A successful first run reports `status success materialized`. Repeating the exact command against the complete installed tree reports `status noop unchanged`; it does not create a lock or staging sibling.

An existing checkout advances only when the classifier proves it is the approved `expected-clean` checkout. The command makes a unique private sibling backup, verifies that untouched backup, and swaps the verified staged tree into the target. Success emits a symbolic `backup` token rather than a path. Repeating against the installed exact tree is a pre-lock no-op and creates no backup.

Every other present state is refused unchanged. Materialization makes no network request. The swap evidence is verified on GNU/Linux; macOS remains unverified and is refused. If post-install verification fails, the installed target and verified backup are preserved for manual inspection; there is no automatic rollback.
