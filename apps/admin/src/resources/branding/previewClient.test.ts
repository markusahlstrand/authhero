// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://localhost:3000/admin"}
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// Hoist mocks to avoid reference errors
const { mockAuthorizedHttpClient, mockCreateOrganizationHttpClient } =
  vi.hoisted(() => ({
    mockAuthorizedHttpClient: vi.fn(),
    mockCreateOrganizationHttpClient: vi.fn(),
  }));

vi.mock("@/authProvider", () => ({
  authorizedHttpClient: mockAuthorizedHttpClient,
  createOrganizationHttpClient: mockCreateOrganizationHttpClient,
  isSingleTenantForDomain: vi.fn(),
}));

vi.mock("@/utils/domainUtils", () => ({
  getDomainFromStorage: vi.fn(),
  getSelectedDomainFromStorage: vi.fn(),
  formatDomain: vi.fn(),
  buildUrlWithProtocol: vi.fn(),
}));

vi.mock("@/utils/runtimeConfig", () => ({
  getConfigValue: vi.fn(),
}));

import { isSingleTenantForDomain } from "@/authProvider";
import {
  getDomainFromStorage,
  getSelectedDomainFromStorage,
  formatDomain,
  buildUrlWithProtocol,
} from "@/utils/domainUtils";
import { getConfigValue } from "@/utils/runtimeConfig";

import { getApiUrl, getHttpClient, openFullPreview } from "./previewClient";

