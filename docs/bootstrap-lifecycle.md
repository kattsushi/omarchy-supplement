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
CLI never dispatches them.

## Work unit B: fixture-only apply and recovery

The lifecycle is `plan → inspect → check → explicit hash approval → apply → verify`.
`apply --plan FILE --expect-hash sha256:...` re-hashes the supplied BRF payload and
re-resolves the current plan before it creates a lock or writes a target. A changed
catalog, module, platform fact, or managed-state hash makes approval stale; generate and
inspect a new plan instead of editing the old one.

Only the marked test fixture may execute `managed-state`; production package, AUR,
Homebrew, nix-darwin, Stow, download, network, desktop, Hyprland, dotfile, and legacy
installer actions remain blocked. Fixture state is rooted beneath `XDG_STATE_HOME` (or
the documented platform default), with a user-owned non-symlink 0700 root, 0600 receipts
and backups, atomic same-directory writes, and a non-stale-auto-removing lock.

Apply receipts live in `<state>/omarchy-supplement/bootstrap/receipts`; backups and BRF
metadata live beneath `backups`. A pending or failed receipt requires inspection,
independent `verify`, correction, re-plan, and new approval—there is no blind resume.
Managed-state restore is manual and only after its recorded hashes are checked. No
external package, dotfile, repository, or desktop rollback is claimed.

`install-all.sh` is a read-only plan wrapper, `install-dotfiles.sh` performs read-only
checks then refuses deployment, and `install-mkalias.sh` / `install-discord.sh` are
explicitly retired. `bin/omarchy-work-revyse` now passes its configured workspace into
the nested wait condition; its existing user-authored layout changes are otherwise
unchanged. Fixture validation uses a marked temporary HOME and local Git only;
desktop/runtime validation is N/A because no desktop action runs.
