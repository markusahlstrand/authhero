// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  DEFAULT_APP_NAME,
  applyBranding,
  getAppName,
  getBasePath,
  getConfigValue,
} from "./runtimeConfig";

beforeEach(() => {
  window.__AUTHHERO_ADMIN_CONFIG__ = undefined;
  document.title = "";
  document.getElementById("app-favicon")?.remove();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("getConfigValue", () => {
  it("reads values from the runtime config", () => {
    window.__AUTHHERO_ADMIN_CONFIG__ = {
      domain: "auth.example.com",
      clientId: "runtime-client",
    };

    expect(getConfigValue("domain")).toBe("auth.example.com");
    expect(getConfigValue("clientId")).toBe("runtime-client");
  });

  it("falls back to the build-time env when the runtime config has no value", async () => {
    vi.stubEnv("VITE_AUTH0_DOMAIN", "env.example.com");
    vi.resetModules();
    // envMap is captured at module load, so re-import after stubbing.
    const { getConfigValue: freshGetConfigValue } =
      await import("./runtimeConfig");

    expect(freshGetConfigValue("domain")).toBe("env.example.com");

    window.__AUTHHERO_ADMIN_CONFIG__ = { clientId: "runtime-client" };
    expect(freshGetConfigValue("domain")).toBe("env.example.com");
  });

  it("lets the runtime config override the build-time env", async () => {
    vi.stubEnv("VITE_AUTH0_DOMAIN", "env.example.com");
    vi.resetModules();
    const { getConfigValue: freshGetConfigValue } =
      await import("./runtimeConfig");

    window.__AUTHHERO_ADMIN_CONFIG__ = { domain: "runtime.example.com" };
    expect(freshGetConfigValue("domain")).toBe("runtime.example.com");
  });

  it("treats an empty runtime string as set, not as missing", async () => {
    vi.stubEnv("VITE_AUTH0_DOMAIN", "env.example.com");
    vi.resetModules();
    const { getConfigValue: freshGetConfigValue } =
      await import("./runtimeConfig");

    // `??` only falls through on null/undefined, so a deployment can blank
    // out a build-time value with "".
    window.__AUTHHERO_ADMIN_CONFIG__ = { domain: "" };
    expect(freshGetConfigValue("domain")).toBe("");
  });
});

describe("getBasePath", () => {
  function withBasePath(basePath: string) {
    window.__AUTHHERO_ADMIN_CONFIG__ = { basePath };
  }

  it("returns an empty string when unset or root", () => {
    withBasePath("");
    expect(getBasePath()).toBe("");
    withBasePath("/");
    expect(getBasePath()).toBe("");
  });

  it("keeps an already normalized path", () => {
    withBasePath("/admin");
    expect(getBasePath()).toBe("/admin");
  });

  it("adds a leading slash", () => {
    withBasePath("admin");
    expect(getBasePath()).toBe("/admin");
  });

  it("strips a trailing slash", () => {
    withBasePath("/admin/");
    expect(getBasePath()).toBe("/admin");
    withBasePath("nested/admin/");
    expect(getBasePath()).toBe("/nested/admin");
  });
});

describe("getAppName", () => {
  it("defaults to the AuthHero name", () => {
    window.__AUTHHERO_ADMIN_CONFIG__ = { appName: "" };
    expect(getAppName()).toBe(DEFAULT_APP_NAME);
    expect(DEFAULT_APP_NAME).toBe("AuthHero Admin");
  });

  it("uses the configured app name", () => {
    window.__AUTHHERO_ADMIN_CONFIG__ = { appName: "Acme Console" };
    expect(getAppName()).toBe("Acme Console");
  });
});

describe("applyBranding", () => {
  it("sets the document title and leaves the favicon alone when none is configured", () => {
    window.__AUTHHERO_ADMIN_CONFIG__ = { appName: "Acme Console" };

    applyBranding();

    expect(document.title).toBe("Acme Console");
    expect(document.getElementById("app-favicon")).toBe(null);
  });

  it("creates a favicon link when one is configured", () => {
    window.__AUTHHERO_ADMIN_CONFIG__ = {
      faviconUrl: "https://cdn.example.com/favicon.png",
    };

    applyBranding();

    expect(document.title).toBe(DEFAULT_APP_NAME);
    const link = document.getElementById("app-favicon");
    expect(link).toBeInstanceOf(HTMLLinkElement);
    if (!(link instanceof HTMLLinkElement)) return;
    expect(link.rel).toBe("icon");
    expect(link.href).toBe("https://cdn.example.com/favicon.png");
    expect(link.parentElement).toBe(document.head);
  });

  it("reuses an existing favicon link and drops its type", () => {
    const existing = document.createElement("link");
    existing.id = "app-favicon";
    existing.rel = "icon";
    existing.type = "image/svg+xml";
    existing.href = "https://cdn.example.com/old.svg";
    document.head.appendChild(existing);

    window.__AUTHHERO_ADMIN_CONFIG__ = {
      faviconUrl: "https://cdn.example.com/new.png",
    };

    applyBranding();

    expect(document.querySelectorAll("#app-favicon")).toHaveLength(1);
    expect(existing.href).toBe("https://cdn.example.com/new.png");
    expect(existing.hasAttribute("type")).toBe(false);
  });
});
