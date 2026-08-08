import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PlanDigestService } from "../domain/plans.js";
import {
  BackupStatusPort,
  EvidenceStatusPort,
  ObservationUnavailable,
  PackageMappingPort,
  PlatformFactsPort,
  ProviderDiscoveryPort,
} from "../application/ports/workstation.js";
import { AssessWorkstation, PlanPackageAcquisition } from "../application/services/workstation.js";
import { AgentRequestDispatcher, boundAgentRequestDispatcherLayer } from "../presentation/cli/operation-dispatcher.js";
import { makeOperationRegistry, makeReadOnlyOperationHandlers, OperationRegistry } from "../application/contracts/operation-registry.js";
import type { AgentRequest } from "../application/contracts/agent-request.js";
import type { PublicResult } from "../application/contracts/public-result.js";

export interface ReadOnlyRequestServiceShape {
  readonly dispatch: (request: AgentRequest) => Effect.Effect<PublicResult, never>;
}

export class ReadOnlyRequestService extends Context.Service<ReadOnlyRequestService, ReadOnlyRequestServiceShape>()("ReadOnlyRequestService", {
  make: Effect.gen(function*() {
    const dispatcher = yield* AgentRequestDispatcher;
    return { dispatch: dispatcher.dispatch };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

type ReadOnlyPorts = PlatformFactsPort | EvidenceStatusPort | BackupStatusPort | ProviderDiscoveryPort | PackageMappingPort;

export const makeReadOnlyLayer = <R, E>(ports: Layer.Layer<ReadOnlyPorts, E, R>) => {
  const services = Layer.mergeAll(
    Layer.provide(AssessWorkstation.layer, ports),
    Layer.provide(PlanPackageAcquisition.layer, Layer.merge(ports, PlanDigestService.layer)),
  );
  const registry = Layer.provide(Layer.effect(OperationRegistry, Effect.gen(function*() {
    const digest = yield* PlanDigestService;
    const planning = yield* PlanPackageAcquisition;
    const backupStatus = yield* BackupStatusPort;
    return makeOperationRegistry(makeReadOnlyOperationHandlers(yield* AssessWorkstation, {
      plan: (request) => planning.plan(request).pipe(Effect.provideService(PlanDigestService, digest)),
    }, { backups: () => backupStatus.visibility }));
  })), Layer.mergeAll(services, ports, PlanDigestService.layer));
  const requestService = Layer.provide(ReadOnlyRequestService.layer, Layer.provide(boundAgentRequestDispatcherLayer, registry));
  return Layer.mergeAll(services, requestService);
};

const unavailable = (subject: ObservationUnavailable["subject"]) => Effect.fail(new ObservationUnavailable({ subject, reasonCode: "source-unavailable" }));
const unavailablePorts = Layer.mergeAll(
  Layer.succeed(PlatformFactsPort, { facts: unavailable("platform") }),
  Layer.succeed(EvidenceStatusPort, { forProgram: () => unavailable("evidence") }),
  Layer.succeed(BackupStatusPort, { visibility: unavailable("evidence") }),
  Layer.succeed(ProviderDiscoveryPort, { discover: () => unavailable("provider") }),
  Layer.succeed(PackageMappingPort, { map: () => unavailable("mapping") }),
);

/** Runtime default: real read-only services with explicit unavailable sources, never generic handlers. */
export const readOnlyLayer = makeReadOnlyLayer(unavailablePorts);
