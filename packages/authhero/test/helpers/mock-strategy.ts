import { Strategy } from "../../src/strategies";

export const mockStrategy: Strategy = {
  getRedirect: async (_ctx, _connection, loginHint?: string) => {
    const redirectUrl = new URL("https://example.com/authorize");
    if (loginHint) {
      redirectUrl.searchParams.set("login_hint", loginHint);
    }
    return {
      redirectUrl: redirectUrl.href,
      code: "code",
    };
  },
  validateAuthorizationCodeAndGetUser: async (
    _ctx,
    _connection,
    code: string,
  ) => {
    // This is a way to provide different mock responses
    switch (code) {
      case "foo@example.com":
        return {
          sub: "foo",
          email: "foo@example.com",
        };
      // Mimics an Entra/waad mismatch: the `email` claim is sourced from the
      // `mail` attribute and differs from the sign-in identifier (upn /
      // preferred_username). Used to assert the full claim set is captured.
      case "entra-mismatch":
        return {
          sub: "entra-oid-123",
          email: "mail-attr@contoso.com",
        };
      case "vipps-user@example.com":
        return {
          sub: "vipps-456",
          email: "vipps-user@example.com",
          email_verified: true,
          given_name: "Test",
          family_name: "User",
          name: "Test User",
          phone_number: "+4712345678",
          phone_number_verified: true,
          picture: "https://example.com/avatar.jpg",
          nickname: "testuser",
        };
      case "vipps-user-updated@example.com":
        return {
          sub: "vipps-456",
          email: "vipps-user@example.com",
          email_verified: true,
          given_name: "Updated",
          family_name: "Name",
          name: "Updated Name",
          phone_number: "+4799999999",
          phone_number_verified: true,
          picture: "https://example.com/new-avatar.jpg",
          nickname: "updateduser",
        };
      default:
        return {
          sub: "123",
          email: "hello@example.com",
        };
    }
  },
  // Backward-compatible: returns raw: null for every existing code (so the
  // callback keeps its prior profileData shape), and the full upstream claim
  // set only for the `entra-mismatch` code used by the capture test.
  validateAuthorizationCodeAndGetUserWithRaw: async (
    ctx,
    connection,
    code: string,
    codeVerifier?: string,
  ) => {
    const userinfo = await mockStrategy.validateAuthorizationCodeAndGetUser(
      ctx,
      connection,
      code,
      codeVerifier,
    );
    if (code === "entra-mismatch") {
      return {
        userinfo,
        raw: {
          sub: userinfo.sub,
          email: userinfo.email,
          preferred_username: "alice@contoso.com",
          upn: "alice@contoso.com",
          unique_name: "alice@contoso.com",
          oid: "00000000-aaaa-bbbb-cccc-111111111111",
          tid: "contoso-tenant-guid",
        },
      };
    }
    return { userinfo, raw: null };
  },
};
