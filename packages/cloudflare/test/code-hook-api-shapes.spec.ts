import { describe, it, expect } from "vitest";
import { TRIGGER_API_SHAPES } from "@authhero/adapter-interfaces";
import { generateWorkerScript } from "../src/code-executor/worker-template";

/**
 * The per-trigger API allowlist is duplicated across executors (the local
 * `LocalCodeExecutor` in `authhero` and the Cloudflare worker generators here).
 * They must stay identical, so all of them now consume the single
 * `TRIGGER_API_SHAPES` source of truth in `@authhero/adapter-interfaces`. This
 * asserts the generated production worker embeds exactly that shape — if the
 * two ever drift, this fails.
 */
describe("code-hook API shapes parity", () => {
  it("the generated worker embeds the shared TRIGGER_API_SHAPES verbatim", () => {
    const script = generateWorkerScript("// user code");
    expect(script).toContain(JSON.stringify(TRIGGER_API_SHAPES));
  });

  it("post-user-login exposes the programmable account-linking verb", () => {
    expect(TRIGGER_API_SHAPES["post-user-login"]?.user).toContain(
      "setLinkedTo",
    );
  });
});
