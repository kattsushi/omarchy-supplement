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
| [Homebrew command type](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L17-L22) | structural | Closed scaffolded `brew install` argv shape | A supported native command |
| [Fixture Homebrew discovery](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/infrastructure/platform/fixtures.ts#L69-L100) | fixture | Fixture-only macOS capability descriptions | Native Homebrew capability evidence |
| [Fixture discovery tests](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/infrastructure/fixture-parsers.test.ts#L21-L28) | fixture | Fixtures never create an execution capability | Native package acquisition behavior |
| [Sandbox exact-argv test](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/integration/provider-execution-sandbox.test.ts#L73-L92) | fixture | Isolated fake executable receives exact fixture argv | A native Homebrew result |
| [Homebrew decision requirement](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md#L124-L136) | policy draft | Primary/fallback evidence and no-silent-switch requirement | An approved Homebrew policy |
| [Production provider port](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/composition/mutation.ts#L16-L26) | unavailable | Real Homebrew execution stays typed-unavailable | Production execution authority |

### Acceptance-Criteria Mapping

| Criterion | Current state |
|---|---|
| Exact platform/architecture/Homebrew version match | Not met; native evidence is unavailable |
| Formula/cask capability and exact reviewed argv | Not met; fixture descriptions are non-authorizing |
| Primary/fallback role and explicit opt-in | Structural planning exists; production policy approval is absent |
| Binary provenance and support window | Not met |

### Missing Evidence, Decisions, and Approvers

- Evidence: native macOS and approved Linux-fallback matrices, architecture, exact
  Homebrew/binary versions, formula/cask discovery, exact native argv/result,
  package identity, provenance, date, and reproducible evidence digest.
- Decisions: supported platforms and versions, formula/cask policy, primary versus
  fallback role, opt-in scope, prompt/network behavior, and support expiry.
- Missing approvers: named Homebrew platform/capability maintainer and named
  independent security command-policy reviewer.
- External reviewer roles: Homebrew platform reviewer and command-execution security
  reviewer.

### Stop Conditions

- Stop on fixture-only, structural, cross-platform, stale, or integrity-unverifiable
  evidence.
- Stop if fallback can be silent, Homebrew can be installed automatically, or the
  package role is ambiguous.
- Stop until both required external roles sign this record separately.

## EV-ACQUISITION-VERIFICATION-v0.1.0

| Field | Value |
|---|---|
| Status | `unapproved` |
| Accountable owner | `kattsushi` |
| Accepted role | Product Policy Owner, explicitly accepted by `kattsushi` in [issue #34 comment 5199374901](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199374901); distinct from the coordinator-only acceptance in [comment 5199220193](https://github.com/kattsushi/omarchy-supplement/issues/34#issuecomment-5199220193) |
| Approval effect | None; separate sign-off is required |

### Evidence

| Reference | Strength | What it establishes | What it does not establish |
|---|---|---|---|
| [Verification port and outcomes](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L7-L10) | structural | Bounded provider report categories | Verification policy or threshold |
| [Verification service boundary](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/ports/package-execution.ts#L61-L66) | structural | Verification is a separate required capability | An approved verifier |
| [Outcome handling](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/application/services/package-execution.ts#L114-L127) | structural | Non-provider-reported outcomes require reassessment | Correct native acquisition verification |
| [Outcome matrix tests](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/application/package-execution.test.ts#L154-L170) | fixture | Deterministic outcome-strength separation | Native baseline or post-effect proof |
| [Sandbox bounded outcomes](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/tests/integration/provider-execution-sandbox.test.ts#L94-L109) | fixture | Fake partial/failure/timeout/malformed outcomes do not mutate a sentinel | Native provider or workstation state |
| [Verification requirements](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/EXECUTION-GOVERNANCE.md#L70-L76) | policy draft | Baseline, threshold, freshness, and independence requirements | An approved verification policy |
| [Production verifier](https://github.com/kattsushi/omarchy-supplement/blob/e0543f330dda46680ecd18eb394ffbeb613200a9/packages/workstation-orchestrator/src/composition/mutation.ts#L16-L26) | unavailable | Production verification stays typed-unavailable | Independently verified acquisition |

### Acceptance-Criteria Mapping

| Criterion | Current state |
|---|---|
| Provider/capability-specific pre-effect baseline | Not met |
| Independent post-effect checks and success threshold | Not met |
| Partial, unknown, timeout, and truncation policy | Draft requirements and fixture behavior only |
| Freshness, evidence limits, and reassessment rules | Not met |
| Provider exit success cannot imply independent verification | Structural boundary exists; policy approval is absent |

### Missing Evidence, Decisions, and Approvers

- Evidence: provider/capability baseline and post-check matrix, native observations,
  independence proof, threshold rationale, freshness timestamps, truncation/timeout
  cases, maximum evidence size, and reproducible evidence digests.
- Decisions: success/partial/unverifiable thresholds, allowed outcome per threshold,
  freshness window, independence rule, evidence size, and reassessment behavior.
- Missing approvers: named product evidence-policy reviewer, named independent
  verification reviewer, and named security reviewer.
- External reviewer roles: acquisition-evidence method reviewer, provider-specific
  verification reviewer, and security reviewer.

### Stop Conditions

- Stop if provider exit success, source shape, tests, fixtures, or sandbox output is
  treated as independent native acquisition verification.
- Stop on missing baseline, non-independent checks, stale/oversized evidence, unclear
  thresholds, partial/unknown promotion, or unresolved timeout/truncation behavior.
- Stop until all three required external roles sign this record separately.

## Integrity Index

The first table covers committed blob bytes at base revision
`e0543f330dda46680ecd18eb394ffbeb613200a9`. The mapping-catalog table covers
committed blob bytes at feature candidate revision
`2884b54d34ba09f1ad2a3a26c33ff972025c33a9`. The Omarchy command-policy table
covers committed blob bytes at candidate revision
`9fb0fe191d67bda54663b00a8768120833ec9a6f`. All values are lowercase SHA-256.

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

## Blocking State

- Task 9A.1 is blocked: all four records are `unapproved`, required native evidence
  is unavailable, and separate sign-offs are missing.
- Task 9B is blocked behind Task 9A.1 and its own configuration evidence,
  confirmation, backup, ownership, and mutation-scope decisions.
- Final whole-change `sdd-verify` is blocked until all required tasks, evidence,
  decisions, external reviews, and separate sign-offs are complete.

This inventory is passive structural documentation under ordinary repository policy.
It creates no RDD attempt, receipt, review authority, approval, or execution path.
