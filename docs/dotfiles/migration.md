# Dotfile materialization

Materialize the approved dotfile tree only into an **absent** absolute target:

```bash
bin/workstation-dotfiles materialize apply --target /absolute/path/to/dotfiles
```

A successful first run reports `status success materialized`. Repeating the exact command against the complete installed tree reports `status noop unchanged`; it does not create a lock or staging sibling.

This PR deliberately does not migrate an existing checkout. A classifier-approved `expected-clean` target is refused with `EXPECTED_CLEAN_PENDING`; the next chained PR will add the backup/swap migration. Other existing, unsafe, or unsupported target states are preserved without modification. Do not delete or move anything to force this command.

Materialization makes no external clone or network request. Its evidence is currently Linux-specific: it verifies physical parent/device conditions and available space before installation. macOS materialization is unverified and refused. If installation verification fails after the atomic rename, the installed target is preserved and requires manual inspection; this command does not roll it back.
