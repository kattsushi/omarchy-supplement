# Dependency provenance

## Resolution snapshot

- Retrieval date: 2026-08-04 UTC.
- Resolver: Bun 1.3.11 (`/usr/bin/bun`) with a worktree-local temporary `HOME`, XDG cache, and Bun cache.
- Registry: npm registry metadata queried with `bun pm view`; complete resolved graph and SHA-512 package integrities are frozen in `bun.lock`.
- Reproducible install: `bun install --cwd packages/workstation-orchestrator --frozen-lockfile --ignore-scripts`.
- No dependency lifecycle scripts were allowed during resolution (`--ignore-scripts`). No provider, workstation, HOME, Stow, backup, or Omarchy operation was invoked.

## Exact direct pins

| Package | Exact version | Registry/package-byte verification |
| --- | --- | --- |
| Bun runtime | 1.3.11 | `.bun-version`; `bun --version` |
| TypeScript | 5.9.3 | installed `package.json`; compatible with the TuiParts published TypeScript `^5.9.3` development constraint |
| Effect | 4.0.0-beta.102 | `@effect/atom-solid@4.0.0-beta.102` peer dependency is `^4.0.0-beta.102` |
| @effect/atom-solid | 4.0.0-beta.102 | installed package exports verified below |
| @opentui/core | 0.4.5 | exact release satisfies TuiParts `^0.4.3` peer range |
| @opentui/solid | 0.4.5 | exact release satisfies TuiParts `^0.4.3` peer range |
| solid-js | 1.9.12 | exact peer required by `@opentui/solid@0.4.5` and `@tuiparts/solid@0.0.5` |
| @tuiparts/core | 0.0.5 | MIT; npm tarball `https://registry.npmjs.org/@tuiparts/core/-/core-0.0.5.tgz` |
| @tuiparts/solid | 0.0.5 | MIT; npm tarball `https://registry.npmjs.org/@tuiparts/solid/-/solid-0.0.5.tgz` |
| fast-check | 4.9.0 | selected property-test dependency |
| bun-types | 1.3.11 | Bun/TypeScript test type definitions |

All direct entries in `package.json` use exact versions; no `^`, `~`, tag, workspace, or override range is present.

## Installed-byte compatibility results

- `@effect/atom-solid@4.0.0-beta.102` declares peers `effect: ^4.0.0-beta.102` and `solid-js: >=1 <2`; the installed pins satisfy both.
- Its installed `dist/index.d.ts`, `dist/Hooks.d.ts`, and `dist/RegistryContext.d.ts` export `RegistryProvider`, `useAtom`, `useAtomValue`, `useAtomSet`, `useAtomMount`, and `useAtomRefresh`. The contract test imports the package and verifies each is a function.
- TuiParts uses the published package model: `@tuiparts/core@0.0.5` exposes framework-agnostic terminal primitives, and `@tuiparts/solid@0.0.5` exposes the Solid adapter and depends on `@tuiparts/core`. Their `^0.4.3` OpenTUI peers are satisfied by the exact 0.4.5 pins. No source was copied.
- Installed manifest SHA-256 values: `@tuiparts/core` `37370fa0ec21403d57bda6dd9c4ea7b8ce6673b594617e9bb0ebb84db97e32a7`; `@tuiparts/solid` `8d8b9e2800daa7fb3bb97fe7a7606c3654f8e2e6e47b351d1199a2dc52112339`; `@effect/atom-solid` `7d9127436360da93f4a3cb5b35f8883c3ff1cccc84f560c8839d770a7c6da731`.
- Tarball integrity for every direct and transitive dependency is recorded in `bun.lock`; no copied-source/registry revision applies because this scaffold consumes packaged dependencies only.
