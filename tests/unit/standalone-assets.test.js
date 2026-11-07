import { createRequire } from "node:module";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { mkdtempSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { copyStandaloneAssets } from "../../scripts/copy-standalone-assets.mjs";

const { copyDeepSeekPowAssets } = createRequire(import.meta.url)("../../cli/scripts/build-cli.js");

function createBuildFixture(distDir) {
  const projectRoot = mkdtempSync(join(tmpdir(), "9router-standalone-assets-"));
  const buildRoot = join(projectRoot, distDir);
  mkdirSync(join(buildRoot, "standalone"), { recursive: true });
  mkdirSync(join(buildRoot, "static", "chunks"), { recursive: true });
  mkdirSync(join(projectRoot, "public"), { recursive: true });
  writeFileSync(join(buildRoot, "static", "chunks", "app.js"), "static asset");
  writeFileSync(join(projectRoot, "public", "favicon.svg"), "public asset");
  return projectRoot;
}

describe("standalone build assets", () => {
  it("copies static and public assets into the default standalone layout", () => {
    const projectRoot = createBuildFixture(".next");

    copyStandaloneAssets({ projectRoot, distDir: ".next" });

    expect(readFileSync(join(projectRoot, ".next", "standalone", ".next", "static", "chunks", "app.js"), "utf8"))
      .toBe("static asset");
    expect(readFileSync(join(projectRoot, ".next", "standalone", "public", "favicon.svg"), "utf8"))
      .toBe("public asset");
  });

  it("uses a custom Next dist directory", () => {
    const projectRoot = createBuildFixture(".next-cli-build");

    copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" });

    expect(readFileSync(join(projectRoot, ".next-cli-build", "standalone", ".next-cli-build", "static", "chunks", "app.js"), "utf8"))
      .toBe("static asset");
  });

  it("copies DeepSeek PoW worker and sibling hash next to cwd-relative open-sse/lib", () => {
    const projectRoot = createBuildFixture(".next");
    mkdirSync(join(projectRoot, "open-sse", "lib"), { recursive: true });
    writeFileSync(join(projectRoot, "open-sse", "lib", "deepseek-pow-worker.mjs"), "worker");
    writeFileSync(join(projectRoot, "open-sse", "lib", "deepseek-pow-hash.js"), "hash");

    copyStandaloneAssets({ projectRoot, distDir: ".next" });

    expect(readFileSync(join(projectRoot, ".next", "standalone", "open-sse", "lib", "deepseek-pow-worker.mjs"), "utf8"))
      .toBe("worker");
    expect(readFileSync(join(projectRoot, ".next", "standalone", "open-sse", "lib", "deepseek-pow-hash.js"), "utf8"))
      .toBe("hash");
  });

  // Without the wrapper beside server.js nothing can prove a request is local.
  it("copies the request-sanitizing server wrapper into the standalone output", () => {
    const projectRoot = createBuildFixture(".next");
    writeFileSync(join(projectRoot, "custom-server.js"), "wrapper");

    copyStandaloneAssets({ projectRoot, distDir: ".next" });

    expect(readFileSync(join(projectRoot, ".next", "standalone", "custom-server.js"), "utf8"))
      .toBe("wrapper");
  });

  it("does not modify workspace-traced CLI builds", () => {
    const projectRoot = createBuildFixture(".next-cli-build");
    mkdirSync(join(projectRoot, "open-sse", "lib"), { recursive: true });
    writeFileSync(join(projectRoot, "open-sse", "lib", "deepseek-pow-hash.js"), "hash");
    const previousMode = process.env.NEXT_TRACING_ROOT_MODE;
    process.env.NEXT_TRACING_ROOT_MODE = "workspace";

    try {
      copyStandaloneAssets({ projectRoot, distDir: ".next-cli-build" });
    } finally {
      if (previousMode === undefined) delete process.env.NEXT_TRACING_ROOT_MODE;
      else process.env.NEXT_TRACING_ROOT_MODE = previousMode;
    }

    expect(() => readFileSync(join(projectRoot, ".next-cli-build", "standalone", ".next-cli-build", "static", "chunks", "app.js")))
      .toThrow();
    expect(() => readFileSync(join(projectRoot, ".next-cli-build", "standalone", "open-sse", "lib", "deepseek-pow-hash.js")))
      .toThrow();
  });

  it("CLI pack copies DeepSeek PoW worker siblings into the app tree", () => {
    const appDir = mkdtempSync(join(tmpdir(), "9router-cli-pow-src-"));
    const cliAppDir = mkdtempSync(join(tmpdir(), "9router-cli-pow-dst-"));
    mkdirSync(join(appDir, "open-sse", "lib"), { recursive: true });
    writeFileSync(join(appDir, "open-sse", "lib", "deepseek-pow-worker.mjs"), "worker");
    writeFileSync(join(appDir, "open-sse", "lib", "deepseek-pow-hash.js"), "hash");

    copyDeepSeekPowAssets(appDir, cliAppDir);

    expect(readFileSync(join(cliAppDir, "open-sse", "lib", "deepseek-pow-worker.mjs"), "utf8")).toBe("worker");
    expect(readFileSync(join(cliAppDir, "open-sse", "lib", "deepseek-pow-hash.js"), "utf8")).toBe("hash");
  });
});
