import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

describe("storage CLI module loading", () => {
  it("loads shared schemas in native Node without Next.js aliases or cloud access", () => {
    const result = spawnSync(process.execPath, ["--input-type=module", "-e", "await import('./lib/db/schemas.ts'); await import('./lib/notes/schema.ts');"], {
      cwd: process.cwd(), encoding: "utf8", windowsHide: true,
    });
    expect(result.status, result.stderr).toBe(0);
  });
});
