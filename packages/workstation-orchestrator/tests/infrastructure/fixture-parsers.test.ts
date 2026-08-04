import { describe, expect, test } from "vitest";
import {
  parseHomebrewObservation,
  parseOmarchyObservation,
} from "../../src/infrastructure/platform/fixtures.js";

describe("fixture-only platform and provider parsers", () => {
  test("classifies known, future, malformed, conflicting, timed out, and truncated Omarchy observations", () => {
    expect(parseOmarchyObservation({ kind: "observed", output: "Omarchy 3.1.4" }).generation).toBe("omarchy-3");
    expect(parseOmarchyObservation({ kind: "observed", output: "Omarchy 4.0.0" }).generation).toBe("omarchy-4");
    expect(parseOmarchyObservation({ kind: "observed", output: "Omarchy 5.0.0" }).generation).toBe("unknown");
    expect(parseOmarchyObservation({ kind: "observed", output: "Omarchy 3.1\nOmarchy 4.0" }).generation).toBe("ambiguous");
    for (const input of [
      { kind: "missing" as const },
      { kind: "timeout" as const },
      { kind: "truncated" as const },
      { kind: "observed" as const, output: "release candidate" },
    ]) expect(parseOmarchyObservation(input).generation).not.toMatch(/omarchy-[34]/);
  });

  test("keeps Homebrew discovery descriptive and never creates an execution capability", () => {
    const macos = parseHomebrewObservation({ platform: "macos", kind: "present", packages: ["formula:neovim", "cask:ghostty"] });
    expect(macos.availability).toBe("present");
    expect(macos.capabilities.map((capability) => capability.kind)).toEqual(["homebrew-formula", "homebrew-cask"]);
    expect(parseHomebrewObservation({ platform: "linux", kind: "present", packages: ["formula:neovim"] }).capabilities).toEqual([]);
    expect(parseHomebrewObservation({ platform: "macos", kind: "missing", packages: [] }).availability).toBe("missing");
    expect(macos.capabilities.every((capability) => !("execute" in capability))).toBe(true);
  });
});
