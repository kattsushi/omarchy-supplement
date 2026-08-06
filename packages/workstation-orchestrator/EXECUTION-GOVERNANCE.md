# Production Execution Governance Decision Packet

## Authority Boundary

This packet grants **no execution authority**. Production package execution remains
typed-unavailable. It records the decisions, evidence, owners, and sign-offs that
must exist before a later implementation slice can even be planned.

No real `omarchy`, `brew`, network, `sudo`, package installation, configuration
application, retry, resume, or rollback may run from this packet. It contains no
approved command, package mapping, threshold, token value, or execution environment.

Task 9A.0's process-local five-minute confirmation and one-shot replay rejection are
sandbox scaffolding. They are non-durable, process-scoped, and unsuitable as
production confirmation governance, audit evidence, or cross-process replay defense.

## Review Path

1. Assign accountable owners without filling approval values by inference.
2. Attach concrete, capability-specific evidence to each unresolved record.
3. Approve or reject each record independently using the sign-off template.
4. Recheck all stop conditions and dependencies together.
5. Only after every applicable approval is complete, plan a bounded follow-up slice.

Task 9A.1, Task 9B, and final whole-change verification remain blocked. Completing
this packet does not make any of them ready.

## Delivered Invariants

These invariants are already delivered by Task 9A.0 and are not production approvals:

| Invariant | Delivered state |
|---|---|
| Production boundary | Real provider ports resolve to typed-unavailable by default. |
| Public/read-only boundary | CLI, TUI, public operations, and read-only composition expose no executor. |
| Provider separation | Omarchy and Homebrew remain distinct provider-specific ports. |
| Input safety | Public inputs cannot supply executable, argv, shell text, or inferred provider authority. |
| Binding safety | Execution scaffolding requires exact binding and fresh re-observation; stale plans refuse. |
| Failure safety | Partial, failed, timed-out, malformed, and unverifiable results require reassessment. |
| Recovery safety | No automatic retry, resume, configuration apply, restore, or rollback follows execution. |
| Test boundary | Provider behavior is exercised only through fakes and sandbox exact-argv adapters. |

## Required Approval Records

Every record must carry a stable record ID, status, accountable owner, approver,
scope, version, evidence references, decision date, review date or trigger, acceptance
criteria, rejection reason when applicable, and superseded-record reference. Blank,
placeholder, expired, or unverifiable fields do not authorize execution.

### Mapping Catalog Record

The catalog record must define its owner, semantic version, review workflow,
integrity or signing mechanism, source provenance, logical-request-to-provider mapping,
provider role, platform and generation scope, safety classification, conflict rules,
deprecation policy, and support lifetime. Every entry needs independent evidence and
must fail closed when missing, ambiguous, expired, unsupported, or integrity-invalid.

### Provider Capability and Command-Policy Record

Each provider capability must name the provider version range, platform, architecture,
Omarchy generation where applicable, capability, exact policy-owned argv template,
read-only discovery evidence, native execution evidence reference, review owner,
integrity reference, and support window. Nominal versions, fixtures, source inspection,
or another generation's evidence cannot establish executable authority.

**Omarchy 4.x execution is explicitly unavailable until concrete matching native
capability and exact command-policy evidence is attached and approved.** No 4.x
command form may be inferred from Omarchy 3.x or unreleased/structural material.

### Acquisition-Verification Record

The policy must define provider- and capability-specific evidence sources, pre-effect
baseline, post-effect checks, success threshold, partial and unverifiable thresholds,
timeout and truncation handling, evidence freshness, independence requirements,
maximum evidence size, reassessment rules, and the outcome allowed for each threshold.
Provider exit success alone must not be promoted to independently verified acquisition.

### Disclosure Catalog Record

Stable, reviewed disclosure codes must exist for each applicable category:

| Category | Required disclosed meaning |
|---|---|
| Network | Whether network access occurs, destinations or trust class, and data sent. |
| Privilege | Whether privilege escalation is required, its scope, and refusal behavior. |
| Prompts | Whether a provider can prompt and how non-interactive execution fails closed. |
| Side effects | Files, package state, services, or provider metadata that may change. |
| No rollback | Explicit statement that no automatic rollback or restoration is provided. |

The code identifiers, wording, severity, acknowledgement requirement, localization
ownership, and version are unresolved; this packet does not invent them.

### Confirmation Governance Record

The confirmation record must define the authorized issuer, issuance prerequisites,
subject, exact plan and binding digest, operation, provider and role, policy/mapping
versions, disclosure codes, acknowledgement set, production TTL, clock source and
skew policy, single-use/replay scope, storage and concurrency semantics, revocation,
expiry behavior, stale re-observation, audit fields, durability, retention/erasure,
privacy controls, and indeterminate-write behavior.

If replay prevention or audit must survive a process, host, or restart, Task 9D Gate A
and Gate B must be approved and delivered first. A metadata ledger never replaces
fresh authority or fresh re-observation.

### Safe Execution Environment Record

The environment approval must constrain eligible hosts/runners, platform and
architecture, isolation boundary, filesystem scope, network policy, credential and
secret handling, privilege model, environment allowlist, working directory, exact
binary provenance, resource/time/output limits, concurrency, cancellation, log
sanitization, evidence capture, operator access, incident stop mechanism, and cleanup.
It must prove arbitrary shell, unreviewed binaries, interactive prompts, and ambient
credentials are unavailable to the adapter.

