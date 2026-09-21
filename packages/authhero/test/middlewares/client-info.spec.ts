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
    beforeEach(() => {
      app.get("/test", (c) => {
        return c.json({ ip: c.get("ip") });
      });
    });

    it("should prefer cf-connecting-ip over any forwarded header", async () => {
      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "192.168.1.100, 10.0.0.1",
          "x-real-ip": "198.51.100.7",
          "cf-connecting-ip": "203.0.113.1",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should ignore a client-supplied x-forwarded-for prefix", async () => {
      // The chain a scanner sends is preserved by @authhero/proxy, which only
      // appends the hop it verified. Trusting the head of it would let the
      // caller pick its own rate-limit key.
      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "127.0.0.1, 203.0.113.1",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should fall back to x-real-ip when cf-connecting-ip is Cloudflare's own address", async () => {
      // What a worker-to-worker hop looks like: the runtime replaces
      // CF-Connecting-IP with the loopback source, and the proxy has already
      // stamped the visitor into x-real-ip.
      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "127.0.0.1, 203.0.113.1",
          "x-real-ip": "203.0.113.1",
          "cf-connecting-ip": "2a06:98c0:3600::103",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should fall back to the last x-forwarded-for hop when no other header is usable", async () => {
      const response = await app.request("/test", {
        headers: {
          "x-forwarded-for": " 127.0.0.1 , 10.0.0.1 , 203.0.113.1 ",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should handle a single IP in x-forwarded-for", async () => {
      const response = await app.request("/test", {
        headers: {
          "x-forwarded-host": "example.com",
          "x-forwarded-for": "192.168.1.100",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("192.168.1.100");
    });

    it("should use x-real-ip when it is the only header present", async () => {
      const response = await app.request("/test", {
        headers: {
          "x-real-ip": "203.0.113.1",
        },
      });

      const body = await response.json();
      expect(body.ip).toBe("203.0.113.1");
    });

    it("should not set IP when no relevant headers are present", async () => {
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
      expect(body.useragent).toBe(
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
      );
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
        env: { node: "16.14.0" },
      });

      const response = await app.request(
        `/test?auth0Client=${encodeURIComponent(auth0ClientData)}`,
      );

      const body = await response.json();
      expect(body.auth0Client).toEqual({
        name: "auth0-react",
        version: "1.12.1",
        env: { node: "16.14.0" },
      });
    });
  });
});
