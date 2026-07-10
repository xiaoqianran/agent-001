import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Architecture boundary: cognition and agent must not depend on @gss/world
 * (no World write path / storage).
 */
describe("package dependency boundary", () => {
  it("cognition package.json does not depend on @gss/world", () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.resolve(here, "../package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(pkg.dependencies?.["@gss/world"]).toBeUndefined();
  });

  it("agent package.json does not depend on @gss/world", () => {
    const agentPkg = JSON.parse(
      fs.readFileSync(path.resolve(here, "../../agent/package.json"), "utf8"),
    ) as { dependencies?: Record<string, string> };
    expect(agentPkg.dependencies?.["@gss/world"]).toBeUndefined();
  });

  it("cognition source does not import @gss/world", () => {
    const srcDir = path.resolve(here);
    const files = fs.readdirSync(srcDir).filter((f) => f.endsWith(".ts"));
    for (const f of files) {
      if (f.endsWith(".test.ts")) continue;
      const text = fs.readFileSync(path.join(srcDir, f), "utf8");
      expect(text).not.toMatch(/from\s+["']@gss\/world["']/);
      expect(text).not.toMatch(/WorldAuthority/);
    }
  });
});
