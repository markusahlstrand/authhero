import { describe, it, expect, beforeEach } from "vitest";
import { Context } from "hono";
import { getTestServer } from "../helpers/test-server";
import {
  sendResetPassword,
  sendCode,
  sendLink,
  sendValidateEmailAddress,
  sendSignupValidateEmailAddress,
} from "../../src/emails";
import { Bindings, Variables } from "../../src/types";
import { nanoid } from "nanoid";

describe("Email Functions", () => {
  let testServer: Awaited<ReturnType<typeof getTestServer>>;
  let ctx: Context<{ Bindings: Bindings; Variables: Variables }>;

  beforeEach(async () => {
    testServer = await getTestServer({ mockEmail: true });

    // Create a mock context with all required properties
    ctx = {
      env: testServer.env,
      var: {
        tenant_id: "tenantId",
        client_id: "clientId",
      },
      set: () => {},
      req: {
        method: "POST",
        path: "/test",
        queries: () => ({}),
        header: (name: string) => (name === "host" ? "localhost" : undefined),
      },
      executionCtx: {
        waitUntil: () => {},
        passThroughOnException: () => {},
      },
    } as any;
  });

  describe("sendResetPassword", () => {
    it("should send password reset email with default language", async () => {
      const code = nanoid();
      const state = nanoid();

      await sendResetPassword(ctx, "user@example.com", code, state);

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.template).toBe("auth-password-reset");
      expect(email.data.vendorName).toBe("Test Tenant");
      expect(email.data.passwordResetUrl).toContain(code);
      expect(email.data.passwordResetUrl).toContain(state);
    });

    it("should send password reset email with custom language", async () => {
      const code = nanoid();
      const state = nanoid();

      await sendResetPassword(ctx, "user@example.com", code, state, "sv");

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.template).toBe("auth-password-reset");
    });

    it("should include branding logo and button color when available", async () => {
      // Add branding to tenant
      await testServer.env.data.branding.set("tenantId", {
        logo_url: "https://example.com/logo.png",
        colors: {
          primary: "#FF5733",
        },
      });

      const code = nanoid();
      const state = nanoid();

      await sendResetPassword(ctx, "user@example.com", code, state);

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.data.logo).toBe("https://example.com/logo.png");
      expect(email.data.buttonColor).toBe("#FF5733");
    });

    it("should use default button color when branding not available", async () => {
      const code = nanoid();
      const state = nanoid();

      await sendResetPassword(ctx, "user@example.com", code, state);

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.data.logo).toBe("");
      expect(email.data.buttonColor).toBe("#7d68f4");
    });
  });

  describe("sendCode", () => {
    it("should send code email with default language", async () => {
      const code = "123456";

      await sendCode(ctx, { to: "user@example.com", code });

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.template).toBe("auth-code");
      expect(email.data.code).toBe(code);
      expect(email.data.vendorName).toBe("Test Tenant");
    });

    it("should send code email with custom language", async () => {
      const code = "123456";

      await sendCode(ctx, { to: "user@example.com", code, language: "fr" });

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.data.code).toBe(code);
    });

    it("should include branding when available", async () => {
      await testServer.env.data.branding.set("tenantId", {
        logo_url: "https://example.com/logo.png",
        colors: {
          primary: "#00AA00",
        },
      });

      const code = "123456";

      await sendCode(ctx, { to: "user@example.com", code });

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.data.logo).toBe("https://example.com/logo.png");
      expect(email.data.buttonColor).toBe("#00AA00");
    });
  });

  describe("sendLink", () => {
    it("should send magic link email with default language", async () => {
      const code = "123456";
      const authParams: any = {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: "code" as const,
        scope: "openid profile email",
      };

      await sendLink(ctx, { to: "user@example.com", code, authParams });

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.template).toBe("auth-link");
      expect(email.data.code).toBe(code);
      expect(email.data.magicLink).toContain(code);
      expect(email.data.magicLink).toContain("clientId");
    });

    it("should send magic link email with custom language", async () => {
      const code = "123456";
      const authParams: any = {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: "code" as const,
        scope: "openid profile email",
      };

      await sendLink(ctx, {
        to: "user@example.com",
        code,
        authParams,
        language: "de",
      });

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.data.magicLink).toContain(code);
    });

    it("should include branding when available", async () => {
      await testServer.env.data.branding.set("tenantId", {
        logo_url: "https://example.com/brand-logo.png",
        colors: {
          primary: "#0000FF",
        },
      });

      const code = "123456";
      const authParams: any = {
        client_id: "clientId",
        redirect_uri: "https://example.com/callback",
        response_type: "code" as const,
        scope: "openid profile email",
      };

      await sendLink(ctx, { to: "user@example.com", code, authParams });

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.data.logo).toBe("https://example.com/brand-logo.png");
      expect(email.data.buttonColor).toBe("#0000FF");
    });
  });

  describe("sendValidateEmailAddress", () => {
    it("should send email validation with default language", async () => {
      const user: any = {
        user_id: "email|userId",
        email: "user@example.com",
        email_verified: false,
        connection: "email",
        provider: "email",
        is_social: false,
        login_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await sendValidateEmailAddress(ctx, user);

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
      expect(email.template).toBe("auth-verify-email");
      expect(email.data.vendorName).toBe("Test Tenant");
    });

    it("should send email validation with custom language", async () => {
      const user: any = {
        user_id: "email|userId",
        email: "user@example.com",
        email_verified: false,
        connection: "email",
        provider: "email",
        is_social: false,
        login_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await sendValidateEmailAddress(ctx, user, "es");

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("user@example.com");
    });

    it("should throw error if user has no email", async () => {
      const user = {
        user_id: "email|userId",
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      } as any;

      await expect(sendValidateEmailAddress(ctx, user)).rejects.toThrow(
        "User has no email",
      );
    });

    it("should include branding when available", async () => {
      await testServer.env.data.branding.set("tenantId", {
        logo_url: "https://example.com/verify-logo.png",
        colors: {
          primary: "#AA00AA",
        },
      });

      const user: any = {
        user_id: "email|userId",
        email: "user@example.com",
        email_verified: false,
        connection: "email",
        provider: "email",
        is_social: false,
        login_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await sendValidateEmailAddress(ctx, user);

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.data.logo).toBe("https://example.com/verify-logo.png");
      expect(email.data.buttonColor).toBe("#AA00AA");
    });
  });

  describe("sendSignupValidateEmailAddress", () => {
    it("should send signup validation email with default language", async () => {
      const code = nanoid();
      const state = nanoid();

      await sendSignupValidateEmailAddress(
        ctx,
        "newuser@example.com",
        code,
        state,
      );

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("newuser@example.com");
      expect(email.template).toBe("auth-pre-signup-verification");
      expect(email.data.signupUrl).toContain(code);
      expect(email.data.signupUrl).toContain(state);
    });

    it("should send signup validation email with custom language", async () => {
      const code = nanoid();
      const state = nanoid();

      await sendSignupValidateEmailAddress(
        ctx,
        "newuser@example.com",
        code,
        state,
        "it",
      );

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.to).toBe("newuser@example.com");
    });

    it("should include branding when available", async () => {
      await testServer.env.data.branding.set("tenantId", {
        logo_url: "https://example.com/signup-logo.png",
        colors: {
          primary: "#FFAA00",
        },
      });

      const code = nanoid();
      const state = nanoid();

      await sendSignupValidateEmailAddress(
        ctx,
        "newuser@example.com",
        code,
        state,
      );

      const sentEmails = testServer.getSentEmails();
      expect(sentEmails).toHaveLength(1);

      const email = sentEmails[0];
      expect(email.data.logo).toBe("https://example.com/signup-logo.png");
      expect(email.data.buttonColor).toBe("#FFAA00");
    });
  });
});
