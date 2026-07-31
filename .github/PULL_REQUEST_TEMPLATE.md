# Pull Request

## Linked issue

Closes #<issue-number>

The linked issue must have the `status:approved` label.

## Type

Select exactly one type and add the matching `type:*` label to this pull request.

- [ ] Bug fix (`type:bug`)
- [ ] New feature (`type:feature`)
- [ ] Documentation only (`type:docs`)
- [ ] Code refactoring (`type:refactor`)
- [ ] Maintenance/tooling (`type:chore`)
- [ ] Breaking change (`type:breaking-change`)

## Summary

- Describe the outcome.

## Changes

| File | Change |
|------|--------|
| `path/to/file` | Describe the change |

## Test plan

- [ ] Ran shellcheck on modified shell scripts.
- [ ] Validated target-agent or skill loading where applicable.
- [ ] Manually tested the affected behavior.
- [ ] Updated documentation where behavior changed.

## Contributor checklist

- [ ] Linked an approved issue.
- [ ] Added exactly one `type:*` label.
- [ ] Ran shellcheck on modified shell scripts.
- [ ] Tested relevant skills in at least one target agent, when applicable.
- [ ] Updated documentation where behavior changed.
- [ ] Used a conventional commit message.
- [ ] Did not add `Co-Authored-By` trailers.
