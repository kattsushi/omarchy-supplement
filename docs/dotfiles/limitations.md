# Direct Stow limitations

A nonzero Stow apply, or a zero exit followed by failed verification, stops immediately and reports only the selected packages and stable guidance. Partial, wrong, or expected targets require user inspection. Resolve conflicts and rerun `stow check` before trying again.

Any unlink or de-stow is an explicit manual choice. This wrapper never runs `stow -D`, performs automatic rollback, resumable cleanup, arbitrary-edit recovery, unlinking, or retries. Linux fixture evidence does not establish a cross-platform or native macOS claim.
