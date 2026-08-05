import * as Effect from "effect/Effect";
import * as Result from "effect/Result";
import { createReadOnlyRuntime } from "../../composition/runtime.js";
import { readOnlyLayer, ReadOnlyRequestService } from "../../composition/read-only.js";
import { encodePublicResult } from "./public-result-encoder.js";
import { decodeAgentRequest } from "./agent-request-decoder.js";
import { classifyRoute } from "./effect-cli-adapter.js";
import { exitCodeFor } from "./exit-codes.js";

const invalid = (correlationId = "request:invalid") => ({
  version: "PublicResultV2" as const, operation: "assess_workstation" as const, status: "invalid-request" as const, correlationId,
  payload: { kind: "unavailable" as const, operation: "assess_workstation" as const, reason: "source-unavailable" as const }, blockers: [{ code: "invalid-request" as const }], evidence: [], nextActions: [],
});

const readFrame = async (): Promise<Uint8Array> => {
  const chunks: Uint8Array[] = [];
  for await (const chunk of Bun.stdin.stream()) chunks.push(chunk);
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const frame = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { frame.set(chunk, offset); offset += chunk.length; }
  return frame;
};

export const runWorkstation = async (argv: readonly string[], read = readFrame): Promise<number> => {
  const route = classifyRoute(argv);
  if (route.kind === "help" || route.kind === "tui" || route.kind === "invalid") {
    const response = invalid();
    process.stdout.write(encodePublicResult(response));
    return exitCodeFor(response.status);
  }
  const decoded = decodeAgentRequest(await read());
  if (Result.isFailure(decoded)) {
    const response = invalid();
    process.stdout.write(encodePublicResult(response));
    return exitCodeFor(response.status);
  }
  const runtime = createReadOnlyRuntime(readOnlyLayer);
  try {
    const result = await runtime.runPromise(Effect.gen(function*() { return yield* (yield* ReadOnlyRequestService).dispatch(decoded.success); }));
    process.stdout.write(encodePublicResult(result));
    return exitCodeFor(result.status);
  } finally { await runtime.dispose(); }
};

if (import.meta.main) process.exit(await runWorkstation(Bun.argv.slice(2)));