### Multi-Package Semantics Record

Batch execution remains unavailable until policy defines deterministic ordering,
dependency handling, atomicity claims, behavior after partial success, stop versus
continue rules, outcome reporting, fresh reassessment, retry eligibility, retry budget,
idempotency, confirmation granularity, and explicit no-rollback behavior. A single-
package confirmation must not authorize a batch.

## Decision Register

| Decision | Status | Required owner | Required evidence | Acceptance criteria | Downstream task impact |
|---|---|---|---|---|---|
| Mapping catalog governance and entries | Unresolved | Designated catalog owner and security reviewer | Versioned catalog, provenance, integrity proof, safety review, support policy | Every requested mapping is scoped, reviewed, integrity-valid, supported, and fail-closed | Blocks Task 9A.1 and package-dependent Task 9B work |
| Omarchy capability/command policy | Unresolved; 4.x unavailable | Designated Omarchy policy owner | Matching native version/generation/capability evidence and exact reviewed argv policy | Evidence matches every enabled generation and unsupported forms remain unavailable | Blocks Omarchy activation; 4.x stays unavailable |
| Homebrew capability/command policy | Unresolved | Designated Homebrew policy owner | Matching native platform/capability evidence and exact reviewed argv policy | Primary/fallback role and command are evidence-backed with no silent switch | Blocks Homebrew activation and fallback execution |
| Acquisition verification | Unresolved | Designated product policy and evidence owners | Provider-specific baseline/post-check matrix and threshold rationale | Outcomes cannot exceed evidence strength; partial/unknown fail closed | Blocks verified acquisition and readiness claims |
| Disclosure catalog | Unresolved | Designated product, security, and UX owners | Reviewed code catalog and user-comprehension evidence | All applicable network, privilege, prompt, side-effect, and no-rollback disclosures are acknowledged | Blocks confirmation issuance |
| Confirmation governance | Unresolved | Designated security and operations owners | Issuer model, binding schema, TTL/replay analysis, acknowledgement and audit design | Exact binding, freshness, single-use scope, durability, and indeterminate states fail closed | Blocks all production mutation |
| Safe execution environment | Unresolved | Designated operations and security owners | Threat model, runner controls, binary provenance, isolation and incident-stop evidence | Adapter receives only approved capabilities and bounded sanitized results | Blocks real-provider composition and validation |
| Multi-package semantics | Unresolved | Designated product and execution-policy owners | Ordering/partial/stop/retry/idempotency design with failure scenarios | Deterministic bounded behavior requires explicit batch confirmation and no rollback claim | Blocks batch execution; single-package-only remains |
| Durable audit/replay requirement | Unresolved | Designated security, privacy, and operations owners | Durability need, data model, retention/erasure, failure and recovery analysis | Decision explicitly selects process-local insufficiency or approved Task 9D dependency | May block Task 9A.1 and Task 9B on Task 9D |

## Approval and Sign-Off Template

Copy one template per decision; placeholders are not approvals.

| Field | Value |
|---|---|
| Decision record ID | `<required>` |
| Decision title and version | `<required>` |
| Status (`approved` or `rejected`) | `<required>` |
| Scope and exclusions | `<required>` |
| Accountable owner | `<required>` |
| Approver(s) and role(s) | `<required>` |
| Evidence references and integrity identifiers | `<required>` |
| Acceptance criteria result | `<required>` |
| Effective date | `<required>` |
| Review/expiry date or trigger | `<required>` |
| Supersedes | `<required or none>` |
| Rejection/exception rationale | `<required when applicable>` |
| Sign-off reference | `<required>` |

## Stop Conditions

Stop without implementation, native execution, or readiness claims when any of the
following is true:

- A required owner, approval, field, evidence reference, integrity check, or support window is absent, ambiguous, expired, or unverifiable.
- Provider evidence does not exactly match platform, architecture, version, generation, capability, mapping, and command policy.
- Omarchy 4.x lacks concrete matching native command-policy evidence.
- Verification thresholds, disclosure codes, confirmation governance, or safe-environment controls are unresolved.
- Confirmation can be inferred, replayed outside its approved scope, detached from the exact binding, or accepted after stale re-observation.
- Durable audit/replay is required but Task 9D gates are incomplete or unhealthy.
- Multi-package ordering, partial outcome, stop, retry, idempotency, or acknowledgement semantics are unresolved for a batch.
- A proposed slice requires real network, privilege, provider, or installation effects before its environment and evidence plan are separately approved.
- Any change would expose execution through the read-only/public boundary or add automatic rollback, retry, resume, or silent provider switching.

## Follow-Up Slice Gate

After all applicable records are approved, create a new bounded planning slice with a
fresh line forecast, exact allowed edit roots, provider-specific RED tests, focused
verification, an approved safe runtime harness, rollback boundary, and ordinary
repository review route. The slice must consume approved record identifiers rather
than copying authority into code by inference.

Until then, production remains typed-unavailable, Task 9A.1 and Task 9B remain
blocked, and final whole-change verification must not start.
