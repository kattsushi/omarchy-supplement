# Maintainer-Owned Production Execution Governance

## Decision

Governance mode is `maintainer-owned`. The sole maintainer is `kattsushi`.

The maintainer may make a governance decision by self-attestation with explicit risk
acceptance. External reviews are optional and additive. They are independent only
when the review record proves independence; a title, affiliation, or assertion is
not proof.

This packet replaces only the requirement for mandatory external human approval.
It does not relax technical evidence, safety, verification, disclosure,
confirmation, environment, audit, replay, rollback, or reassessment requirements.

This packet is non-authorizing. It creates no approval, hash, date, evidence,
command, mapping, native support, environment, production wiring, or execution
authority. Production remains typed-unavailable until every applicable predicate
in this packet passes.

## Status And Subject

Every governance record has exactly one status:

- `approved`: the exact subject is approved within the attested scope.
- `unapproved`: the subject has no effective approval.

There is no `self-approved` status. Self-attestation is the decision mechanism in
`maintainer-owned` mode, not a third status or a weaker approval class.

Every decision binds to this exact subject:

```text
{
  id,
  version,
  exactRevision,
  sha256
}
```

All four values are required and immutable for that decision. A missing value,
placeholder, mutable reference, revision mismatch, or SHA-256 mismatch makes the
record `unapproved`. A change to any subject value requires a new attestation.

## Self-Attestation Record

An effective self-attestation must contain all of the following:

| Field | Requirement |
|---|---|
| `mode` | Exactly `maintainer-owned`. |
| `subject` | Exact `{id, version, exactRevision, sha256}`. |
| `decision` | Exactly `approved` or `unapproved`. |
| `attester` | Exactly `kattsushi`. |
| `riskAcceptance` | Explicit statement of risks accepted; silence or inference is invalid. |
| `scope` | Capabilities and claims included in the decision. |
| `exclusions` | Capabilities and claims explicitly outside the decision. |
| `evidenceReferences` | Immutable references supporting each in-scope claim. |
| `evidenceStrengths` | Strength for every evidence reference. |
| `integrityIds` | Integrity identifier for every evidence reference. |
| `effectiveAt` | Effective timestamp; it must not be inferred from commit history. |
| `reviewBy` / `expiresAt` | At least one bounded review or expiry timestamp. |
| `supersedes` | Prior record ID, or explicit `none`. |
| `revocationState` | Exactly `active` or `revoked`. |
| `revocationReason` | Required when revoked; otherwise explicit `none`. |

Approval applies only to claims jointly covered by the subject, scope, evidence,
evidence strength, integrity IDs, and effective lifetime. Broad prose cannot enlarge
that intersection.

## Concise Attestation Template

Placeholders are not approvals. Do not complete this template by inference.

```yaml
mode: maintainer-owned
subject:
  id: <required>
  version: <required>
  exactRevision: <required>
  sha256: <required>
decision: <approved|unapproved>
attester: kattsushi
riskAcceptance: <explicit risks accepted>
scope: <included claims and capabilities>
exclusions: <excluded claims and capabilities>
evidenceReferences:
  - reference: <immutable reference>
    strength: <declared evidence strength>
    integrityId: <required integrity identifier>
effectiveAt: <required timestamp>
reviewBy: <timestamp or none when expiresAt is present>
expiresAt: <timestamp or none when reviewBy is present>
supersedes: <record ID or none>
revocationState: <active|revoked>
revocationReason: <required when revoked, otherwise none>
```

## Validation

Validation is fail-closed. Treat the governance decision as `unapproved` when:

- the attestation is absent;
- any required field is absent, blank, placeholder, ambiguous, or unverifiable;
- the attester is not the configured sole maintainer;
- the subject does not match exactly;
- an evidence reference, declared strength, or integrity ID is absent or mismatched;
- the decision is not effective yet;
- `reviewBy` or `expiresAt` has passed without a valid superseding attestation;
- the attestation is revoked;
- the requested claim is outside scope or within exclusions;
- the requested authority exceeds what the evidence proves.

Clock, parsing, storage, integrity, or validation uncertainty must resolve to
`unapproved`, never to inferred approval.

## Scope Is Not Transitive

Schema-only approval approves only the identified schema. Unless each item is
separately in scope and evidenced, it does not approve:

- catalog entries or their semantics;
- package mappings;
- provider capabilities or commands;
- exact argv or executable provenance;
- native platform, architecture, version, or generation support;
- acquisition-verification policy;
- safe execution environments;
- production composition or wiring;
- confirmation issuance;
- execution authority.

Approval of one entry does not approve adjacent entries. Approval of one provider,
version, generation, platform, architecture, capability, command, or environment
does not approve another.

## Independent Predicates

Human governance is one predicate. It must remain separate from every technical and
operational predicate below:

| Predicate | Minimum question |
|---|---|
| Human governance | Is an exact, active, unexpired attestation valid for this scope? |
| Technical authenticity | Is the exact artifact authentic and integrity-valid? |
| Native evidence | Does matching native evidence prove the capability and command? |
| Acquisition verification | Do independent post-effect checks prove the acquired state? |
| Disclosure and comprehension | Were all applicable risks disclosed and understood? |
| Confirmation | Is fresh, exact-bound, authorized, single-use confirmation valid? |
| Safe environment | Is the approved bounded runtime environment currently available? |
| Audit and replay | Are required durable audit and replay controls healthy? |
| Rollback and reassessment | Are explicit no-rollback, stop, recovery, and reassessment rules satisfied? |

