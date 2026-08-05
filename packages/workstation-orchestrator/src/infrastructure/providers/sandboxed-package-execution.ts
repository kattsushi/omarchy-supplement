import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { spawn } from "node:child_process";
import { realpath } from "node:fs/promises";
import {
  HomebrewExecutionPort,
  OmarchyExecutionPort,
  PackageExecutionUnavailable,
  type HomebrewExecutionInput,
  type OmarchyExecutionInput,
  type ProviderExecutionReport,
} from "../../application/ports/package-execution.js";

export type ProviderSandboxConfig = {
  readonly sandboxRoot: string;
  readonly executable: string;
  readonly cwd: string;
  readonly timeoutMs: number;
  readonly env: Readonly<Record<string, string>> & {
    readonly HOME: string;
    readonly XDG_CONFIG_HOME: string;
    readonly XDG_CACHE_HOME: string;
    readonly XDG_DATA_HOME: string;
    readonly XDG_STATE_HOME: string;
    readonly PATH: string;
  };
};

const unavailable = (reason: PackageExecutionUnavailable["reason"]) => new PackageExecutionUnavailable({ reason });
const inside = (root: string, path: string) => path === root || path.startsWith(`${root}/`);
const evidenceIds = (value: unknown): readonly string[] | undefined => Array.isArray(value) && value.length <= 8 && value.every((item) => typeof item === "string" && item.length <= 128) ? value : undefined;

const decodeReport = (stdout: string, exitCode: number): ProviderExecutionReport => {
  if (exitCode !== 0) return { kind: "failed", reason: "exit", evidenceIds: [] };
  try {
    const value: unknown = JSON.parse(stdout);
    if (value === null || typeof value !== "object") return { kind: "malformed", evidenceIds: [] };
    const record = value as Record<string, unknown>;
    const ids = evidenceIds(record.evidenceIds);
    if (ids === undefined) return { kind: "malformed", evidenceIds: [] };
    if (record.kind === "provider-reported" || record.kind === "partial" || record.kind === "unverifiable") return { kind: record.kind, evidenceIds: ids };
    if (record.kind === "failed" && (record.reason === "exit" || record.reason === "spawn")) return { kind: "failed", reason: record.reason, evidenceIds: ids };
    return { kind: "malformed", evidenceIds: [] };
  } catch {
    return { kind: "malformed", evidenceIds: [] };
  }
};

const validateSandbox = async (config: ProviderSandboxConfig, executableName: "omarchy" | "brew") => {
  const allowedEnvironment = new Set(["HOME", "XDG_CONFIG_HOME", "XDG_CACHE_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME", "PATH", "CAPTURE_FILE"]);
  if (Object.keys(config.env).some((key) => !allowedEnvironment.has(key)) || config.timeoutMs <= 0 || config.timeoutMs > 5_000) return false;
  const declaredPaths = [config.executable, config.cwd, config.env.HOME, config.env.XDG_CONFIG_HOME, config.env.XDG_CACHE_HOME, config.env.XDG_DATA_HOME, config.env.XDG_STATE_HOME, config.env.PATH];
  if (config.env.CAPTURE_FILE !== undefined) declaredPaths.push(config.env.CAPTURE_FILE);
  try {
    const root = await realpath(config.sandboxRoot);
    const resolved = await Promise.all(declaredPaths.map(async (path) => {
      try { return await realpath(path); }
      catch { return realpath(path.slice(0, path.lastIndexOf("/"))); }
    }));
    return resolved.every((path) => inside(root, path)) && config.executable.endsWith(`/${executableName}`);
  } catch {
    return false;
  }
};

const run = (config: ProviderSandboxConfig, expectedExecutable: "omarchy" | "brew", argv: readonly string[]) => Effect.tryPromise({
  try: async (): Promise<ProviderExecutionReport> => {
    if (!await validateSandbox(config, expectedExecutable) || argv[0] !== expectedExecutable) throw unavailable("sandbox-boundary");
    const subprocess = spawn(config.executable, argv.slice(1), {
      cwd: config.cwd,
      env: { ...config.env },
      stdio: ["ignore", "pipe", "pipe"],
      shell: false,
    });
    return await new Promise<ProviderExecutionReport>((resolve, reject) => {
      let stdout = "";
      let oversized = false;
      subprocess.stdout.on("data", (chunk: Buffer) => {
        if (Buffer.byteLength(stdout) + chunk.length > 16 * 1024) oversized = true;
        else stdout += chunk.toString("utf8");
      });
      subprocess.on("error", reject);
      const timer = setTimeout(() => {
        subprocess.kill();
        resolve({ kind: "timed-out", evidenceIds: [] });
      }, config.timeoutMs);
      subprocess.on("close", (code) => {
        clearTimeout(timer);
        if (oversized) resolve({ kind: "malformed", evidenceIds: [] });
        else resolve(decodeReport(stdout.trim(), code ?? 1));
      });
    });
  },
  catch: (cause) => cause instanceof PackageExecutionUnavailable ? cause : unavailable("provider-adapter"),
});

export const sandboxedOmarchyExecutionLayer = (config: ProviderSandboxConfig) => Layer.succeed(OmarchyExecutionPort, {
  execute: (input: OmarchyExecutionInput) => input.plan.plan.binding.provider !== "omarchy" || input.command.policyId !== input.plan.plan.binding.providerPolicy.id
    ? Effect.fail(unavailable("capability-evidence"))
    : run(config, "omarchy", input.command.argv),
});

export const sandboxedHomebrewExecutionLayer = (config: ProviderSandboxConfig) => Layer.succeed(HomebrewExecutionPort, {
  execute: (input: HomebrewExecutionInput) => input.plan.plan.binding.provider !== "homebrew" || input.command.policyId !== input.plan.plan.binding.providerPolicy.id
    ? Effect.fail(unavailable("capability-evidence"))
    : run(config, "brew", input.command.argv),
});
