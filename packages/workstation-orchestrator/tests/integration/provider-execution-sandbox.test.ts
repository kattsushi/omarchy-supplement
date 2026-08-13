import { afterEach, describe, expect, it } from "vitest";
import * as Effect from "effect/Effect";
import { access, chmod, constants, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HomebrewExecutionPort, OmarchyExecutionPort, type HomebrewExecutionInput, type OmarchyExecutionInput, type OmarchyPackagePlan } from "../../src/application/ports/package-execution.js";
import { sandboxedHomebrewExecutionLayer, sandboxedOmarchyExecutionLayer } from "../../src/infrastructure/providers/sandboxed-package-execution.js";
import { createPlanBinding, PlanDigestService, type PackagePlan, type PlanBindingInput } from "../../src/domain/plans.js";

const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });
const digest = async (path: string) => Buffer.from(await crypto.subtle.digest("SHA-256", await readFile(path))).toString("hex");
const sandbox = async (mode: "success" | "partial" | "failure" | "timeout" | "malformed" | "unverifiable") => {
  const root = await mkdtemp(join(tmpdir(), "workstation-provider-"));
  roots.push(root);
  const paths = { root, home: `${root}/home`, xdgConfigHome: `${root}/xdg/config`, xdgCacheHome: `${root}/xdg/cache`, xdgDataHome: `${root}/xdg/data`, xdgStateHome: `${root}/xdg/state`, cwd: `${root}/cwd`, bin: `${root}/bin`, capture: `${root}/capture.json`, sentinel: `${root}/sentinel`, timeoutMs: mode === "timeout" ? 50 : 1_000 };
  await Promise.all([paths.home, paths.xdgConfigHome, paths.xdgCacheHome, paths.xdgDataHome, paths.xdgStateHome, paths.cwd, paths.bin].map((path) => mkdir(path, { recursive: true })));
  await writeFile(paths.sentinel, "host-state-must-not-change\n");
  const fixture = `#!${process.execPath}\nconst { writeFile } = require('node:fs/promises');\nconst mode = ${JSON.stringify(mode)};\n(async () => {\nawait writeFile(process.env.CAPTURE_FILE, JSON.stringify({ executable: require('node:path').basename(process.argv[1]), argv: process.argv.slice(2), cwd: process.cwd(), home: process.env.HOME, path: process.env.PATH }));\nif (mode === 'timeout') await new Promise((resolve) => setTimeout(resolve, 200));\nif (mode === 'malformed') { console.log('not-json'); process.exit(0); }\nif (mode === 'failure') { console.log(JSON.stringify({ kind: 'failed', reason: 'exit', evidenceIds: [] })); process.exit(9); }\nconsole.log(JSON.stringify(mode === 'partial' ? { kind: 'partial', evidenceIds: ['evidence:partial'] } : mode === 'unverifiable' ? { kind: 'unverifiable', evidenceIds: ['evidence:weak'] } : { kind: 'provider-reported', evidenceIds: ['evidence:provider'] }));\n})().catch(() => process.exit(10));\n`;
  for (const name of ["omarchy", "brew"]) { await writeFile(`${paths.bin}/${name}`, fixture); await chmod(`${paths.bin}/${name}`, 0o700); }
  return paths;
};
const binding = (provider: "omarchy" | "homebrew"): PlanBindingInput => ({
  operation: "package-acquisition", logicalRequestIds: ["program:neovim"], platformObservationDigest: "observation:sandbox", profilePolicyDigest: "policy:sandbox",
  provider, providerRole: provider === "omarchy" ? "primary" : "fallback", providerPolicy: { id: `policy:${provider}`, version: "1" },
  capabilityId: provider === "omarchy" ? "omarchy-pkg-add" : "homebrew-formula", mappingIds: [`mapping:${provider}-neovim`],
  packageStateDigests: ["state:missing"], verificationPolicyId: "verification:sandbox", riskCodes: ["network"], fallbackOptIn: provider === "homebrew",
});
const packagePlan = async (provider: "omarchy" | "homebrew") => Effect.runPromise(Effect.map(createPlanBinding(binding(provider)), (plan): PackagePlan => ({
  plan, blockers: [], nextActions: [], acquisitionDoesNotVerifyConfiguration: true, acquisitionDoesNotVerifyDotfileStow: true,
})).pipe(Effect.provide(PlanDigestService.layer)));
const config = (paths: Awaited<ReturnType<typeof sandbox>>, provider: "omarchy" | "homebrew") => ({
  sandboxRoot: paths.root, executable: `${paths.bin}/${provider === "omarchy" ? "omarchy" : "brew"}`, cwd: paths.cwd, timeoutMs: paths.timeoutMs,
  env: { HOME: paths.home, XDG_CONFIG_HOME: paths.xdgConfigHome, XDG_CACHE_HOME: paths.xdgCacheHome, XDG_DATA_HOME: paths.xdgDataHome, XDG_STATE_HOME: paths.xdgStateHome, PATH: paths.bin, CAPTURE_FILE: paths.capture },
});

