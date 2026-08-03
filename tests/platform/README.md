# Platform verification harness

Run from a clean Git candidate on Linux:

```bash
tests/platform/run.sh --managed-source /path/to/managed-source
```

`--managed-source` is required and must name a Git worktree. The harness snapshots it
before and after and never mutates it. It rejects tracked, staged, or untracked
candidate changes both before work and immediately before evidence, and rechecks the
original commit/tree, so a passing record always identifies committed bytes.

The harness creates one trap-owned temporary fixture and mutates only its fixture
`HOME`, state, and cache. It materializes the source, runs copied-source Stow checks,
and accepts bootstrap plan/check only when the canonical ordered provider/read-only
blocker set matches. It never installs
packages, uses a network, touches active HOME, starts a desktop, reloads services, or
starts/modifies a VM.

Output is deterministic `platform-evidence-v1` tab-separated evidence: candidate
identity, safe platform/version tokens, source/fingerprint/materialize/Stow/bootstrap
results, nonmutation and privacy outcomes. Linux is the current native runtime;
macOS is explicitly recorded as unverified/no-native-runtime.

A future VM invocation must still pass an explicit managed source:

```bash
vm-run tests/platform/run.sh --managed-source /path/to/managed-source
```

VM transport and evidence collection are intentionally separate from this harness.
