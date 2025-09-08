import { describe, expect, it, beforeEach } from "vitest";
import { OpenAPIHono } from "@hono/zod-openapi";
import { clientInfoMiddleware } from "../../src/middlewares/client-info";
import { Bindings, Variables } from "../../src/types";

describe("clientInfoMiddleware", () => {
  let app: OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>;

  beforeEach(() => {
    app = new OpenAPIHono<{ Bindings: Bindings; Variables: Variables }>();
    app.use("*", clientInfoMiddleware);
  });

  describe("IP address extraction", () => {
    it("should extract the first IP from x-forwarded-for header when x-forwarded-host is present", async () => {
      // Setup a route to capture the context variables
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });

      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "192.168.1.100, 10.0.0.1, 203.0.113.1",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("192.168.1.100");
    });

    it("should handle single IP in x-forwarded-for header", async () => {
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });

      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "192.168.1.100",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("192.168.1.100");
    });

    it("should handle x-forwarded-for with spaces around commas", async () => {
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });

      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": " 192.168.1.100 , 10.0.0.1 , 203.0.113.1 ",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("192.168.1.100");
    });

    it("should fallback to cf-connecting-ip when x-forwarded-host is not present", async () => {
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });

      const response = await app.request("/test", {
        headers: {
          "x-forwarded-for": "192.168.1.100, 10.0.0.1",
          "cf-connecting-ip": "203.0.113.1",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should fallback to x-real-ip when other headers are not available", async () => {
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });

      const response = await app.request("/test", {
        headers: {
          "x-real-ip": "203.0.113.1",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should not set IP when no relevant headers are present", async () => {
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });

      const response = await app.request("/test", {
        headers: {},
      });

      const body = await response.json();
      expect(body.ip).toBeUndefined();
    });
  });

  describe("Other client info extraction", () => {
    it("should extract user agent", async () => {
      app.get("/test", (c) => {
        return c.json({ useragent: c.get("useragent") });
      });

      const response = await app.request("/test", {
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
        },
      });

      const body = await response.json();
      expect(body.useragent).toBe("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");
    });

    it("should extract country code from cf-ipcountry header", async () => {
      app.get("/test", (c) => {
        return c.json({ countryCode: c.get("countryCode") });
      });

      const response = await app.request("/test", {
        headers: {
          "cf-ipcountry": "US",
        },
      });

      const body = await response.json();
      expect(body.countryCode).toBe("US");
    });

    it("should parse auth0Client from query parameter", async () => {
      app.get("/test", (c) => {
        return c.json({ auth0Client: c.get("auth0_client") });
      });

      const auth0ClientData = JSON.stringify({
        name: "auth0-react",
        version: "1.12.1",
        env: { node: "16.14.0" }
      });

      const response = await app.request(`/test?auth0Client=${encodeURIComponent(auth0ClientData)}`);

      const body = await response.json();
      expect(body.auth0Client).toEqual({
        name: "auth0-react",
        version: "1.12.1",
        env: { node: "16.14.0" }
      });
    });
  });
});