No predicate can substitute for another. Human approval cannot manufacture
technical truth. Passing technical checks cannot manufacture human approval.
Production remains typed-unavailable unless all applicable predicates pass together.

## Evidence Discipline

Evidence strength is preserved, never promoted by governance language.

- Structural evidence proves only the structure it actually observes.
- Fixture, fake, sandbox, source-inspection, and synthetic evidence remain those
  classes and cannot be upgraded to native evidence.
- A successful provider exit does not independently verify acquisition.
- Evidence for another platform, architecture, version, generation, provider,
  capability, command, mapping, or environment does not transfer.
- Optional external review can critique or corroborate evidence but cannot increase
  its strength without new proof and integrity-bound evidence.
- Missing, stale, ambiguous, partial, truncated, or unverifiable evidence fails
  closed for the claim it was expected to support.

Unsupported mappings, commands, platforms, architectures, provider versions,
Omarchy generations, capabilities, and environments are unavailable. They must not
be inferred, silently substituted, or routed through a fallback.

## Optional External Reviews

External reviews may be attached to an attestation as additive evidence. Each review
must identify its reviewer, exact subject, scope, exclusions, evidence references,
decision, time, and integrity reference.

An external review counts as independent only when the record proves the reviewer
was independent of authorship, evidence production, attestation, and the decision
being reviewed. Unproven independence must be recorded as `not-proven` and provides
no independence claim. External disagreement does not silently revoke an attestation,
but it is a reassessment trigger that must be resolved before relying on the affected
claim.

## Acceptance Conditions

A governance record is acceptable only when all of these are true:

- the exact subject and all mandatory attestation fields validate;
- the decision is `approved`, active, effective, and within review/expiry bounds;
- risk acceptance is explicit and covers the in-scope risks;
- scope and exclusions are precise enough to reject out-of-scope use;
- every in-scope claim maps to immutable, integrity-bound evidence;
- evidence strengths support the claims without upgrade or transfer;
- applicable independent predicates pass separately;
- unsupported cases remain unavailable;
- production composition still fails closed for every unmet predicate.

Acceptance of this packet only accepts the governance model. It does not satisfy any
unresolved record class or authorize production execution.

## Stop Conditions

Stop without approval, wiring, native execution, or readiness claims when:

- an attestation is absent, mismatched, expired, revoked, or outside scope;
- a required predicate is absent, failed, stale, ambiguous, or unverifiable;
- evidence strength is insufficient or has been promoted from structural/fixture;
- a mapping, command, provider capability, platform, architecture, version,
  generation, or environment is unsupported;
- confirmation is stale, replayable, detached from the exact binding, or not durable
  where durability is required;
- disclosure or comprehension is incomplete;
- acquisition is inferred from provider success without required verification;
- audit, replay protection, incident stop, rollback policy, or reassessment is
  unresolved or unhealthy;
- a request depends on automatic retry, resume, rollback, restoration, provider
  switching, or authority inference;
- any attempt would expose mutation through a public or read-only boundary.

## Lifecycle And Revocation

1. Create an `unapproved` record for the exact subject.
2. Gather evidence without changing its strength or scope.
3. Record the maintainer decision and explicit risk acceptance.
4. Validate all fields and each applicable predicate independently.
5. Allow reliance only while the approved record is active and within its bounds.
6. Reassess on subject, evidence, threat, provider, platform, environment, policy,
   disclosure, confirmation, audit, replay, incident, or ownership change.
7. Supersede with a new exact-subject record; never edit history into a new approval.
8. Revoke immediately when integrity, evidence, scope, risk acceptance, or safety is
   invalidated or cannot be established.

Revocation is fail-closed and effective for all future reliance. A revoked record
retains its history, changes `revocationState` to `revoked`, records a concrete
`revocationReason`, and cannot be reactivated. Restoration requires a new record
with fresh evidence and a `supersedes` reference.

## Unresolved Record Classes

This packet does not resolve or approve these record classes:

- mapping catalog governance and individual entries;
- Omarchy capability and exact command policy, including every generation;
- Homebrew capability, role, fallback, and exact command policy;
- provider-specific acquisition verification and thresholds;
- disclosure catalog wording, codes, acknowledgement, and comprehension evidence;
- confirmation issuer, binding, TTL, single-use, revocation, and durability policy;
- safe execution environment, binary provenance, isolation, credentials, and limits;
- multi-package ordering, partial outcomes, stop, retry, idempotency, and confirmation;
- durable audit, replay prevention, retention, privacy, and recovery;
- rollback/no-rollback policy, incident stop, and reassessment procedures;
- production adapter composition, wiring, runtime harness, and execution authority.

Each unresolved class remains `unapproved` and typed-unavailable until a separate,
exactly scoped, evidence-backed decision and every applicable predicate pass.

## Production Gate

The only valid production readiness rule is conjunction:

```text
productionAvailable =
  humanGovernance
  && technicalAuthenticity
  && nativeEvidence
  && acquisitionVerification
  && disclosureAndComprehension
  && confirmation
  && safeEnvironment
  && auditAndReplay
  && rollbackAndReassessment
```

An inapplicable predicate must be explicitly justified; it must not be omitted by
silence. Any false, absent, expired, revoked, mismatched, unsupported, or unknown
predicate keeps production typed-unavailable. This packet does not change that state.