describe("previewClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    // Default mock implementations
    (getDomainFromStorage as any).mockReturnValue([]);
    (getSelectedDomainFromStorage as any).mockReturnValue("");
    (formatDomain as any).mockImplementation((d) =>
      d.replace(/^https?:\/\//, "").trim(),
    );
    (buildUrlWithProtocol as any).mockImplementation((url) => {
      if (url.startsWith("http")) return url;
      return `https://${url}`;
    });
    (getConfigValue as any).mockReturnValue("https://default-api.example.com");
    (isSingleTenantForDomain as any).mockReturnValue(false);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("getApiUrl", () => {
    it("returns the restApiUrl from domain config when available", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (getDomainFromStorage as any).mockReturnValue([
        {
          url: "https://auth.example.com",
          restApiUrl: "https://api.example.com/custom",
        },
      ]);
      (formatDomain as any)
        .mockReturnValueOnce("auth.example.com") // for formatDomain(selectedDomain)
        .mockReturnValueOnce("auth.example.com"); // for formatDomain(d.url) in find

      const result = getApiUrl();

      expect(result).toBe("https://api.example.com/custom");
    });

    it("uses buildUrlWithProtocol for restApiUrl", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (getDomainFromStorage as any).mockReturnValue([
        {
          url: "auth.example.com",
          restApiUrl: "api.example.com",
        },
      ]);
      (formatDomain as any).mockReturnValue("auth.example.com");
      (buildUrlWithProtocol as any).mockImplementation((url) => {
        if (url === "api.example.com") return "https://api.example.com";
        return url;
      });

      const result = getApiUrl();

      expect(result).toBe("https://api.example.com");
      expect(buildUrlWithProtocol).toHaveBeenCalledWith("api.example.com");
    });

    it("falls back to selected domain when restApiUrl is not available", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (getDomainFromStorage as any).mockReturnValue([
        { url: "auth.example.com" },
      ]);
      (formatDomain as any).mockReturnValue("auth.example.com");
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      const result = getApiUrl();

      expect(result).toBe("https://auth.example.com");
      expect(buildUrlWithProtocol).toHaveBeenCalledWith("auth.example.com");
    });

    it("falls back to config value when no domain config or selected domain", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("");
      (getDomainFromStorage as any).mockReturnValue([]);
      (formatDomain as any).mockReturnValue("");
      (buildUrlWithProtocol as any).mockImplementation((url) =>
        url.startsWith("http") ? url : `https://${url}`,
      );

      const result = getApiUrl();

      expect(result).toBe("https://default-api.example.com");
      expect(buildUrlWithProtocol).toHaveBeenCalledWith(
        "https://default-api.example.com",
      );
    });

    it("handles domain config lookup with formatted domain comparison", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue(
        "https://auth.example.com",
      );
      (getDomainFromStorage as any).mockReturnValue([
        {
          url: "auth.example.com",
          restApiUrl: "https://api.example.com",
        },
      ]);
      (formatDomain as any)
        .mockReturnValueOnce("auth.example.com") // formatDomain(selectedDomain)
        .mockReturnValueOnce("auth.example.com"); // formatDomain(d.url)

      const result = getApiUrl();

      expect(result).toBe("https://api.example.com");
      expect(formatDomain).toHaveBeenCalledWith("https://auth.example.com");
      expect(formatDomain).toHaveBeenCalledWith("auth.example.com");
    });

    it("skips domain config entries that don't match the selected domain", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue(
        "target.example.com",
      );
      (getDomainFromStorage as any).mockReturnValue([
        {
          url: "other.example.com",
          restApiUrl: "https://api-other.example.com",
        },
        {
          url: "target.example.com",
          restApiUrl: "https://api-target.example.com",
        },
      ]);
      (formatDomain as any)
        .mockReturnValueOnce("target.example.com") // formatDomain(selectedDomain)
        .mockReturnValueOnce("other.example.com") // formatDomain(d.url) first match
        .mockReturnValueOnce("target.example.com"); // formatDomain(d.url) second match

      const result = getApiUrl();

      expect(result).toBe("https://api-target.example.com");
    });
  });

  describe("getHttpClient", () => {
    const tenantId = "test-tenant-123";

    it("returns authorizedHttpClient for single-tenant domains", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);

      const client = getHttpClient(tenantId);

      expect(client).toBe(mockAuthorizedHttpClient);
      expect(isSingleTenantForDomain).toHaveBeenCalledWith("auth.example.com");
    });

    it("returns createOrganizationHttpClient result for multi-tenant domains", () => {
      const mockOrgClient = vi.fn();
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(false);
      (mockCreateOrganizationHttpClient as any).mockReturnValue(mockOrgClient);

      const client = getHttpClient(tenantId);

      expect(client).toBe(mockOrgClient);
      expect(mockCreateOrganizationHttpClient).toHaveBeenCalledWith(tenantId);
    });

    it("formats the selected domain before checking if single-tenant", () => {
      (getSelectedDomainFromStorage as any).mockReturnValue(
        "https://auth.example.com  ",
      );
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);

      getHttpClient(tenantId);

      expect(formatDomain).toHaveBeenCalledWith("https://auth.example.com  ");
      expect(isSingleTenantForDomain).toHaveBeenCalledWith("auth.example.com");
    });

    it("passes the tenant id to createOrganizationHttpClient", () => {
      const mockOrgClient = vi.fn();
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(false);
      (mockCreateOrganizationHttpClient as any).mockReturnValue(mockOrgClient);

      const anotherTenantId = "other-tenant-456";
      getHttpClient(anotherTenantId);

      expect(mockCreateOrganizationHttpClient).toHaveBeenCalledWith(
        anotherTenantId,
      );
    });
  });

  describe("openFullPreview", () => {
    const tenantId = "test-tenant";
    let mockWindow: any;

    beforeEach(() => {
      // Setup mock window.open
      mockWindow = {
        document: {
          write: vi.fn(),
          open: vi.fn(),
          close: vi.fn(),
          body: {
            appendChild: vi.fn(),
            innerHTML: "",
          },
          createElement: vi.fn(() => ({
            setAttribute: vi.fn(),
            srcdoc: "",
          })),
        },
      };
      vi.spyOn(window, "open").mockReturnValue(mockWindow);
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it("opens a blank tab with a loading message", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      mockAuthorizedHttpClient.mockResolvedValue({
        body: "<html><body>Preview content</body></html>",
      });

      const windowOpenSpy = window.open as any;

      await openFullPreview({ tenantId });

      expect(windowOpenSpy).toHaveBeenCalledWith("", "_blank");
      expect(mockWindow.document.write).toHaveBeenCalledWith(
        expect.stringContaining("Loading preview"),
      );
    });

    it("fetches the preview HTML from the branding templates endpoint", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");
      mockAuthorizedHttpClient.mockResolvedValue({
        body: "<html><body>Preview content</body></html>",
      });

      await openFullPreview({ tenantId });

      expect(mockAuthorizedHttpClient).toHaveBeenCalledWith(
        "https://auth.example.com/api/v2/branding/templates/universal-login/preview",
        expect.objectContaining({
          method: "POST",
        }),
      );
    });

    it("includes tenant-id and Content-Type headers in the request", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");
      mockAuthorizedHttpClient.mockResolvedValue({
        body: "<html><body>Preview</body></html>",
      });

      await openFullPreview({ tenantId });

      const call = mockAuthorizedHttpClient.mock.calls[0];
      const headers = call[1].headers;
      expect(headers.get("tenant-id")).toBe(tenantId);
      expect(headers.get("Content-Type")).toBe("application/json");
    });

    it("sends screen, body, branding, and theme options in the request body", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");
      mockAuthorizedHttpClient.mockResolvedValue({
        body: "<html><body>Preview</body></html>",
      });

      const screen = "login";
      const body = "<html>Custom template</html>";
      const branding = { colors: { primary: "#007bff" } };
      const theme = { dark: true };

      await openFullPreview({ tenantId, screen, body, branding, theme });

      const call = mockAuthorizedHttpClient.mock.calls[0];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody).toEqual({ screen, body, branding, theme });
    });

    it("uses the correct HTTP client based on domain configuration", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(false);
      const mockOrgClient = vi.fn();
      (mockCreateOrganizationHttpClient as any).mockReturnValue(mockOrgClient);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");
      mockOrgClient.mockResolvedValue({
        body: "<html><body>Preview</body></html>",
      });

      await openFullPreview({ tenantId });

      expect(mockCreateOrganizationHttpClient).toHaveBeenCalledWith(tenantId);
      expect(mockOrgClient).toHaveBeenCalled();
      expect(mockAuthorizedHttpClient).not.toHaveBeenCalled();
    });

    it("replaces the loading shell with a sandboxed iframe containing the HTML", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      const previewHtml = "<html><body>Preview content</body></html>";
      mockAuthorizedHttpClient.mockResolvedValue({ body: previewHtml });

      const mockIframe = {
        setAttribute: vi.fn(),
        srcdoc: "",
      };
      mockWindow.document.createElement.mockReturnValue(mockIframe);

      await openFullPreview({ tenantId });

      expect(mockWindow.document.open).toHaveBeenCalled();
      expect(mockWindow.document.close).toHaveBeenCalled();
      expect(mockWindow.document.createElement).toHaveBeenCalledWith("iframe");
      expect(mockIframe.setAttribute).toHaveBeenCalledWith(
        "sandbox",
        "allow-scripts allow-forms allow-popups",
      );
      expect(mockIframe.srcdoc).toBe(previewHtml);
      expect(mockWindow.document.body.appendChild).toHaveBeenCalledWith(
        mockIframe,
      );
    });

    it("throws an error if the window cannot be opened (popup blocked)", async () => {
      vi.spyOn(window, "open").mockReturnValue(null);

      await expect(openFullPreview({ tenantId })).rejects.toThrow(
        "Could not open the preview tab",
      );
    });

    it("handles response objects with a body property", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      const previewHtml = "<html><body>Preview</body></html>";
      mockAuthorizedHttpClient.mockResolvedValue({ body: previewHtml });

      const mockIframe = {
        setAttribute: vi.fn(),
        srcdoc: "",
      };
      mockWindow.document.createElement.mockReturnValue(mockIframe);

      await openFullPreview({ tenantId });

      expect(mockIframe.srcdoc).toBe(previewHtml);
    });

    it("throws an error if the response body is not a string", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      mockAuthorizedHttpClient.mockResolvedValue({ body: 123 });

      await expect(openFullPreview({ tenantId })).rejects.toThrow(
        "Empty preview response",
      );
      expect(mockWindow.document.body.innerHTML).toContain(
        "Failed to load preview",
      );
    });

    it("throws an error if the response body is an empty string", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      mockAuthorizedHttpClient.mockResolvedValue({ body: "" });

      await expect(openFullPreview({ tenantId })).rejects.toThrow(
        "Empty preview response",
      );
      expect(mockWindow.document.body.innerHTML).toContain(
        "Failed to load preview",
      );
    });

    it("renders error message when fetch fails", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      mockAuthorizedHttpClient.mockRejectedValue(new Error("Network error"));

      await expect(openFullPreview({ tenantId })).rejects.toThrow(
        "Network error",
      );
      expect(mockWindow.document.body.innerHTML).toContain(
        "Failed to load preview",
      );
    });

    it("handles response without body property", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      mockAuthorizedHttpClient.mockResolvedValue({});

      await expect(openFullPreview({ tenantId })).rejects.toThrow(
        "Empty preview response",
      );
    });

    it("closes the window document before appending the iframe", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");

      const previewHtml = "<html><body>Preview</body></html>";
      mockAuthorizedHttpClient.mockResolvedValue({ body: previewHtml });

      const mockIframe = {
        setAttribute: vi.fn(),
        srcdoc: "",
      };
      mockWindow.document.createElement.mockReturnValue(mockIframe);

      const callOrder: string[] = [];
      mockWindow.document.open.mockImplementation(() => callOrder.push("open"));
      mockWindow.document.close.mockImplementation(() =>
        callOrder.push("close"),
      );
      mockWindow.document.body.appendChild.mockImplementation(() =>
        callOrder.push("appendChild"),
      );

      await openFullPreview({ tenantId });

      expect(callOrder).toEqual(["open", "close", "appendChild"]);
    });

    it("omits optional parameters when not provided", async () => {
      (getSelectedDomainFromStorage as any).mockReturnValue("auth.example.com");
      (formatDomain as any).mockReturnValue("auth.example.com");
      (isSingleTenantForDomain as any).mockReturnValue(true);
      (buildUrlWithProtocol as any).mockReturnValue("https://auth.example.com");
      mockAuthorizedHttpClient.mockResolvedValue({
        body: "<html><body>Preview</body></html>",
      });

      await openFullPreview({ tenantId });

      const call = mockAuthorizedHttpClient.mock.calls[0];
      const requestBody = JSON.parse(call[1].body);
      expect(requestBody).toEqual({
        screen: undefined,
        body: undefined,
        branding: undefined,
        theme: undefined,
      });
    });
  });
});
