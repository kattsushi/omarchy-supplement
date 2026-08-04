import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as AtomSolid from "@effect/atom-solid";
import * as TuiPartsCore from "@tuiparts/core";
import * as TuiPartsSolid from "@tuiparts/solid";

const packageRoot = resolve(import.meta.dir, "../..");
const directDependencies = [
  "@effect/atom-solid", "@opentui/core", "@opentui/solid", "@tuiparts/core",
  "@tuiparts/solid", "effect", "fast-check", "solid-js", "typescript",
] as const;

describe("compatibility scaffold", () => {
  test("pins every direct dependency and exposes bounded scripts", () => {
    const manifestPath = resolve(packageRoot, "package.json");
    expect(existsSync(manifestPath)).toBe(true);
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as { dependencies: Record<string, string>; devDependencies: Record<string, string>; scripts: Record<string, string> };
    const versions = { ...manifest.dependencies, ...manifest.devDependencies };
    for (const dependency of directDependencies) {
      expect(versions[dependency]).toMatch(/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
    }
    expect(manifest.scripts.test).toBe("bun test");
    expect(manifest.scripts.typecheck).toBe("tsc --noEmit");
  });

  test("exposes the verified Atom Solid API and packaged TuiParts model", () => {
    for (const api of ["RegistryProvider", "useAtom", "useAtomValue", "useAtomSet", "useAtomMount", "useAtomRefresh"] as const) {
      expect(AtomSolid[api]).toBeFunction();
    }
    expect(Object.keys(TuiPartsCore).length).toBeGreaterThan(0);
    expect(Object.keys(TuiPartsSolid).length).toBeGreaterThan(0);
  });
});
