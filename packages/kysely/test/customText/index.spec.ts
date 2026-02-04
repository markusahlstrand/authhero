import { describe, expect, it } from "vitest";
import { getTestServer } from "../helpers/test-server";

describe("customText", () => {
  it("should support CRUD operations", async () => {
    const { data } = await getTestServer();

    // Create a tenant first
    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // ----------------------------------------
    // Get non-existent custom text returns null
    // ----------------------------------------
    const nonExistent = await data.customText.get("tenantId", "login", "en");
    expect(nonExistent).toBeNull();

    // ----------------------------------------
    // Set custom text
    // ----------------------------------------
    await data.customText.set("tenantId", "login", "en", {
      pageTitle: "Welcome Back",
      buttonText: "Sign In",
      description: "Please enter your credentials",
    });

    // ----------------------------------------
    // Get custom text
    // ----------------------------------------
    const customText = await data.customText.get("tenantId", "login", "en");
    expect(customText).toEqual({
      pageTitle: "Welcome Back",
      buttonText: "Sign In",
      description: "Please enter your credentials",
    });

    // ----------------------------------------
    // Update custom text
    // ----------------------------------------
    await data.customText.set("tenantId", "login", "en", {
      pageTitle: "Welcome Back Updated",
      buttonText: "Log In",
      description: "Enter your email and password",
      forgotPasswordLink: "Forgot password?",
    });

    const updatedCustomText = await data.customText.get(
      "tenantId",
      "login",
      "en",
    );
    expect(updatedCustomText).toEqual({
      pageTitle: "Welcome Back Updated",
      buttonText: "Log In",
      description: "Enter your email and password",
      forgotPasswordLink: "Forgot password?",
    });

    // ----------------------------------------
    // Set custom text for different language
    // ----------------------------------------
    await data.customText.set("tenantId", "login", "de", {
      pageTitle: "Willkommen zurück",
      buttonText: "Anmelden",
      description: "Bitte geben Sie Ihre Anmeldedaten ein",
    });

    const germanCustomText = await data.customText.get(
      "tenantId",
      "login",
      "de",
    );
    expect(germanCustomText).toEqual({
      pageTitle: "Willkommen zurück",
      buttonText: "Anmelden",
      description: "Bitte geben Sie Ihre Anmeldedaten ein",
    });

    // ----------------------------------------
    // Set custom text for different prompt
    // ----------------------------------------
    await data.customText.set("tenantId", "signup", "en", {
      pageTitle: "Create Account",
      buttonText: "Sign Up",
      termsText: "By signing up, you agree to our terms",
    });

    const signupCustomText = await data.customText.get(
      "tenantId",
      "signup",
      "en",
    );
    expect(signupCustomText).toEqual({
      pageTitle: "Create Account",
      buttonText: "Sign Up",
      termsText: "By signing up, you agree to our terms",
    });

    // ----------------------------------------
    // List all custom text entries
    // ----------------------------------------
    const entries = await data.customText.list("tenantId");
    expect(entries).toHaveLength(3);
    expect(entries).toContainEqual({ prompt: "login", language: "en" });
    expect(entries).toContainEqual({ prompt: "login", language: "de" });
    expect(entries).toContainEqual({ prompt: "signup", language: "en" });

    // ----------------------------------------
    // Delete custom text
    // ----------------------------------------
    await data.customText.delete("tenantId", "login", "de");

    const deletedCustomText = await data.customText.get(
      "tenantId",
      "login",
      "de",
    );
    expect(deletedCustomText).toBeNull();

    // Verify list is updated
    const entriesAfterDelete = await data.customText.list("tenantId");
    expect(entriesAfterDelete).toHaveLength(2);
    expect(entriesAfterDelete).not.toContainEqual({
      prompt: "login",
      language: "de",
    });
  });

  it("should isolate custom text between tenants", async () => {
    const { data } = await getTestServer();

    // Create two tenants
    await data.tenants.create({
      id: "tenant1",
      friendly_name: "Tenant 1",
      audience: "https://tenant1.example.com",
      sender_email: "login@tenant1.com",
      sender_name: "Tenant1",
    });

    await data.tenants.create({
      id: "tenant2",
      friendly_name: "Tenant 2",
      audience: "https://tenant2.example.com",
      sender_email: "login@tenant2.com",
      sender_name: "Tenant2",
    });

    // Set custom text for tenant 1
    await data.customText.set("tenant1", "login", "en", {
      pageTitle: "Tenant 1 Login",
    });

    // Set custom text for tenant 2
    await data.customText.set("tenant2", "login", "en", {
      pageTitle: "Tenant 2 Login",
    });

    // Verify tenant isolation
    const tenant1Text = await data.customText.get("tenant1", "login", "en");
    expect(tenant1Text).toEqual({ pageTitle: "Tenant 1 Login" });

    const tenant2Text = await data.customText.get("tenant2", "login", "en");
    expect(tenant2Text).toEqual({ pageTitle: "Tenant 2 Login" });

    // Verify list isolation
    const tenant1Entries = await data.customText.list("tenant1");
    expect(tenant1Entries).toHaveLength(1);

    const tenant2Entries = await data.customText.list("tenant2");
    expect(tenant2Entries).toHaveLength(1);
  });

  it("should handle empty custom text object", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    // Set empty custom text
    await data.customText.set("tenantId", "login", "en", {});

    const customText = await data.customText.get("tenantId", "login", "en");
    expect(customText).toEqual({});
  });

  it("should support all prompt screen types", async () => {
    const { data } = await getTestServer();

    await data.tenants.create({
      id: "tenantId",
      friendly_name: "Test Tenant",
      audience: "https://example.com",
      sender_email: "login@example.com",
      sender_name: "SenderName",
    });

    const screens = [
      "login",
      "login-id",
      "login-password",
      "signup",
      "signup-id",
      "signup-password",
      "reset-password",
      "consent",
      "mfa-push",
      "mfa-otp",
      "mfa-voice",
      "mfa-phone",
      "mfa-webauthn",
      "mfa-sms",
      "mfa-email",
      "mfa-recovery-code",
      "mfa",
      "status",
      "device-flow",
      "email-verification",
      "email-otp-challenge",
      "organizations",
      "invitation",
      "common",
      "passkeys",
      "captcha",
      "custom-form",
    ] as const;

    // Set and verify custom text for each screen type
    for (const screen of screens) {
      await data.customText.set("tenantId", screen, "en", {
        title: `${screen} title`,
      });

      const text = await data.customText.get("tenantId", screen, "en");
      expect(text).toEqual({ title: `${screen} title` });
    }

    // Verify all entries are listed
    const entries = await data.customText.list("tenantId");
    expect(entries).toHaveLength(screens.length);
  });
});
