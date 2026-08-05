import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import {
  AcquisitionVerificationPort,
  HomebrewExecutionPort,
  OmarchyExecutionPort,
  PackageExecutionClockPort,
  PackageExecutionObservationPort,
  PackageExecutionPolicyPort,
  PackageExecutionUnavailable,
} from "../application/ports/package-execution.js";
import { ExecutePackagePlan } from "../application/services/package-execution.js";

const unavailable = (reason: PackageExecutionUnavailable["reason"]) => Effect.fail(new PackageExecutionUnavailable({ reason }));

const unavailablePorts = Layer.mergeAll(
  PackageExecutionClockPort.layer,
  Layer.succeed(PackageExecutionObservationPort, { reobserve: () => unavailable("capability-evidence") }),
  Layer.succeed(PackageExecutionPolicyPort, { commandFor: () => unavailable("mapping-evidence") }),
  Layer.succeed(AcquisitionVerificationPort, { verify: () => unavailable("verification-evidence") }),
  Layer.succeed(OmarchyExecutionPort, { execute: () => unavailable("provider-adapter") }),
  Layer.succeed(HomebrewExecutionPort, { execute: () => unavailable("provider-adapter") }),
);

/** Production remains unavailable until approved mapping, capability, and verification evidence are supplied. */
export const mutationUnavailableLayer = Layer.provide(ExecutePackagePlan.layer, unavailablePorts);
