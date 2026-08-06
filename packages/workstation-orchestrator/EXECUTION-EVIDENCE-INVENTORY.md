# Production Execution Evidence Inventory

## Authority Boundary

This inventory grants no approval, production execution authority, or implementation
authorization. Production package execution remains typed-unavailable. Every record
below is `unapproved`; evidence classification does not substitute for approval.

The accountable owner acceptance is administrative only: [`kattsushi` accepted the
four corresponding accountable record-preparation roles](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199374901).
This is distinct from the [coordinator-only acceptance](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199220193)
and is not evidence validation, approver sign-off, or authority to run `omarchy`, `brew`, network, `sudo`, provider, or install effects.
Governance decision records in `EXECUTION-GOVERNANCE.md` remain unresolved.

Base evidence revision: [`e0543f330dda46680ecd18eb394ffbeb613200a9`](https://github.com/kattsushi/omarchy-supplement/commit/e0543f330dda46680ecd18eb394ffbeb613200a9).
Unless a record identifies a later candidate revision, source and test references are
immutable links at that base revision. Source, tests, and fixtures make no
native-environment claim.

## Review Path

1. Confirm each referenced blob against the integrity index.
2. Review evidence only at its recorded strength: `structural`, `fixture`,
   `policy draft`, or `unavailable`.
3. Collect every item listed under missing evidence and decisions.
4. Obtain named external reviewers for every listed role.
5. Record a separate, immutable sign-off for each record; owner acceptance and a
   review comment are not sign-off.
6. Recheck all record and global stop conditions together before proposing a new
   production-activation slice.

## Historical Context

| Pull request | Context retained by this inventory |
|---|---|
| [#25](https://github.com/kattsushi/omarchy-supplement/pull/25) | Fixture-only provider discovery and mapping refusal semantics; no execution authority. |
| [#31](https://github.com/kattsushi/omarchy-supplement/pull/31) | Read-only guidance and bounded evidence labeling; native Omarchy capability remained unavailable. |
| [#32](https://github.com/kattsushi/omarchy-supplement/pull/32) | Sandbox/default-unavailable execution scaffolding; exact-argv tests are fixture evidence only. |
| [#33](https://github.com/kattsushi/omarchy-supplement/pull/33) | Non-authorizing governance policy draft at the base evidence revision. |

## EV-MAPPING-CATALOG-v0.1.0

| Field | Value |
|---|---|
| Status | `unapproved` |
| Accountable owner | `kattsushi` |
| Accepted role | Mapping Catalog Owner, explicitly accepted by `kattsushi` in [issue #34 comment 5199374901](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199374901); distinct from the coordinator-only acceptance in [comment 5199220193](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199220193) |
| Approval effect | None; separate sign-off is required |

### Evidence

| Reference | Strength | What it establishes | What it does not establish |
|---|---|---|---|
| [PR #36](https://github.com/kattsushi/omarchy-supplement/pull/36) and [feature commit `2884b54d34ba09f1ad2a3a26c33ff972025c33a9`](https://github.com/kattsushi/omarchy-supplement/commit/2884b54d34ba09f1ad2a3a26c33ff972025c33a9) | delivery context | An empty versioned draft catalog and structural contract were delivered as a feature candidate | Merge, approval, production activation, or a supported mapping entry |
| [Catalog requirements](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md#L50-L56) | policy draft | Required catalog fields and fail-closed intent | An approved catalog or entry |
| [Catalog contract and resolver](https://github.com/kattsushi/omarchy-supplement/blob/2884b54d34ba09f1ad2a3a26c33ff972025c33a9/packages/workstation-orchestrator/src/domain/mapping-catalog.ts#L5-L167) | structural | Catalog-level SHA-256 integrity; lifecycle and status gating; required independent security and provider-policy approvals; canonical identities and self-approval rejection; exact closed-scope runtime validation; provenance and support windows; ambiguity fails closed | Reviewer authenticity, native mapping provenance, or correctness of any provider mapping |
| [Catalog mapping adapter](https://github.com/kattsushi/omarchy-supplement/blob/2884b54d34ba09f1ad2a3a26c33ff972025c33a9/packages/workstation-orchestrator/src/infrastructure/mappings/catalog-mapping-port.ts#L6-L22) | structural | Resolution uses an injected exact runtime context and converts every unavailable result into typed mapping unavailability | A trusted immutable production context resolver or production wiring |
| [Empty draft catalog](https://github.com/kattsushi/omarchy-supplement/blob/2884b54d34ba09f1ad2a3a26c33ff972025c33a9/packages/workstation-orchestrator/src/infrastructure/mappings/draft-mapping-catalog.ts#L3-L16) | structural | Version `0.1.0` is `draft`, has valid catalog-level integrity, requires both approval roles, and contains no entries | Any logical-to-provider mapping, native provenance, review, sign-off, or approval |
| [Mapping catalog tests](https://github.com/kattsushi/omarchy-supplement/blob/2884b54d34ba09f1ad2a3a26c33ff972025c33a9/packages/workstation-orchestrator/tests/domain/mapping-catalog.test.ts#L49-L171) | fixture | The structural rules above are tested; the empty draft cannot produce a plan, and the catalog and adapter remain outside production composition | Native provider behavior, external review, production activation, or governance approval |
| Ordinary candidate verification | structural | At feature commit `2884b54d34ba09f1ad2a3a26c33ff972025c33a9`, 6 test files / 81 tests passed, typecheck passed, and `git diff --check` passed | An RDD receipt, governance approval, native execution evidence, or reviewer sign-off |

### Acceptance-Criteria Mapping

| Criterion | Current state |
|---|---|
| Versioned catalog with scoped logical-to-provider entries | Partially met; an empty versioned draft catalog and scoped structural contract exist, but no logical-to-provider mapping entries exist |
| Provenance and integrity mechanism | Partially met; catalog-level SHA-256 integrity and required non-fixture provenance fields are implemented and tested, but no supported entry or native mapping provenance exists |
| Ownership, approval, conflict, deprecation, and support rules | Structurally implemented and tested; required external reviewers and immutable sign-offs are absent, and reviewer authenticity remains governance-owned |
| Missing, ambiguous, expired, or invalid entries fail closed | Structurally implemented and tested; the empty draft is unavailable and cannot produce a plan |
| Production composition and activation | Blocked; the catalog adapter is not wired into production, a trusted immutable production context resolver is absent, and production mapping remains typed-unavailable |

### Missing Evidence, Decisions, and Approvers

- Evidence: supported logical-to-provider entries, native mapping provenance,
  per-entry safety review, and native support-window evidence.
- Production integration: a trusted immutable production context resolver is not
  wired, the catalog adapter remains outside production composition, and production
  activation remains blocked.
- Missing approvers and sign-offs: named independent security and provider-policy
  reviewers, their immutable sign-offs, and governance-owned reviewer-authenticity
  validation are absent.
- External reviewer roles: supply-chain/integrity reviewer and package-mapping
  safety reviewer.

### Stop Conditions

- Stop if any requested mapping is absent, ambiguous, unsupported, expired, or
  integrity-invalid.
- Stop if a mapping is inferred from source, tests, fixtures, a provider name, or
  another platform/generation.
- Stop until both required external roles sign this record separately.

## EV-OMARCHY-COMMAND-POLICY-v0.1.0

| Field | Value |
|---|---|
| Status | `unapproved` |
| Accountable owner | `kattsushi` |
| Accepted role | Omarchy Policy Owner, explicitly accepted by `kattsushi` in [issue #34 comment 5199374901](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199374901); distinct from the coordinator-only acceptance in [comment 5199220193](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199220193) |
| Approval effect | None; separate sign-off is required |

### Evidence

| Reference | Strength | What it establishes | What it does not establish |
|---|---|---|---|
| [PR #38](https://github.com/kattsushi/omarchy-supplement/pull/38) and [candidate commit `9fb0fe191d67bda54663b00a8768120833ec9a6f`](https://github.com/kattsushi/omarchy-supplement/commit/9fb0fe191d67bda54663b00a8768120833ec9a6f) | delivery context | An empty versioned draft Omarchy command-policy registry and structural contract were delivered as a feature candidate | Merge, approval, production activation, a supported command, or native Omarchy evidence |
| [Omarchy command type](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L12-L16) | structural | Closed scaffolded argv shapes | A supported native command |
| [Fixture generation parser](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/infrastructure/platform/fixtures.ts#L20-L63) | fixture | Fixture-only generation classification | Native version or capability evidence |
| [Fixture parser tests](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/infrastructure/fixture-parsers.test.ts#L7-L19) | fixture | Known/unknown fixture classification | Omarchy 3.x or 4.x execution support |
| [Sandbox exact-argv test](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/integration/provider-execution-sandbox.test.ts#L73-L92) | fixture | Isolated fake executable receives exact fixture argv | A native Omarchy result |
| [Omarchy policy requirement](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md#L58-L68) | policy draft | Matching evidence and 4.x unavailability rule | An approved command policy |
| [Command-policy registry and resolver](https://github.com/kattsushi/omarchy-supplement/blob/9fb0fe191d67bda54663b00a8768120833ec9a6f/packages/workstation-orchestrator/src/domain/omarchy-command-policy.ts#L1-L166) | structural | Canonical registry integrity; a strict plain-JSON runtime domain; lifecycle, approval, self-review, provenance, native-evidence binding, exact scope, command grammar, cardinality, and ambiguity checks that fail closed; sparse, prototype-bearing, accessor-backed, cyclic, and other exotic inputs are rejected | Reviewer authenticity, an approved registry or entry, correctness of any native command, or production execution authority |
| [Empty draft provider](https://github.com/kattsushi/omarchy-supplement/blob/9fb0fe191d67bda54663b00a8768120833ec9a6f/packages/workstation-orchestrator/src/infrastructure/providers/draft-omarchy-command-policy.ts#L3-L8) | structural | Version `0.1.0` is an integrity-valid `draft`, requires security and Omarchy native-capability approvals, has no approvals, and contains no command entries | Any supported capability, approved argv, native evidence, adapter, production wiring, review, sign-off, or approval |
| [Command-policy tests](https://github.com/kattsushi/omarchy-supplement/blob/9fb0fe191d67bda54663b00a8768120833ec9a6f/packages/workstation-orchestrator/tests/domain/omarchy-command-policy.test.ts#L41-L175) | fixture | The structural protections above are tested; the draft resolves `registry-not-approved`, Omarchy 4.x has no matching policy, and the registry and resolver remain absent from production composition | Native Omarchy behavior, external review, reviewer authenticity, production activation, or governance approval |
| [Production provider port](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/composition/mutation.ts#L16-L26) | unavailable | Real Omarchy execution stays typed-unavailable | Production execution authority |
| Ordinary candidate verification | structural | At candidate commit `9fb0fe191d67bda54663b00a8768120833ec9a6f`, the full package suite passed 15 files / 201 tests, the focused policy suite passed 68 tests, an independent adversarial suite passed 15 tests, and typecheck, diff-check, and import scan passed | An RDD receipt or review, governance approval, native execution evidence, external reviewer sign-off, or production readiness |

### Acceptance-Criteria Mapping

| Criterion | Current state |
|---|---|
| Versioned policy registry and exact runtime domain | Partially met; an empty integrity-valid versioned draft and strict structural contract exist, but no command entries or supported capabilities exist |
| Exact version/generation/platform/architecture match | Structurally enforced and tested; no approved entry or matching native evidence exists |
| Exact reviewed argv per capability | Structurally enforced and tested; no command grammar or argv is approved for any capability |
| Approval, provenance, native-evidence binding, lifecycle, and ambiguity rules | Structurally enforced and tested; required external review, immutable sign-off, reviewer-authenticity validation, and native evidence are absent |
| Production composition and activation | Blocked; no trusted production context, adapter, or wiring exists, and production remains typed-unavailable |
| Omarchy 4.x remains unavailable without matching evidence | Met as a fail-closed structural rule; no 4.x policy or native evidence exists and activation remains unapproved |

### Missing Evidence, Decisions, and Approvers

- Policy content: no supported commands, capabilities, command entries, or approved
  argv exist.
- Evidence: no native Omarchy evidence exists for host/runner identity,
  architecture, exact Omarchy and binary versions, capability-specific read-only
  discovery, argv/result, binary provenance, observation date, or reproducible
  evidence digest.
- Production integration: a trusted production context, policy adapter, and wiring
  are absent; production remains typed-unavailable.
- Missing approvers and sign-offs: the external Independent Omarchy Native
  Capability Reviewer and independent security command-policy reviewer, their
  immutable sign-offs, and governance-owned reviewer-authenticity validation are
  absent. Owner preparation acceptance and structural verification are not
  approval.
- Blocked work: Task 9A.1, Task 9B, and final whole-change `sdd-verify` remain
  blocked.

### Stop Conditions

- Stop on fixture-only, structural, cross-generation, nominal-version, stale, or
  integrity-unverifiable evidence.
- Stop all Omarchy 4.x activation until matching native evidence and separate
  command-policy sign-off exist.
- Stop until both required external roles sign this record separately.

## EV-HOMEBREW-COMMAND-POLICY-v0.1.0

| Field | Value |
|---|---|
| Status | `unapproved` |
| Accountable owner | `kattsushi` |
| Accepted role | Homebrew Policy Owner, explicitly accepted by `kattsushi` in [issue #34 comment 5199374901](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199374901); distinct from the coordinator-only acceptance in [comment 5199220193](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199220193) |
| Approval effect | None; separate sign-off is required |

### Evidence

| Reference | Strength | What it establishes | What it does not establish |
|---|---|---|---|
| [PR #41](https://github.com/kattsushi/omarchy-supplement/pull/41) and [candidate commit `bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7`](https://github.com/kattsushi/omarchy-supplement/commit/bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7) | delivery context | An empty versioned draft Homebrew command-policy registry and structural contract were delivered as a feature candidate | Merge, approval, production activation, a supported formula, cask, argv, or native Homebrew evidence |
| [Homebrew command type](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L17-L22) | structural | Closed scaffolded `brew install` argv shape | A supported native command |
| [Fixture Homebrew discovery](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/infrastructure/platform/fixtures.ts#L69-L100) | fixture | Fixture-only macOS capability descriptions | Native Homebrew capability evidence |
| [Fixture discovery tests](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/infrastructure/fixture-parsers.test.ts#L21-L28) | fixture | Fixtures never create an execution capability | Native package acquisition behavior |
| [Sandbox exact-argv test](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/integration/provider-execution-sandbox.test.ts#L73-L92) | fixture | Isolated fake executable receives exact fixture argv | A native Homebrew result |
| [Homebrew decision requirement](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md#L124-L136) | policy draft | Primary/fallback evidence and no-silent-switch requirement | An approved Homebrew policy |
| [Homebrew command-policy specialization](https://github.com/kattsushi/omarchy-supplement/blob/bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7/packages/workstation-orchestrator/src/domain/homebrew-command-policy.ts#L1-L45) | structural | Exact platform, distribution, architecture, Homebrew version, binary, prefix, package-kind, capability, and variant scope; formula/cask route relationships; fixed cask ordering; and provider-specific evidence-context binding | A supported formula or cask, approved argv, native correctness, reviewer authenticity, or production authority |
| [Shared provider command-policy core](https://github.com/kattsushi/omarchy-supplement/blob/bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7/packages/workstation-orchestrator/src/domain/provider-command-policy.ts#L1-L168) | structural | The hardened provider entry hook composes with integrity, lifecycle, approval, provenance, native-evidence, exact-scope, argument, ambiguity, and strict plain-JSON runtime checks; shell routes and undeclared or dangerous flags fail closed | Homebrew-specific native evidence, real command correctness, external sign-off, or reviewer authenticity |
| [Empty draft Homebrew registry](https://github.com/kattsushi/omarchy-supplement/blob/bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7/packages/workstation-orchestrator/src/infrastructure/providers/draft-homebrew-command-policy.ts#L1-L8) | structural | Version `0.1.0` is integrity-valid and `draft`, claims no preparation or approval roles, has no approvals, and contains no entries | Any supported formula, cask, capability, argv, native evidence, adapter, production wiring, review, sign-off, or approval |
| [Homebrew command-policy tests](https://github.com/kattsushi/omarchy-supplement/blob/bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7/packages/workstation-orchestrator/tests/domain/homebrew-command-policy.test.ts#L1-L143) | fixture | Synthetic mechanics exercise exact scope and prefix relationships, kind/capability binding, fixed cask order, shell and dangerous-route/flag refusal, native-evidence/lifecycle/approval/provenance/integrity/ambiguity gates, hardened hook behavior, exotic runtime inputs, and absence from production composition | Native Homebrew behavior, real formula/cask correctness or support, external review, reviewer authenticity, production activation, or governance approval |
| [Omarchy generic-hook regression tests](https://github.com/kattsushi/omarchy-supplement/blob/bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7/packages/workstation-orchestrator/tests/domain/omarchy-command-policy.test.ts#L177-L200) | fixture | The shared entry hook preserves generic provider parity: detached frozen input, exactly one invocation, fail-closed invalid/throwing/async/mutating callbacks, and native-evidence context failure | Homebrew native capability, command correctness, or approval |
| [Production provider port](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/composition/mutation.ts#L16-L26) | unavailable | Real Homebrew execution stays typed-unavailable | Production execution authority |
| Ordinary candidate verification | structural | At candidate commit `bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7`, the Homebrew suite passed 63 tests, the Omarchy suite passed 69 tests, the full package suite passed 265 tests, and typecheck, diff-check, production-import scan, all 48 scope combinations, and hook probes reported `PASS` | An RDD receipt or review, native evidence, real Homebrew correctness or support, governance approval, external reviewer sign-off, or production readiness |

### Acceptance-Criteria Mapping

| Criterion | Current state |
|---|---|
| Versioned policy registry and exact runtime domain | Partially met; an empty integrity-valid versioned draft and strict structural contract exist, but no entries, supported formula/cask capabilities, or approved argv exist |
| Exact platform/distribution/architecture/prefix/Homebrew version match | Structurally enforced and tested; no approved entry or matching native evidence exists |
| Formula/cask kind, capability, and exact reviewed argv | Structurally enforced and tested, including fixed cask ordering and dangerous route/flag refusal; synthetic mechanics do not establish real command correctness or support |
| Approval, provenance, native-evidence binding, lifecycle, integrity, and ambiguity rules | Structurally enforced and tested; required external reviews, immutable sign-offs, reviewer-authenticity validation, and native evidence are absent |
| Production composition and activation | Blocked; no trusted production context, policy adapter, or wiring exists, and production remains typed-unavailable |

### Missing Evidence, Decisions, and Approvers

- Policy content: no supported formula, cask, capability, command entry, or approved
  argv exists.
- Evidence and support: no native Homebrew evidence, real command correctness, or
  support claim exists for any platform, distribution, architecture, prefix,
  Homebrew/binary version, package identity, argv/result, provenance, date, or
  reproducible evidence digest.
- Production integration: no trusted production context, policy adapter, or wiring
  exists; production remains typed-unavailable.
- Missing approvers and sign-offs: the external Independent Homebrew Native
  Capability Reviewer and independent security command-policy reviewer, their
  immutable sign-offs, and governance-owned reviewer-authenticity validation are
  absent. Owner preparation acceptance and structural verification are not
  approval.
- Blocked work: Task 9A.1, Task 9B, and final whole-change `sdd-verify` remain
  blocked.

### Stop Conditions

- Stop on fixture-only, structural, cross-platform, stale, or integrity-unverifiable
  evidence.
- Stop if fallback can be silent, Homebrew can be installed automatically, or the
  package role is ambiguous.
- Stop if synthetic scope, hook, or argv verification is treated as native evidence,
  real command correctness, or support.
- Stop until both required external roles sign this record separately.

## EV-ACQUISITION-VERIFICATION-v0.1.0

| Field | Value |
|---|---|
| Status | `unapproved` |
| Accountable owner | `kattsushi` |
| Preparation role | Product Policy Owner record preparation, explicitly accepted by `kattsushi` in [issue #34 comment 5199374901](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199374901); this is administrative preparation only, distinct from the coordinator-only acceptance in [comment 5199220193](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199220193), and is not approval |
| Approval effect | None; the record is exactly `unapproved`, and separate immutable sign-offs are required |

### Evidence

| Reference | Strength | What it establishes | What it does not establish |
|---|---|---|---|
| [PR #43](https://github.com/kattsushi/omarchy-supplement/pull/43) and [feature commit `5b22126c0aea50816d3ae531c174e898c105b016`](https://github.com/kattsushi/omarchy-supplement/commit/5b22126c0aea50816d3ae531c174e898c105b016) | delivery context | The empty acquisition-verification structural draft and contract are available as a feature candidate | Merge, approval, readiness, native authenticity, trusted-verifier authority, or production activation |
| [Verification port and outcomes](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L7-L10) | structural | Bounded provider report categories | Verification policy or threshold |
| [Verification service boundary](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L61-L66) | structural | Verification is a separate required capability | An approved verifier |
| [Outcome handling](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/services/package-execution.ts#L114-L127) | structural | Non-provider-reported outcomes require reassessment | Correct native acquisition verification |
| [Outcome matrix tests](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/application/package-execution.test.ts#L154-L170) | fixture | Deterministic outcome-strength separation | Native baseline or post-effect proof |
| [Sandbox bounded outcomes](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/integration/provider-execution-sandbox.test.ts#L94-L109) | fixture | Fake partial/failure/timeout/malformed outcomes do not mutate a sentinel | Native provider or workstation state |
| [Verification requirements](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md#L70-L76) | policy draft | Baseline, threshold, freshness, and independence requirements | An approved verification policy |
| [Production verifier](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/composition/mutation.ts#L16-L26) | unavailable | Production verification stays typed-unavailable | Independently verified acquisition |
| [Acquisition-verification registry and resolver](https://github.com/kattsushi/omarchy-supplement/blob/5b22126c0aea50816d3ae531c174e898c105b016/packages/workstation-orchestrator/src/domain/acquisition-verification.ts#L1-L132) | structural | Exact scope and plan/request binding; command, provider-policy, mapping-catalog, mapping-entry, and verification-policy digests; canonical integrity and approval-subject digests; lifecycle, approval, evidence-size, freshness, ambiguity, recovery, and success-shape checks; strict runtime-domain rejection | Authentic reviewers, authentic native observations, trusted-verifier authority, or a successful/ready acquisition result |
| [Empty acquisition-verification draft](https://github.com/kattsushi/omarchy-supplement/blob/5b22126c0aea50816d3ae531c174e898c105b016/packages/workstation-orchestrator/src/infrastructure/verification/draft-acquisition-verification.ts#L1-L7) | structural | Version `0.1.0` is an integrity-valid empty `draft` with no preparer, required approvals, approvals, or entries | An approved policy, evidence entry, verifier adapter/port implementation, native evidence, production wiring, or readiness |
| [Acquisition-verification tests](https://github.com/kattsushi/omarchy-supplement/blob/5b22126c0aea50816d3ae531c174e898c105b016/packages/workstation-orchestrator/tests/domain/acquisition-verification.test.ts#L1-L160) | structural | Synthetic tests exercise exact scope/binding and plan-policy-mapping-evidence semantics, approval-subject invalidation, identity/evidence/provenance namespaces, role and evidence independence, pre/post coherence, fail-closed outcomes, exotic runtime rejection, and absence from production composition | A receipt, native or authentic evidence, trusted verification, governance approval, or production readiness |
| Ordinary candidate verification | structural | At feature commit `5b22126c0aea50816d3ae531c174e898c105b016`, the focused suite passed 95 tests, the full package suite passed 360 tests, typecheck passed, and `git diff --check` passed; 13 namespace/role/digest probes and 58 binding/runtime probes also passed | An RDD receipt or review, native/authentic evidence, trusted-verifier authority, external sign-off, approval, or readiness |

### Structural Semantics

- Scope is exact across provider, capability, platform, architecture, provider
  version, and package kind. Binding is exact across plan and request identity,
  plan binding, command, provider policy, mapping catalog, mapping entry, and
  verification policy digests.
- Canonical registry integrity excludes only the registry digest. Canonical
  approval subjects exclude approval arrays, subject/sign-off fields, and the
  registry digest, so changes to plan, policy, mapping, scope, or evidence
  semantics invalidate the corresponding approval subject.
- Governance identities use `identity:*`; observation IDs use `evidence:*`; and
  provenance references use `provenance:*`. Governance roles are pairwise
  independent except that one Product Policy Owner may own the registry and its
  entry. Preparers, external reviewers, and pre/post observers cannot reuse a
  governance identity; pre/post observers and evidence IDs must differ.
- Pre/post provenance references must differ, and all six provenance, artifact,
  and output digests must be globally distinct. Pre-state must be absent,
  post-state present, and package identity, version, location, requested set,
  observed set, freshness, evidence ceiling, outcome, and side effects must agree
  exactly with the request and policy.
- Even a synthetically complete structural candidate terminates as
  `available: false`, `independent-verification-required`, authenticity
  `not-established`, and authority `trusted-external-verifier-required`. Native
  and structural labels alone cannot create a success or readiness path.
- Sparse, subclassed, prototype-bearing, null-prototype, accessor-backed,
  symbol-bearing, cyclic, over-keyed, and otherwise non-canonical runtime values
  fail closed without mutating the input.

### Acceptance-Criteria Mapping

| Criterion | Current state |
|---|---|
| Provider/capability-specific pre-effect baseline | Structurally modeled and tested; no native baseline, authentic observation, or entry exists |
| Independent post-effect checks and success threshold | Structurally modeled and tested; no trusted verifier, native post-effect observation, approved threshold, or success/readiness path exists |
| Exact plan, policy, mapping, scope, and evidence binding | Structurally enforced and tested, including approval-subject invalidation; no authentic evidence or approved entry exists |
| Identity namespaces and role/evidence independence | Structurally enforced and tested; Evidence Owner and Independent Verification Reviewer remain unassigned and unsigned |
| Partial, unknown, timeout, truncation, disagreement, and ambiguous outcomes | Fail closed structurally; no native outcome observations or approved policy exist |
| Freshness, evidence limits, reassessment, retry, recovery, audit, and privacy rules | Structurally modeled and tested; no trusted runtime adapter, audit authority, or authentic evidence exists |
| Production composition and activation | Blocked; the draft has no entries, trusted verifier, adapter/port implementation, or wiring, and production remains typed-unavailable |

### Missing Evidence, Decisions, and Approvers

- Ownership and sign-off: Evidence Owner and Independent Verification Reviewer are
  unassigned; their separate immutable sign-offs are absent. Product Policy Owner
  preparation is not either sign-off and is not approval.
- Authenticity and native evidence: reviewer authenticity, authentic baseline and
  post-effect observations, provider/capability native evidence, and trusted
  independence proof are absent.
- Runtime and authority: no trusted verifier, acquisition-verification runtime
  adapter/port implementation, production wiring, or governance-owned audit and
  reviewer-authenticity authority exists. Production remains typed-unavailable.
- Policy content: the draft contains no entries. Native threshold rationale,
  freshness observations, timeout/truncation cases, evidence-size observations,
  replay/audit lineage, and reproducible native evidence digests are absent.
- Blocked work: Task 9A.1, Task 9B, and final whole-change `sdd-verify` remain
  blocked.

### Stop Conditions

- Stop if provider exit success, source shape, tests, fixtures, or sandbox output is
  treated as independent native acquisition verification.
- Stop on missing baseline, non-independent checks, stale/oversized evidence, unclear
  thresholds, partial/unknown promotion, or unresolved timeout/truncation behavior.
- Stop at `independent-verification-required`; structural eligibility, a `native`
  label, Product Policy Owner preparation, PR #43, and feature commit
  `5b22126c0aea50816d3ae531c174e898c105b016` do not establish authenticity,
  approval, merge, readiness, or execution authority.
- Stop until the Evidence Owner and Independent Verification Reviewer are assigned
  and sign this record separately through a trusted external verification path.

## Integrity Index

The first table covers committed blob bytes at base revision
`e0543f330dda46680ecd18eb394ffbeb613200a9`. The mapping-catalog table covers
committed blob bytes at feature candidate revision
`2884b54d34ba09f1ad2a3a26c33ff972025c33a9`. The Omarchy command-policy table
covers committed blob bytes at candidate revision
`9fb0fe191d67bda54663b00a8768120833ec9a6f`. The Homebrew command-policy table
covers every materially supporting PR #41 artifact at candidate revision
`bd1ddf0ce7294dfe73d01cdc890a0838d1e2d8c7`. The acquisition-verification table
covers all three PR #43 feature artifacts at feature revision
`5b22126c0aea50816d3ae531c174e898c105b016`. All values are independently
double-verified lowercase SHA-256 over committed blob bytes.

| Committed file | SHA-256 |
|---|---|
| `packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md` | `4ee52b9312318ece026129a976fb5353623226b84f44cb26b24342e1ba67c171` |
| `packages/workstation-orchestrator/src/application/ports/package-execution.ts` | `0bcfe714ed80ec52b697a1c1cd122553b6885957d6dec1da92dc195a4b0057f5` |
| `packages/workstation-orchestrator/src/application/services/package-execution.ts` | `92f69dc462d3c8ab89766ca4f50136a3cfe29d16b31674a471fb4846eb6bf00b` |
| `packages/workstation-orchestrator/src/infrastructure/platform/fixtures.ts` | `f4c417ee603a78712224319bc872d6c4e5a3062b7d7cab4c0b76264d103d75d5` |
| `packages/workstation-orchestrator/src/infrastructure/providers/sandboxed-package-execution.ts` | `5e5cdfc85af5b36a5acf354ec7be17868a1c75be7c450dfc6fe4b7906490c085` |
| `packages/workstation-orchestrator/src/composition/mutation.ts` | `ce27e03a4b042da636ebdc6a7cc22c321aa1e60c6c1aa5f553206b72f696c206` |
| `packages/workstation-orchestrator/tests/application/package-execution.test.ts` | `15b2d1b8a37dc2695b55f3ec7c83aab132c4d56952c6f8ee979675fa689e583c` |
| `packages/workstation-orchestrator/tests/infrastructure/fixture-parsers.test.ts` | `83893c4f9cbccd940d10fa295bec7535e112dd33e1cbd2fa4b6f08ee3e167cdc` |
| `packages/workstation-orchestrator/tests/integration/provider-execution-sandbox.test.ts` | `c242493df72a6fcb80c2310e8e969664c47ac99e02272edc7473e29a00be1add` |
| `packages/workstation-orchestrator/tests/privacy/package-execution-boundaries.test.ts` | `0e29b2c47433e1d7fe14cd7fe6f93671b1ec4f8ecea9f8cc7b5c89079047fa3f` |

| Mapping-catalog candidate file | SHA-256 |
|---|---|
| `packages/workstation-orchestrator/src/domain/mapping-catalog.ts` | `0743972daffebb2e346bf376ad7fb910c0375cdc772244243c54fb80e77aa5c8` |
| `packages/workstation-orchestrator/src/infrastructure/mappings/catalog-mapping-port.ts` | `ca2ad9c5a7502c7b13719c753dad90407dccd8fd4535cb18eb37a57446fde808` |
| `packages/workstation-orchestrator/src/infrastructure/mappings/draft-mapping-catalog.ts` | `ad5607bf45e2c2372fab1744babd51002f82cd91d09994d6cb58fe745a00c272` |
| `packages/workstation-orchestrator/tests/domain/mapping-catalog.test.ts` | `c4cf90778f0130ad642da5174337baac2acbdc98365922cd9173a1b12f719ca8` |

| Omarchy command-policy candidate file | SHA-256 |
|---|---|
| `packages/workstation-orchestrator/src/domain/omarchy-command-policy.ts` | `d232c51b9b1be598b0613eee13e2100f6341f251a381fddb3183428d788c97a8` |
| `packages/workstation-orchestrator/src/infrastructure/providers/draft-omarchy-command-policy.ts` | `c6a2a55f62eb0fa89cf1b835eb87e3b6ad6b733116b495abc2411fb1cad595ea` |
| `packages/workstation-orchestrator/tests/domain/omarchy-command-policy.test.ts` | `ad7c4c8a09e235948c2d43b6ec60595c0f40b2b6b2f18ca5f3f970343f166fa7` |

| Homebrew command-policy candidate file | SHA-256 |
|---|---|
| `packages/workstation-orchestrator/src/domain/homebrew-command-policy.ts` | `52f0ac06ec49a3adad630581c10e538f7bd3c67009eeee957eb86031a6fd5145` |
| `packages/workstation-orchestrator/src/domain/provider-command-policy.ts` | `accfe03f732eaad1ff65d4f331f0ae634a4a76d345529fcaf977ba8e8d6cb9e1` |
| `packages/workstation-orchestrator/src/infrastructure/providers/draft-homebrew-command-policy.ts` | `ae3837a9435d01f3f80465a000ce6a7edee12c7f4eb0dc9080b10fd30bc6e64e` |
| `packages/workstation-orchestrator/tests/domain/homebrew-command-policy.test.ts` | `8632be0578cb5f0713ff0ace03f9cd1fe72d9d8e02892d87feafe6580f30faab` |
| `packages/workstation-orchestrator/tests/domain/omarchy-command-policy.test.ts` | `b10fbadc450bea00b31f11169a69d5badc69e0c3992fba835de49ca1f48ef6b0` |

| Acquisition-verification feature file | SHA-256 |
|---|---|
| `packages/workstation-orchestrator/src/domain/acquisition-verification.ts` | `0d31ee11927b4ff3403f3a0be9921bc79a930ce6fb9ce19f64bca235fd92937f` |
| `packages/workstation-orchestrator/src/infrastructure/verification/draft-acquisition-verification.ts` | `7ca8185a3ae6e690da9e0a6edcb6d51f1a9e791c896716e7e6ffe22bbd60a148` |
| `packages/workstation-orchestrator/tests/domain/acquisition-verification.test.ts` | `e83a2c3dcdc875308b125448cd14d5d0f43fae312daaa76c590087c6f45fba3a` |

## Blocking State

- Task 9A.1 is blocked: all four records are `unapproved`, required native evidence
  is unavailable, and separate sign-offs are missing.
- Task 9B is blocked behind Task 9A.1 and its own configuration evidence,
  confirmation, backup, ownership, and mutation-scope decisions.
- Final whole-change `sdd-verify` is blocked until all required tasks, evidence,
  decisions, external reviews, and separate sign-offs are complete.

This inventory is passive structural documentation under ordinary repository policy.
It creates no RDD attempt, receipt, review authority, approval, or execution path.
