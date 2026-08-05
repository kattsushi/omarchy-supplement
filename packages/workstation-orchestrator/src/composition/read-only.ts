import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { PlanDigestService } from "../domain/plans.js";
import {
  BackupStatusPort,
  EvidenceStatusPort,
  PackageMappingPort,
  PlatformFactsPort,
  ProviderDiscoveryPort,
} from "../application/ports/workstation.js";
import { AssessWorkstation, PlanPackageAcquisition } from "../application/services/workstation.js";
import { AgentRequestDispatcher } from "../presentation/cli/operation-dispatcher.js";
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

export const readOnlyLayer = Layer.provide(ReadOnlyRequestService.layer, AgentRequestDispatcher.layer);

type ReadOnlyPorts = PlatformFactsPort | EvidenceStatusPort | BackupStatusPort | ProviderDiscoveryPort | PackageMappingPort;

export const makeReadOnlyLayer = <R, E>(ports: Layer.Layer<ReadOnlyPorts, E, R>) => Layer.mergeAll(
  Layer.provide(AssessWorkstation.layer, ports),
  Layer.provide(PlanPackageAcquisition.layer, Layer.merge(ports, PlanDigestService.layer)),
  readOnlyLayer,
);
