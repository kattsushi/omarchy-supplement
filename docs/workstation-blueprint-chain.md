# Workstation Blueprint PR Chain

Issue: [#5](https://github.com/kattsushi/omarchy-supplement/issues/5)

This draft tracker keeps the workstation consolidation out of `main` until the complete feature is verified. Child pull requests target the tracker or the immediately preceding child branch so each review remains focused.

## Dependency chain

```text
main
└── feat/workstation-blueprint (draft tracker)
    ├── feat/consolidation-inventory
    ├── security and package classification
    ├── pinned non-media snapshot import
    ├── passive background media import
    ├── safe ~/dotfiles materialization
    ├── independent GNU Stow workflow
    └── fixture, Omarchy VM, and documentation verification
```

## Merge policy

- Do not merge this tracker into `main` until every child unit is complete.
- Keep each executable child PR within 400 changed lines.
- Review passive media separately from executable behavior.
- Preserve macOS as explicitly unverified until native evidence is available.
- Repository rename and remote migration remain out of scope.
