# Bootstrap lifecycle (Work unit A)

`bin/workstation-bootstrap plan --profile base [--profile omarchy]` and `check` are
read-only. They emit BRF-v1 records with expanded profiles, stable ordered actions,
and explicit blockers. `base@1` supports Arch and Darwin; `omarchy@1` is Arch-only
and implies base. All package, download, shell, desktop, and dotfiles actions remain
visible but blocked: no apply, provider execution, Stow, download, installer, desktop,
or Omarchy-managed-source operation exists in this work unit.

The dotfiles contract remains `${HOME}/dotfiles` for `kattsushi/dotfiles-v2`; checks
only inspect its Git metadata. They never clone, fetch, checkout, adopt, delete, move,
or Stow. Existing targets, including exact-content matches, are not adopted. Paths
under `.local/share/omarchy` are explicitly forbidden.

`legacy.tsv` inventories legacy scripts as unsupported, blocked, or retired. The new
CLI never dispatches them. Work unit B will separately design approval, apply, verify,
receipts, and compatibility wrappers. Fixture validation uses a marked temporary HOME
and local Git only; desktop/runtime validation is N/A because no desktop action runs.