describe("sandboxed provider execution adapters", () => {
  it.each([["omarchy", ["omarchy", "pkg", "add", "neovim"]], ["homebrew", ["brew", "install", "neovim"]]] as const)("executes only the fixture %s argv in an isolated environment", async (provider, argv) => {
    const paths = await sandbox("success");
    const sentinelBefore = await digest(paths.sentinel);
    const plan = await packagePlan(provider);
    const command = { provider, policyId: plan.plan.binding.providerPolicy.id, argv } as const;
    const outcome = provider === "omarchy"
      ? await Effect.runPromise(Effect.flatMap(OmarchyExecutionPort, (port) => port.execute({ plan, command } as OmarchyExecutionInput)).pipe(Effect.provide(sandboxedOmarchyExecutionLayer(config(paths, provider)))))
      : await Effect.runPromise(Effect.flatMap(HomebrewExecutionPort, (port) => port.execute({ plan, command } as HomebrewExecutionInput)).pipe(Effect.provide(sandboxedHomebrewExecutionLayer(config(paths, provider)))));
    expect(outcome).toEqual({ kind: "provider-reported", evidenceIds: ["evidence:provider"] });
    expect(JSON.parse(await readFile(paths.capture, "utf8"))).toEqual({ executable: provider === "omarchy" ? "omarchy" : "brew", argv: argv.slice(1), cwd: paths.cwd, home: paths.home, path: paths.bin });
    expect(await digest(paths.sentinel)).toBe(sentinelBefore);
  });

  it.each([["partial", "partial"], ["failure", "failed"], ["timeout", "timed-out"], ["malformed", "malformed"], ["unverifiable", "unverifiable"]] as const)("returns a bounded %s outcome without retry or rollback", async (mode, expected) => {
    const paths = await sandbox(mode);
    const sentinelBefore = await digest(paths.sentinel);
    const plan = await packagePlan("omarchy");
    const input: OmarchyExecutionInput = { plan: plan as OmarchyPackagePlan, command: { provider: "omarchy", policyId: plan.plan.binding.providerPolicy.id, argv: ["omarchy", "pkg", "add", "neovim"] } };
    const outcome = await Effect.runPromise(Effect.flatMap(OmarchyExecutionPort, (port) => port.execute(input)).pipe(Effect.provide(sandboxedOmarchyExecutionLayer(config(paths, "omarchy")))));
    expect(outcome.kind).toBe(expected);
    expect(outcome.evidenceIds.length).toBeLessThanOrEqual(8);
    expect(await digest(paths.sentinel)).toBe(sentinelBefore);
  });

  it("refuses executables and working directories outside the sandbox", async () => {
    const paths = await sandbox("success");
    const plan = await packagePlan("omarchy");
    const input: OmarchyExecutionInput = { plan: plan as OmarchyPackagePlan, command: { provider: "omarchy", policyId: plan.plan.binding.providerPolicy.id, argv: ["omarchy", "pkg", "add", "neovim"] } };
    const result = await Effect.runPromise(Effect.flip(
      Effect.flatMap(OmarchyExecutionPort, (port) => port.execute(input)).pipe(
        Effect.provide(sandboxedOmarchyExecutionLayer({ ...config(paths, "omarchy"), executable: "/usr/bin/true" })),
      ),
    ));
    expect(result.reason).toBe("sandbox-boundary");
    await expect(access(paths.capture, constants.F_OK)).rejects.toThrow();
  });
});
