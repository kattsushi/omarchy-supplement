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
  ProfileInventoryPort,
  ProviderDiscoveryPort,
  SourceEvidencePort,
} from "../application/ports/workstation.js";
import { AssessWorkstation, PlanPackageAcquisition } from "../application/services/workstation.js";
import { AgentRequestDispatcher, boundAgentRequestDispatcherLayer } from "../presentation/cli/operation-dispatcher.js";
import { makeOperationRegistry, makeReadOnlyOperationHandlers, OperationRegistry } from "../application/contracts/operation-registry.js";
import type { AgentRequest } from "../application/contracts/agent-request.js";
import type { PublicResult } from "../application/contracts/public-result.js";
import { BashBridge } from "../application/ports/bash.js";
import { makeReadOnlyObservationAdapters } from "../infrastructure/read-only-observations/adapters.js";
import { bashBridgeLayer } from "../infrastructure/subprocess/argv.js";
import { workstationSourceProcessLayer } from "../infrastructure/subprocess/process.js";

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

type ReadOnlyPorts = PlatformFactsPort | ProfileInventoryPort | SourceEvidencePort | EvidenceStatusPort | BackupStatusPort | ProviderDiscoveryPort | PackageMappingPort;

export const makeReadOnlyLayer = <R, E>(ports: Layer.Layer<ReadOnlyPorts, E, R>) => {
  const services = Layer.mergeAll(
    Layer.provide(AssessWorkstation.layer, ports),
    Layer.provide(PlanPackageAcquisition.layer, Layer.merge(ports, PlanDigestService.layer)),
  );
  const registry = Layer.provide(Layer.effect(OperationRegistry, Effect.gen(function*() {
    const digest = yield* PlanDigestService;
    const planning = yield* PlanPackageAcquisition;
    const backupStatus = yield* BackupStatusPort;
    const platform = yield* PlatformFactsPort;
    const profiles = yield* ProfileInventoryPort;
    const evidence = yield* SourceEvidencePort;
    return makeOperationRegistry(makeReadOnlyOperationHandlers(yield* AssessWorkstation, {
      plan: (request) => planning.plan(request).pipe(Effect.provideService(PlanDigestService, digest)),
    }, { backups: () => backupStatus.visibility }, {
      platform: () => platform.facts,
      profiles: () => profiles.inventory,
      evidence: () => evidence.observations,
    }));
  })), Layer.mergeAll(services, ports, PlanDigestService.layer));
  const requestService = Layer.provide(ReadOnlyRequestService.layer, Layer.provide(boundAgentRequestDispatcherLayer, registry));
  return Layer.mergeAll(services, requestService);
};

const unavailable = (subject: ObservationUnavailable["subject"]) => Effect.fail(new ObservationUnavailable({ subject, reasonCode: "source-unavailable" }));
const sourcePorts = (result: Parameters<typeof makeReadOnlyObservationAdapters>[0]) => {
  const adapters = makeReadOnlyObservationAdapters(result);
  return Layer.mergeAll(
    Layer.succeed(PlatformFactsPort, adapters.platform),
    Layer.succeed(ProfileInventoryPort, adapters.profiles),
    Layer.succeed(SourceEvidencePort, adapters.sourceEvidence),
    Layer.succeed(EvidenceStatusPort, adapters.programEvidence),
    Layer.succeed(BackupStatusPort, { visibility: unavailable("evidence") }),
    Layer.succeed(ProviderDiscoveryPort, { discover: () => unavailable("provider") }),
    Layer.succeed(PackageMappingPort, { map: () => unavailable("mapping") }),
  );
};

export const makeSourceReadOnlyLayer = <R, E>(bridgeLayer: Layer.Layer<BashBridge, E, R>) => Layer.provide(
  Layer.effect(ReadOnlyRequestService, Effect.gen(function*() {
    const bridge = yield* BashBridge;
    return {
      dispatch: (request: AgentRequest) => Effect.flatMap(Effect.result(bridge.source({ form: "observe", profile: "profile:base" })), (result) => Effect.gen(function*() {
        return yield* (yield* ReadOnlyRequestService).dispatch(request);
      }).pipe(Effect.provide(makeReadOnlyLayer(sourcePorts(result))))),
    };
  })),
  bridgeLayer,
);

/** Runtime default: one fresh bounded source snapshot per read-only request. */
export const readOnlyLayer = makeSourceReadOnlyLayer(Layer.provide(bashBridgeLayer, workstationSourceProcessLayer));
