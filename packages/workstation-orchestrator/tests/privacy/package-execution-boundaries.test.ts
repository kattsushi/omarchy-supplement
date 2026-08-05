import { describe, expect, it } from "vitest";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { mutationUnavailableLayer } from "../../src/composition/mutation.js";

const sourceRoot = new URL("../../src/", import.meta.url).pathname;
const filesBelow = async (root: string): Promise<string[]> => (await Promise.all((await readdir(root, { withFileTypes: true })).map((entry) => entry.isDirectory()
  ? filesBelow(join(root, entry.name))
  : Promise.resolve([join(root, entry.name)])))).flat();

describe("package execution capability boundaries", () => {
  it("keeps executors out of readOnlyLayer, CLI, TUI, and public operation contracts", async () => {
    const roots = ["composition/read-only.ts", "application/contracts", "presentation/cli", "presentation/tui", "presentation/atoms", "presentation/hooks"];
    const files = (await Promise.all(roots.map(async (relative) => {
      const path = join(sourceRoot, relative);
      return relative.endsWith(".ts") ? [path] : filesBelow(path);
    }))).flat();
    const contents = await Promise.all(files.map((path) => readFile(path, "utf8")));
    for (const content of contents) {
      expect(content).not.toMatch(/OmarchyExecutionPort|HomebrewExecutionPort|ExecutePackagePlan|sandboxed-package-execution|composition\/mutation/);
    }
  });

  it("exports a separate production mutation composition that remains typed-unavailable", () => {
    expect(mutationUnavailableLayer).toBeDefined();
    expect(String(mutationUnavailableLayer)).not.toContain("readOnlyLayer");
  });

  it("contains no shell-string execution, eval, retry, resume, rollback, sudo, or Homebrew installation path", async () => {
    const executionFiles = [
      "application/ports/package-execution.ts",
      "application/services/package-execution.ts",
      "infrastructure/providers/sandboxed-package-execution.ts",
      "composition/mutation.ts",
    ];
    const contents = await Promise.all(executionFiles.map((path) => readFile(join(sourceRoot, path), "utf8")));
    const joined = contents.join("\n");
    expect(joined).not.toMatch(/\beval\b|shell\s*:\s*(?:true|["'])|Effect\.retry|\bresume\s*\(|\brollback\s*\(|\bsudo\b|brew\s+install\s+brew/);
    expect(joined).not.toContain("Bun.$");
  });
});
