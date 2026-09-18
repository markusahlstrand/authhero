import { describe, it, expect } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { getTestServer } from "../../helpers/test-server";
import { createSessions } from "../../helpers/create-session";
import { u2Screen } from "../../helpers/u2-screen";
import { AuthorizationResponseMode } from "@authhero/adapter-interfaces";
import {
  resolveEmbedLogin,
  frameAncestorsHeaders,
  buildEmbedErrorScript,
  buildEmbedPageScript,
} from "../../../src/routes/universal-login/embed";
import { createUniversalLoginErrorHandler } from "../../../src/routes/universal-login/error-handler";
import renderAuthIframe from "../../../src/utils/authIframe";
import type { Bindings, Variables } from "../../../src/types";

type TestEnv = Awaited<ReturnType<typeof getTestServer>>["env"];

/**
 * A login session started with response_mode=web_message and a redirect_uri
 * on the application's origin: what an application that embeds the login
 * pages in an iframe creates via /authorize.
 */
async function createEmbeddedLoginSession(env: TestEnv) {
  return env.data.loginSessions.create("tenantId", {
    expires_at: new Date(Date.now() + 60_000).toISOString(),
    csrf_token: "csrfToken",
    authParams: {
      client_id: "clientId",
      audience: "https://example.com",
      redirect_uri: "https://example.com/callback",
      response_mode: AuthorizationResponseMode.WEB_MESSAGE,
      state: "app-state",
    },
  });
}

/**
 * The fixture client lists https://example.com as a web origin, and the
 * enriched client appends the auth server's own universal-login origin.
 */
const FIXTURE_FRAME_ANCESTORS =
  "frame-ancestors https://example.com http://localhost:3000";

/**
 * Runs the embedded page's inline script against a stubbed window and
 * document, then fires one `navigate` event at the widget it attached to.
 * Returns what the script did with it: the URL it opened in a popup, if any,
 * and whether it cancelled the widget's own navigation.
 *
 * The script is a string injected into the page, so this is the only way to
 * exercise its branches rather than assert on its source text.
 */
function dispatchNavigate(url: string) {
  const opened: string[] = [];
  let navigateHandler: ((evt: unknown) => void) | undefined;

  const win = {
    location: { origin: "https://login.example.com" },
    parent: { postMessage: () => {} },
    addEventListener: () => {},
    open: (target: string) => {
      opened.push(target);
      // A window object is truthy enough for the script's blocker check.
      return { close: () => {} };
    },
    ResizeObserver: undefined,
  };
  const widget = {
    addEventListener: (type: string, handler: (evt: unknown) => void) => {
      if (type === "navigate") navigateHandler = handler;
    },
  };
  const doc = {
    documentElement: { getBoundingClientRect: () => ({ height: 100 }) },
    querySelector: () => widget,
  };

  const script = buildEmbedPageScript({
    targetOrigin: "https://example.com",
    frameAncestors: ["https://example.com"],
  });
  // eslint-disable-next-line no-new-func
  new Function("window", "document", script)(win, doc);

  expect(navigateHandler).toBeDefined();
  let prevented = false;
  navigateHandler!({
    detail: { url },
    preventDefault: () => {
      prevented = true;
    },
  });

  return { opened, prevented };
}

