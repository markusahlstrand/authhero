import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getTestServer } from "../../helpers/test-server";
import { createToken } from "../../helpers/token";

describe("userinfo", () => {
  describe("GET /userinfo", () => {
    it("should return a user info for the current user", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid email",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      const body = await response.json();

      expect(body).toEqual({
        email: "foo@example.com",
        email_verified: true,
        sub: "email|userId",
      });
    });

    it("should return 401 if there is no bearer token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const response = await client.userinfo.$get({});

      expect(response.status).toBe(401);
    });

    it("should return 403 if there is no openid scope", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);
      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(403);
    });
  });

  describe("POST /userinfo", () => {
    it("should return user info for the current user with POST request", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid email",
      });

      const response = await client.userinfo.$post(
        { form: {} },
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      const body = await response.json();

      expect(body).toEqual({
        email: "foo@example.com",
        email_verified: true,
        sub: "email|userId",
      });
    });

    it("should return 401 if there is no bearer token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const response = await client.userinfo.$post({ form: {} });

      expect(response.status).toBe(401);
    });

    it("should return 403 if there is no openid scope", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);
      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "",
      });

      const response = await client.userinfo.$post(
        { form: {} },
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(403);
    });

    it("should return the same response for both GET and POST methods", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid profile email",
      });

      const getResponse = await client.userinfo.$get(
        { query: {} },
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const postResponse = await client.userinfo.$post(
        { form: {} },
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(getResponse.status).toBe(200);
      expect(postResponse.status).toBe(200);

      const getBody = await getResponse.json();
      const postBody = await postResponse.json();

      expect(getBody).toEqual(postBody);
    });

    it("should accept access token in POST body (application/x-www-form-urlencoded)", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid profile email",
      });

      // Use form parameter instead of passing body directly
      const response = await client.userinfo.$post({
        form: {
          access_token: accessToken,
        },
      });

      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain(
        "application/json",
      );
      const body = await response.json();

      // With profile and email scopes, should return all claims
      expect(body).toEqual({
        sub: "email|userId",
        email: "foo@example.com",
        email_verified: true,
        name: "Test User",
        given_name: "Test",
        family_name: "User",
        middle_name: "Middle",
        nickname: "Test User",
        preferred_username: "testuser",
        picture: "https://example.com/test.png",
        profile: "https://example.com/profile",
        website: "https://example.com",
        gender: "other",
        birthdate: "1990-01-15",
        zoneinfo: "America/Los_Angeles",
        locale: "en-US",
        updated_at: expect.any(Number),
      });
    });

    it("should prioritize Authorization header over body token", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid",
      });

      const invalidToken = "invalid-token";

      const response = await client.userinfo.$post(
        {
          form: {
            access_token: invalidToken,
          },
        },
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      // Should succeed with the valid header token, ignoring the invalid body token
      expect(response.status).toBe(200);
      const body = await response.json();
      expect(body.sub).toBe("email|userId");
    });

    it("should return 401 when body token is missing and no Authorization header", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const response = await client.userinfo.$post({ form: {} });

      expect(response.status).toBe(401);
    });

    it("should return 403 when body token lacks openid scope", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "profile email", // Missing openid scope
      });

      const response = await client.userinfo.$post({
        form: {
          access_token: accessToken,
        },
      });

      expect(response.status).toBe(403);
    });
  });

  describe("Scope-based claims", () => {
    it("should return only sub for openid scope", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // With only openid scope, should only return sub (OIDC Core 5.3.2)
      expect(body).toEqual({
        sub: "email|userId",
      });
    });

    it("should return profile claims when profile scope is requested", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid profile",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // With profile scope, should return all OIDC profile claims (but not email_verified)
      expect(body).toEqual({
        sub: "email|userId",
        name: "Test User",
        given_name: "Test",
        family_name: "User",
        middle_name: "Middle",
        nickname: "Test User",
        preferred_username: "testuser",
        picture: "https://example.com/test.png",
        profile: "https://example.com/profile",
        website: "https://example.com",
        gender: "other",
        birthdate: "1990-01-15",
        zoneinfo: "America/Los_Angeles",
        locale: "en-US",
        updated_at: expect.any(Number),
      });
    });

    it("should return email claims when email scope is requested", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid email",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // With email scope, should return email claims
      expect(body).toEqual({
        sub: "email|userId",
        email: "foo@example.com",
        email_verified: true,
      });
    });

    it("should return combined claims when multiple scopes are requested", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      const accessToken = await createToken({
        userId: "email|userId",
        tenantId: "tenantId",
        scope: "openid profile email",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // With profile and email scopes, should return all OIDC profile claims
      expect(body).toEqual({
        sub: "email|userId",
        email: "foo@example.com",
        email_verified: true,
        // All OIDC profile scope claims (OIDC Core 5.4)
        name: "Test User",
        given_name: "Test",
        family_name: "User",
        middle_name: "Middle",
        nickname: "Test User",
        preferred_username: "testuser",
        picture: "https://example.com/test.png",
        profile: "https://example.com/profile",
        website: "https://example.com",
        gender: "other",
        birthdate: "1990-01-15",
        zoneinfo: "America/Los_Angeles",
        locale: "en-US",
        updated_at: expect.any(Number),
      });
    });

    it("should return address claim when address scope is present (OIDC Core 5.4)", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a user with address data
      await env.data.users.create("tenantId", {
        email: "addresstest@example.com",
        email_verified: true,
        name: "Address Test User",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|addressUserId",
        address: {
          formatted: "123 Main St, London, UK",
          street_address: "123 Main St",
          locality: "London",
          region: "Greater London",
          postal_code: "SW1A 1AA",
          country: "United Kingdom",
        },
      });

      const accessToken = await createToken({
        userId: "email|addressUserId",
        tenantId: "tenantId",
        scope: "openid address",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should return the address claim as per OIDC Core 5.1.1
      // email_verified is NOT returned since email scope was not requested
      expect(body).toEqual({
        sub: "email|addressUserId",
        address: {
          formatted: "123 Main St, London, UK",
          street_address: "123 Main St",
          locality: "London",
          region: "Greater London",
          postal_code: "SW1A 1AA",
          country: "United Kingdom",
        },
      });
    });

    it("should not return address claim when address scope is not present", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a user with address data
      await env.data.users.create("tenantId", {
        email: "noaddress@example.com",
        email_verified: true,
        name: "No Address Scope User",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|noAddressUserId",
        address: {
          formatted: "456 Other St, Paris, France",
        },
      });

      const accessToken = await createToken({
        userId: "email|noAddressUserId",
        tenantId: "tenantId",
        scope: "openid email", // No address scope
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should NOT return the address claim
      expect(body).toEqual({
        sub: "email|noAddressUserId",
        email: "noaddress@example.com",
        email_verified: true,
      });
      expect(body.address).toBeUndefined();
    });

    it("should return phone claims when phone scope is requested (OIDC Core 5.4)", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a user with phone data
      await env.data.users.create("tenantId", {
        email: "phonetest@example.com",
        email_verified: true,
        name: "Phone Test User",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|phoneUserId",
        phone_number: "+1234567890",
        phone_verified: true,
      });

      const accessToken = await createToken({
        userId: "email|phoneUserId",
        tenantId: "tenantId",
        scope: "openid phone",
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should return phone claims as per OIDC Core 5.4
      // email_verified is NOT returned since email scope was not requested
      expect(body).toEqual({
        sub: "email|phoneUserId",
        phone_number: "+1234567890",
        phone_number_verified: true,
      });
    });

    it("should not return phone claims when phone scope is not present", async () => {
      const { oauthApp, env } = await getTestServer();
      const client = testClient(oauthApp, env);

      // Create a user with phone data
      await env.data.users.create("tenantId", {
        email: "nophone@example.com",
        email_verified: true,
        name: "No Phone Scope User",
        connection: "email",
        provider: "email",
        is_social: false,
        user_id: "email|noPhoneUserId",
        phone_number: "+0987654321",
        phone_verified: false,
      });

      const accessToken = await createToken({
        userId: "email|noPhoneUserId",
        tenantId: "tenantId",
        scope: "openid email", // No phone scope
      });

      const response = await client.userinfo.$get(
        {},
        {
          headers: {
            authorization: `Bearer ${accessToken}`,
          },
        },
      );

      expect(response.status).toBe(200);
      const body = await response.json();

      // Should NOT return phone claims
      expect(body).toEqual({
        sub: "email|noPhoneUserId",
        email: "nophone@example.com",
        email_verified: true,
      });
      expect(body.phone_number).toBeUndefined();
      expect(body.phone_number_verified).toBeUndefined();
    });
  });
});
