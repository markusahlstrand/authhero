import { describe, it, expect } from "vitest";
import { computeCodeChallenge } from "../../src/utils/crypto";

describe("computeCodeChallenge", () => {
  it("should compute a PKCE code challenge", async () => {
    const codeVerifier = "e9bHd7YU5HjjORev4NUtJfRUZQMjizDhz6LERU3.gB~";
    const codeChallenge = await computeCodeChallenge(codeVerifier, "S256");
    expect(codeChallenge).toBe("2YYgao8VJyyJ9Qjww2ADyMQ7Krh3dIq9nNbgjeo68-k");
  });
});