describe("embedded login (iframe)", () => {
  describe("resolveEmbedLogin", () => {
    it("is off for ordinary redirect flows", () => {
      expect(
        resolveEmbedLogin(
          { authParams: { client_id: "c", redirect_uri: "https://a.com/cb" } },
          { web_origins: ["https://a.com"] },
        ),
      ).toBeUndefined();
    });

    it("targets the redirect_uri origin and allows the client's web origins", () => {
      expect(
        resolveEmbedLogin(
          {
            authParams: {
              client_id: "c",
              redirect_uri: "https://app.example.com/auth/callback?x=1",
              response_mode: AuthorizationResponseMode.WEB_MESSAGE,
            },
          },
          {
            web_origins: [
              "https://app.example.com",
              "https://app.example.com/some/path",
              "http://localhost:3000",
              "not a url",
              "javascript:alert(1)",
            ],
          },
        ),
      ).toEqual({
        targetOrigin: "https://app.example.com",
        frameAncestors: ["https://app.example.com", "http://localhost:3000"],
      });
    });

    it("is off when web_message has no usable redirect_uri", () => {
      expect(
        resolveEmbedLogin(
          {
            authParams: {
              client_id: "c",
              response_mode: AuthorizationResponseMode.WEB_MESSAGE,
            },
          },
          { web_origins: ["https://a.com"] },
        ),
      ).toBeUndefined();
    });
  });

  describe("frameAncestorsHeaders", () => {
    it("denies framing by default, with the legacy header too", () => {
      expect(frameAncestorsHeaders(undefined)).toEqual({
        "Content-Security-Policy": "frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
      });
    });

    it("allows exactly the web origins for an embedded session", () => {
      expect(
        frameAncestorsHeaders({
          targetOrigin: "https://a.com",
          frameAncestors: ["https://a.com", "https://b.com"],
        }),
      ).toEqual({
        "Content-Security-Policy":
          "frame-ancestors https://a.com https://b.com",
      });
    });

    it("still denies when the client lists no web origins", () => {
      expect(
        frameAncestorsHeaders({
          targetOrigin: "https://a.com",
          frameAncestors: [],
        }),
      ).toEqual({
        "Content-Security-Policy": "frame-ancestors 'none'",
        "X-Frame-Options": "DENY",
      });
    });
  });

  describe("hosted pages", () => {
    it("deny framing for a normal login session", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      const { loginSession } = await createSessions(env.data);

      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      const html = await response.text();
      expect(html).not.toContain("authhero:resize");
      expect(html).not.toContain('data-embed="true"');
    });

    it("deny framing on pages that never load a login session", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });

      const response = await u2App.request(
        "http://localhost/info?state=1234",
        { method: "GET" },
        env,
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(
        "frame-ancestors 'none'",
      );
    });

    it("render the compact embedded page for a web_message session", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      const loginSession = await createEmbeddedLoginSession(env);

      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-security-policy")).toBe(
        FIXTURE_FRAME_ANCESTORS,
      );
      expect(response.headers.get("x-frame-options")).toBeNull();

      const html = await response.text();
      expect(html).toContain('data-embed="true"');
      // Resize + relay script, targeting the redirect_uri origin only
      expect(html).toContain("authhero:resize");
      expect(html).toContain('var target="https://example.com"');
      // No page chrome markup: chips and footer would navigate inside the
      // frame (the shared stylesheet still mentions their selectors)
      expect(html).not.toContain("data-ah-slot");
      expect(html).not.toContain('class="ah-footer');
      // The widget still renders, with the card floating in the modal
      expect(html).toContain("<authhero-widget");
      expect(html).toContain("floating");
    });

    it("do not allow the application's origin until it is a web origin", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      const loginSession = await createEmbeddedLoginSession(env);
      await env.data.clients.update("tenantId", "clientId", {
        web_origins: [],
      });

      const response = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state: loginSession.id },
      });

      expect(response.status).toBe(200);
      // Only the auth server's own origin (added by the enriched client)
      // remains; the application at https://example.com may not frame it.
      expect(response.headers.get("content-security-policy")).toBe(
        "frame-ancestors http://localhost:3000",
      );
    });

    it("skip the tenant's page template when embedded", async () => {
      const { u2App, env } = await getTestServer({ mockEmail: true });
      await env.data.universalLoginTemplates.set("tenantId", {
        body: `<div class="tenant-template">{%- auth0:widget -%}</div>`,
      });
      const loginSession = await createEmbeddedLoginSession(env);

      const embedded = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state: loginSession.id },
      });
      expect(await embedded.text()).not.toContain("tenant-template");

      const plain = await env.data.loginSessions.create("tenantId", {
        expires_at: new Date(Date.now() + 60_000).toISOString(),
        csrf_token: "csrfToken",
        authParams: { client_id: "clientId" },
      });
      const hosted = await u2Screen(u2App, env, "login/identifier").$get({
        query: { state: plain.id },
      });
      expect(await hosted.text()).toContain("tenant-template");
    });
  });

  describe("error page", () => {
    function appThatThrowsAfterInit(
      embed: Variables["embedLogin"],
      err: Error,
    ) {
      const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
      app.onError(createUniversalLoginErrorHandler());
      app.get("/boom", (ctx) => {
        ctx.set("embedLogin", embed);
        throw err;
      });
      return app;
    }

    it("stays frameable and posts the error to the application when embedded", async () => {
      const app = appThatThrowsAfterInit(
        {
          targetOrigin: "https://app.example.com",
          frameAncestors: ["https://app.example.com"],
        },
        new HTTPException(400, { message: "Login session not found" }),
      );

      const response = await app.request("/boom");

      expect(response.status).toBe(400);
      expect(response.headers.get("content-security-policy")).toBe(
        "frame-ancestors https://app.example.com",
      );
      const html = await response.text();
      expect(html).toContain('"type":"authorization_response"');
      expect(html).toContain('"error":"invalid_request"');
      expect(html).toContain('"https://app.example.com"');
    });

    it("denies framing when not embedded", async () => {
      const app = appThatThrowsAfterInit(
        undefined,
        new HTTPException(400, { message: "Login session not found" }),
      );

      const response = await app.request("/boom");

      expect(response.status).toBe(400);
      expect(response.headers.get("content-security-policy")).toBe(
        "frame-ancestors 'none'",
      );
      expect(response.headers.get("x-frame-options")).toBe("DENY");
      expect(await response.text()).not.toContain("authorization_response");
    });

    it("cannot break out of the inline script through the error text", () => {
      const script = buildEmbedErrorScript(
        { targetOrigin: "https://app.example.com", frameAncestors: [] },
        {
          error: "invalid_request",
          error_description: "</script><script>alert(1)</script>",
        },
      );
      expect(script).not.toContain("</script>");
      expect(script).toContain("\\u003c/script>");
    });
  });

  describe("web_message response page", () => {
    it("also posts to its own origin so a popup opened by the iframe can be relayed", async () => {
      const app = new Hono<{ Bindings: Bindings; Variables: Variables }>();
      app.get("/done", (ctx) =>
        renderAuthIframe(ctx, "https://app.example.com", '{"code":"abc"}'),
      );

      const html = await (await app.request("/done")).text();

      expect(html).toContain(
        "mainWin.postMessage(authorizationResponse, targetOrigin)",
      );
      expect(html).toContain(
        "mainWin.postMessage(authorizationResponse, window.location.origin)",
      );
      expect(html).toContain(
        "window.opener && window.location.origin !== targetOrigin",
      );
    });
  });

  /**
   * Which navigations the frame hands to a popup. Identity providers refuse
   * to render in a frame, so they have to leave it; every internal hop has
   * to stay, or a plain password login would spawn a window mid-flow.
   */
  describe("popup routing", () => {
    it("opens our own /authorize, the social-login redirect, in a popup", () => {
      const { opened, prevented } = dispatchNavigate(
        "/authorize?connection=google-oauth2&state=abc",
      );

      expect(opened).toEqual([
        "https://login.example.com/authorize?connection=google-oauth2&state=abc",
      ]);
      expect(prevented).toBe(true);
    });

    it("opens an enterprise IdP on its own origin in a popup", () => {
      // What the identifier form returns when home-realm discovery matches
      // an enterprise connection: a redirect straight to the provider.
      const { opened, prevented } = dispatchNavigate(
        "https://idp.example.com/saml/sso?SAMLRequest=abc",
      );

      expect(opened).toEqual([
        "https://idp.example.com/saml/sso?SAMLRequest=abc",
      ]);
      expect(prevented).toBe(true);
    });

    it("leaves /authorize/resume inside the frame", () => {
      // The terminal hop of a password, OTP or MFA step. It renders the
      // web_message response in the frame, which posts to the application.
      const { opened, prevented } = dispatchNavigate(
        "/authorize/resume?state=session-id",
      );

      expect(opened).toEqual([]);
      expect(prevented).toBe(false);
    });

    it("leaves the next hosted screen inside the frame", () => {
      const { opened, prevented } = dispatchNavigate(
        "/u2/enter-password?state=session-id",
      );

      expect(opened).toEqual([]);
      expect(prevented).toBe(false);
    });
  });
});
