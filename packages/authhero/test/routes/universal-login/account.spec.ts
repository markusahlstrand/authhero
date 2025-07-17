import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { loginWithCode } from "../../helpers/login";

describe("account", () => {
  it("should send verification code and redirect to change-email page, then update email after code verification", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const { universalApp, env, getSentEmails } = testServer;
    const universalClient = testClient(universalApp, env);

    const { cookieName, cookieValue } = await loginWithCode(testServer, {
      redirect_uri: "http://localhost:3000/u/account",
    });

    // ---------------------------------
    // Request email change
    // ---------------------------------
    const changeEmailResponse = await universalClient["account"].$post(
      {
        query: { client_id: "clientId" },
        form: {
          action: "update_email",
          email: "new@example.com",
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    // Should redirect to change-email page
    expect(changeEmailResponse.status).toBe(302);
    const location = changeEmailResponse.headers.get("location");
    expect(location).toContain("/u/change-email");
    expect(location).toContain("email=new%40example.com");
    expect(location).toContain("client_id=clientId");
    expect(location).toContain("change_id=");

    // Extract change_id from location
    const url = new URL(location!, "http://localhost:3000");
    const changeId = url.searchParams.get("change_id");
    expect(changeId).toBeDefined();

    // Should have sent verification code email
    const sentEmails = getSentEmails();
    expect(sentEmails).toHaveLength(2); // 1 for login, 1 for email change
    const verificationEmail = sentEmails[1];
    expect(verificationEmail.to).toBe("new@example.com");
    expect(verificationEmail.data.code).toBeDefined();

    const verificationCode = verificationEmail.data.code;

    // ---------------------------------
    // Access change-email page
    // ---------------------------------
    const changeEmailPageResponse = await universalClient["change-email"].$get(
      {
        query: {
          client_id: "clientId",
          email: "new@example.com",
          change_id: changeId!,
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    expect(changeEmailPageResponse.status).toBe(200);
    const changeEmailPageContent = await changeEmailPageResponse.text();
    expect(changeEmailPageContent).toContain("new@example.com");
    expect(changeEmailPageContent).toContain("Verifiera konto");

    // ---------------------------------
    // Submit verification code
    // ---------------------------------
    const verifyCodeResponse = await universalClient["change-email"].$post(
      {
        query: {
          client_id: "clientId",
          email: "new@example.com",
          change_id: changeId!,
        },
        form: {
          code: verificationCode,
        },
      },
      {
        headers: {
          cookie: `${cookieName}=${cookieValue}`,
        },
      },
    );

    // Should return success message
    expect(verifyCodeResponse.status).toBe(200);
    const successPageContent = await verifyCodeResponse.text();
    expect(successPageContent).toContain("new@example.com");
    expect(successPageContent).toContain("Fortsätt");

    // ---------------------------------
    // Verify email was updated and verified
    // ---------------------------------
    const updatedUser = await env.data.users.get("tenantId", "email|userId");
    if (!updatedUser) {
      throw new Error("User not found");
    }
    expect(updatedUser.email).toBe("new@example.com");
    expect(updatedUser.email_verified).toBe(true);
  });

  it("should redirect to authorize endpoint when accessing /u/account without valid session", async () => {
    const testServer = await getTestServer({
      mockEmail: true,
    });

    const { universalApp, env } = testServer;
    const universalClient = testClient(universalApp, env);

    // Try to access account page without any session cookie
    const accountResponse = await universalClient["account"].$get({
      query: { client_id: "clientId" },
    });

    expect(accountResponse.status).toBe(302);

    const location = accountResponse.headers.get("location");
    expect(location).toContain(
      "http://localhost:3000/authorize?client_id=clientId&redirect_uri=http%3A%2F%2Flocalhost%2Faccount%3Fclient_id%3DclientId&state=",
    );
  });
});
