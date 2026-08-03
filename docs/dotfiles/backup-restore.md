# Restore an untouched migration backup

Use this only for the exact symbolic backup token emitted by a successful materialization. There is no automatic restore, crash journal, resume operation, unknown-backup selection, or support for backups changed after the swap.

Before any move, inspect the current target and the token-selected sibling backup. Verify that the backup is still the approved `expected-clean` checkout and verify its Git HEAD, branch, upstream, refs, clean status, index, configuration, tree, and modes. If any value is ambiguous or any check fails, stop and preserve every path.

The manual procedure is deliberately shown as placeholders, not active commands:

```text
<inspect current TARGET>
<inspect sibling backup identified by emitted TOKEN>
<verify backup is untouched expected-clean with Git evidence>
<reserve a new unique private sibling CURRENT-ASIDE>
<mv -T CURRENT-TARGET CURRENT-ASIDE>
<mv -T VERIFIED-BACKUP CURRENT-TARGET>
<run expected-clean inspect against CURRENT-TARGET>
<verify Git HEAD, branch, upstream, refs, clean status, index, configuration, tree, and modes>
```

Reserve `CURRENT-ASIDE` uniquely before moving anything; do not overwrite or reuse an existing sibling. Never choose a backup by prefix, timestamp, or guess. If either rename or verification fails, stop immediately and preserve the target, backup, aside path, and all recovery evidence.

v1 is not a recovery engine. During an automatic swap, an inverse rename can return success but fail identity proof. In that boundary the command reports `MANUAL_RESTORE` with `recovery target-stage-lock`; it performs no further rename, deletion, or copy. The current target may contain the moved prior root, the verified stage and lock are retained, and no backup sibling is promised.
