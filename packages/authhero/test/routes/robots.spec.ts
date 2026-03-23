import { describe, it, expect } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("robots.txt", () => {
  it("should return a disallow-all robots.txt", async () => {
    const { app, env } = await getTestServer();

    const response = await app.request("/robots.txt", {
      headers: { "tenant-id": "tenantId" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe(
      "text/plain; charset=utf-8",
    );
    const body = await response.text();
    expect(body).toBe("User-agent: *\nDisallow: /");
  });
});
