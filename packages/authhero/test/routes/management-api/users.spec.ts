import { describe, it, expect, beforeEach } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { User } from "@authhero/adapter-interfaces";

describe("users management API endpoint", () => {
  describe("POST", () => {
    it("should create a new sms user", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            phone_number: "+46707123456",
            connection: "sms",
            provider: "sms",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);
      const newUser = await createUserResponse.json();
      expect(newUser.user_id).toMatch(/^sms\|[a-zA-Z0-9]+$/);
      expect(newUser.phone_number).toBe("+46707123456");
    });

    it("should fail to create a new sms user with the same phone number", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            phone_number: "+46707123456",
            connection: "sms",
            provider: "sms",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );
      expect(createUserResponse.status).toBe(201);

      const duplicatedCreateUserRequest = await managementClient.users.$post(
        {
          json: {
            phone_number: "+46707123456",
            connection: "sms",
            provider: "sms",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(duplicatedCreateUserRequest.status).toBe(409);
    });

    it("should create a new user for an empty tenant", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: "test@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);

      const newUser = await createUserResponse.json();
      expect(newUser.email).toBe("test@example.com");
      expect(newUser.user_id).toContain("|");

      const [provider, id] = newUser.user_id.split("|");

      expect(provider).toBe("email");
      expect(id).toBeTypeOf("string");

      const usersResponse = await managementClient.users.$get(
        {
          query: {},
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(usersResponse.status).toBe(200);

      const body = await usersResponse.json();
      if (!Array.isArray(body)) {
        throw new Error("Expected an array of users");
      }

      expect(body.length).toBe(2);
      expect(body[1]?.user_id).toBe(newUser.user_id);
      expect(body[1]?.identities).toEqual([
        {
          connection: "email",
          // inside the identity the user_id isn't prefixed with the provider
          user_id: id,
          provider: "email",
          isSocial: false,
        },
      ]);
    });

    it("should handle provider-prefixed user_id without double-prefixing", async () => {
      const token = await getAdminToken();
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      // Client sends a user_id that's already prefixed with provider
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            user_id: "auth2|myCustomId",
            email: "prefixed@example.com",
            provider: "auth2",
            connection: "Username-Password-Authentication",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);
      const newUser = await createUserResponse.json();

      // Should not double-prefix - should be auth2|myCustomId, not auth2|auth2|myCustomId
      expect(newUser.user_id).toBe("auth2|myCustomId");

      const [provider, id] = newUser.user_id.split("|");
      expect(provider).toBe("auth2");
      expect(id).toBe("myCustomId");
    });

    describe("should return a 409 if you create the same passwordless email user twice when existing user:", () => {
      it("is an existing primary account", async () => {
        const token = await getAdminToken();

        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        const createUserResponse1 = await managementClient.users.$post(
          {
            json: {
              email: "test@example.com",
              connection: "email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(createUserResponse1.status).toBe(201);

        const createUserResponse2 = await managementClient.users.$post(
          {
            json: {
              email: "test@example.com",
              connection: "email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(createUserResponse2.status).toBe(409);
      });

      it("is an existing linked account", async () => {
        const token = await getAdminToken();

        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // ----------------------
        // Inject fixtures for primary and linked users
        // ----------------------

        await env.data.users.create("tenantId", {
          email: "primary@example.com",
          user_id: "auth2|primaryId",
          provider: "auth2",
          email_verified: true,
          connection: "Username-Password-Authentication",
          is_social: false,
        });

        await env.data.users.create("tenantId", {
          email: "existing-code-user@example.com",
          user_id: "email|existingCodeUserId",
          provider: "email",
          email_verified: true,
          connection: "email",
          is_social: false,
          linked_to: "auth2|primaryId",
        });

        // sanity check that primary user is set up correctly
        const primaryUserRes = await managementClient.users[":user_id"].$get(
          {
            param: {
              user_id: "auth2|primaryId",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(primaryUserRes.status).toBe(200);
        const primaryUser = await primaryUserRes.json();
        expect(primaryUser.identities).toEqual([
          {
            connection: "Username-Password-Authentication",
            provider: "auth2",
            user_id: "primaryId",
            isSocial: false,
          },
          {
            connection: "email",
            provider: "email",
            user_id: "existingCodeUserId",
            isSocial: false,
            profileData: {
              email: "existing-code-user@example.com",
              email_verified: true,
            },
          },
        ]);

        const createDuplicateCodeUserResponse =
          await managementClient.users.$post(
            {
              json: {
                email: "existing-code-user@example.com",
                connection: "email",
                email_verified: true,
                verify_email: false,
              },
              header: {
                "tenant-id": "tenantId",
              },
            },
            {
              headers: {
                authorization: `Bearer ${token}`,
              },
            },
          );

        expect(createDuplicateCodeUserResponse.status).toBe(409);
      });
    });

    it("should lowercase email when creating a user", async () => {
      const token = await getAdminToken();
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      // ----------------------
      // Create user with uppercase email and check response is lower case
      // ----------------------
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: "FOOZ@BAR.COM",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);
      const createdUser = await createUserResponse.json();
      expect(createdUser.email).toBe("fooz@bar.com");

      // ----------------------
      // Check directly in the database that the email is lower case
      // ----------------------
      const user = await env.data.users.get("tenantId", createdUser.user_id);
      expect(user!.email).toBe("fooz@bar.com");

      // ----------------------
      // Fetch user through mgmt API get and check email is lower case
      // ----------------------
      const newUser = await managementClient.users[":user_id"].$get(
        {
          param: {
            user_id: user!.user_id,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(newUser.status).toBe(200);
      const fetchedUser = await newUser.json();
      expect(fetchedUser.email).toBe("fooz@bar.com");
    });
  });

  describe("PATCH", () => {
    it("should update a user", async () => {
      const token = await getAdminToken();
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: "test@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);

      const newUser = await createUserResponse.json();
      const [provider, id] = newUser.user_id.split("|");

      const updateUserResponse = await managementClient.users[
        ":user_id"
      ].$patch(
        {
          json: {
            email_verified: true,
          },
          param: {
            user_id: `${provider}|${id}`,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(updateUserResponse.status).toBe(200);

      const usersResponse = await managementClient.users.$get(
        {
          query: {},
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      const body = await usersResponse.json();
      if (!Array.isArray(body)) {
        throw new Error("Expected an array of users");
      }

      expect(body.length).toBe(2);
      expect(body[1]?.email_verified).toBe(true);
    });

    it("should throw a 409 when updating a user with an email of an already existing user", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      await env.data.users.create("tenantId", {
        user_id: "auth2|userId",
        email: "foo@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      await env.data.users.create("tenantId", {
        user_id: "auth2|userId2",
        email: "foo2@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      const updateUserResponse = await managementClient.users[
        ":user_id"
      ].$patch(
        {
          param: { user_id: "auth2|userId" },
          json: {
            email: "foo2@example.com",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(updateUserResponse.status).toBe(409);
    });

    it("should return a 404 when trying to patch a linked user", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId",
            email: "foo@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId2",
            email: "foo2@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // link the accounts
      const linkUserResponse = await managementClient.users[
        ":user_id"
      ].identities.$post(
        {
          param: {
            user_id: "email|userId",
          },
          json: {
            link_with: "email|userId2",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(linkUserResponse.status).toBe(201);

      // sanity check that we have linked the correct user!
      const linkedUser = await env.data.users.get("tenantId", "email|userId2");
      expect(linkedUser!.linked_to).toBe("email|userId");

      // ----------------------
      // now try and patch the linked user
      // ----------------------
      const params2 = {
        param: {
          user_id: "email|userId2",
        },
        json: {
          name: "new name",
        },
        header: {
          "tenant-id": "tenantId",
        },
      };

      const updateUserResponse = await managementClient.users[
        ":user_id"
      ].$patch(params2, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(updateUserResponse.status).toBe(404);
    });

    it("should return a 404 when trying to patch a non existent user", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const params2 = {
        param: {
          user_id: "email|i-do-not-exist",
        },
        json: {
          name: "new name",
        },
        header: {
          "tenant-id": "tenantId",
        },
      };

      const updateUserResponse = await managementClient.users[
        ":user_id"
      ].$patch(params2, {
        headers: {
          authorization: `Bearer ${token}`,
          "tenant-id": "tenantId",
          "content-type": "application/json",
        },
      });

      expect(updateUserResponse.status).toBe(404);
    });

    describe("updating secondary linked accounts via connection parameter", () => {
      it("should update a secondary linked account's phone number when connection is specified", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // Create primary user with password connection
        await env.data.users.create("tenantId", {
          user_id: "auth2|primary-user",
          email: "primary@example.com",
          email_verified: true,
          provider: "auth2",
          connection: "Username-Password-Authentication",
          is_social: false,
        });

        // Create secondary SMS user and link it to primary
        await env.data.users.create("tenantId", {
          user_id: "sms|secondary-user",
          phone_number: "+46701234567",
          email_verified: false,
          provider: "sms",
          connection: "sms",
          is_social: false,
          linked_to: "auth2|primary-user",
        });

        // Update the secondary account via primary user ID with connection parameter
        const updateResponse = await managementClient.users[":user_id"].$patch(
          {
            param: {
              user_id: "auth2|primary-user",
            },
            json: {
              phone_number: "+46709876543",
              connection: "sms",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(updateResponse.status).toBe(200);

        // Verify the secondary account was updated
        const secondaryUser = await env.data.users.get(
          "tenantId",
          "sms|secondary-user",
        );
        expect(secondaryUser?.phone_number).toBe("+46709876543");
      });

      it("should update app_metadata on a secondary linked account when connection is specified", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // Create primary user with email connection
        await env.data.users.create("tenantId", {
          user_id: "email|primary-user",
          email: "primary@example.com",
          email_verified: true,
          provider: "email",
          connection: "email",
          is_social: false,
        });

        // Create secondary user with password connection and link it
        await env.data.users.create("tenantId", {
          user_id: "auth2|secondary-user",
          email: "secondary@example.com",
          email_verified: false,
          provider: "auth2",
          connection: "Username-Password-Authentication",
          is_social: false,
          linked_to: "email|primary-user",
          app_metadata: { role: "user" },
        });

        // Update app_metadata on the secondary account
        const updateResponse = await managementClient.users[":user_id"].$patch(
          {
            param: {
              user_id: "email|primary-user",
            },
            json: {
              app_metadata: { role: "admin", department: "engineering" },
              connection: "Username-Password-Authentication",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(updateResponse.status).toBe(200);

        // Verify the secondary account's app_metadata was updated
        const secondaryUser = await env.data.users.get(
          "tenantId",
          "auth2|secondary-user",
        );
        expect(secondaryUser?.app_metadata).toEqual({
          role: "admin",
          department: "engineering",
        });
      });

      it("should update email_verified on a secondary linked account when connection is specified", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // Create primary user
        await env.data.users.create("tenantId", {
          user_id: "auth2|primary-user",
          email: "primary@example.com",
          email_verified: true,
          provider: "auth2",
          connection: "Username-Password-Authentication",
          is_social: false,
        });

        // Create secondary email user (unverified) and link it
        await env.data.users.create("tenantId", {
          user_id: "email|secondary-user",
          email: "secondary@example.com",
          email_verified: false,
          provider: "email",
          connection: "email",
          is_social: false,
          linked_to: "auth2|primary-user",
        });

        // Update email_verified on the secondary account
        const updateResponse = await managementClient.users[":user_id"].$patch(
          {
            param: {
              user_id: "auth2|primary-user",
            },
            json: {
              email_verified: true,
              connection: "email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(updateResponse.status).toBe(200);

        // Verify the secondary account's email_verified was updated
        const secondaryUser = await env.data.users.get(
          "tenantId",
          "email|secondary-user",
        );
        expect(secondaryUser?.email_verified).toBe(true);
      });

      it("should update password on a secondary linked account when connection is specified", async () => {
        // Note: Password updates on linked accounts are ONLY allowed for
        // Username-Password-Authentication connections. This is consistent
        // with Auth0's behavior - you cannot update passwords for other
        // connection types (like SMS, email OTP, social, etc.) on linked accounts.
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // Create primary user with email connection
        await env.data.users.create("tenantId", {
          user_id: "email|primary-user",
          email: "primary@example.com",
          email_verified: true,
          provider: "email",
          connection: "email",
          is_social: false,
        });

        // Create secondary user with password connection and link it
        await env.data.users.create("tenantId", {
          user_id: "auth2|secondary-user",
          email: "secondary@example.com",
          email_verified: true,
          provider: "auth2",
          connection: "Username-Password-Authentication",
          is_social: false,
          linked_to: "email|primary-user",
        });

        // Create initial password for secondary user
        await env.data.passwords.create("tenantId", {
          user_id: "auth2|secondary-user",
          password: await import("bcryptjs").then((bcrypt) =>
            bcrypt.hash("oldPassword123", 10),
          ),
          algorithm: "bcrypt",
        });

        // Update password on the secondary account
        const updateResponse = await managementClient.users[":user_id"].$patch(
          {
            param: {
              user_id: "email|primary-user",
            },
            json: {
              password: "newPassword456",
              connection: "Username-Password-Authentication",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(updateResponse.status).toBe(200);

        // Verify the password was updated
        const updatedPassword = await env.data.passwords.get(
          "tenantId",
          "auth2|secondary-user",
        );
        expect(updatedPassword).toBeDefined();

        // Verify the new password works
        const bcrypt = await import("bcryptjs");
        const isMatch = await bcrypt.compare(
          "newPassword456",
          updatedPassword!.password,
        );
        expect(isMatch).toBe(true);
      });

      it("should return 404 when trying to update non-existent connection on primary user", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // Create primary user with email connection only
        await env.data.users.create("tenantId", {
          user_id: "email|primary-user",
          email: "primary@example.com",
          email_verified: true,
          provider: "email",
          connection: "email",
          is_social: false,
        });

        // Try to update a connection that doesn't exist
        const updateResponse = await managementClient.users[":user_id"].$patch(
          {
            param: {
              user_id: "email|primary-user",
            },
            json: {
              phone_number: "+46701234567",
              connection: "sms",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(updateResponse.status).toBe(404);
      });

      it("should update primary user when connection matches primary user's connection", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();
        const managementClient = testClient(managementApp, env);

        // Create primary user with email connection
        await env.data.users.create("tenantId", {
          user_id: "email|primary-user",
          email: "primary@example.com",
          email_verified: false,
          provider: "email",
          connection: "email",
          is_social: false,
        });

        // Update primary user by specifying its own connection
        const updateResponse = await managementClient.users[":user_id"].$patch(
          {
            param: {
              user_id: "email|primary-user",
            },
            json: {
              email_verified: true,
              connection: "email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(updateResponse.status).toBe(200);

        // Verify the primary user was updated
        const primaryUser = await env.data.users.get(
          "tenantId",
          "email|primary-user",
        );
        expect(primaryUser?.email_verified).toBe(true);
      });
    });
  });

  describe("DELETE", () => {
    it("should unlink secondary account when deleting primary account", async () => {
      const token = await getAdminToken();
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId1",
            email: "test1@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId2",
            email: "test2@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      await managementClient.users[":user_id"].identities.$post(
        {
          param: {
            user_id: "email|userId2",
          },
          json: {
            link_with: "email|userId1",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // inspect the db directly because the GET endpoints don't return linked users
      const { users } = await env.data.users.list("tenantId");
      expect(users.length).toBe(3);

      // check we have linked user1 to user2
      const user1 = users.find((u: User) => u.user_id === "email|userId1");
      expect(user1?.linked_to).toBe("email|userId2");

      // --------------------------------------------------
      // now delete the primary account - newUser2
      // --------------------------------------------------

      await managementClient.users[":user_id"].$delete(
        {
          param: { user_id: "email|userId2" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // user2 is deleted, user1 is unlinked and becomes standalone (Auth0 behavior)
      const { users: usersNowDeleted } = await env.data.users.list("tenantId");

      expect(usersNowDeleted.length).toBe(2);

      // user1 should still exist and be unlinked
      const user1AfterDelete = usersNowDeleted.find(
        (u: User) => u.user_id === "email|userId1",
      );
      expect(user1AfterDelete).toBeDefined();
      expect(user1AfterDelete?.linked_to).toBeFalsy();
    });
  });
  // TODO - split these tests up into a new test suite one for each HTTP verb!
  it("should use email for name if not name is not passed", async () => {
    const token = await getAdminToken();
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const createUserResponse = await managementClient.users.$post(
      {
        json: {
          email: "foo@bar.com",
          connection: "email",
        },
        header: {
          "tenant-id": "tenantId",
        },
      },
      {
        headers: {
          authorization: `Bearer ${token}`,
        },
      },
    );

    expect(createUserResponse.status).toBe(201);

    const createdUser = await createUserResponse.json();

    expect(createdUser.name).toBe("foo@bar.com");
  });

  describe("GET", () => {
    // TO TEST
    // - should return CORS headers! Dan broke this on auth-admin. Check from a synthetic auth-admin request we get CORS headers back
    // - pagination! What I've done won't work of course unless we overfetch...
    it("should return an empty list of users for a tenant", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();
      const response = await managementClient.users.$get(
        {
          query: {},
          header: {
            "tenant-id": "otherTenant",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.length).toBe(0);
    });

    it("should return linked users as identities in primary user, and not in list of results", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId1",
            email: "foo1@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": "tenantId",
          },
        },
      );

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId2",
            email: "foo2@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": "tenantId",
          },
        },
      );

      const linkUserResponse = await managementClient.users[
        ":user_id"
      ].identities.$post(
        {
          param: {
            user_id: "email|userId1",
          },
          json: {
            link_with: "email|userId2",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(linkUserResponse.status).toBe(201);

      // Now we should only get one result from the get endpoint but with nested identities
      const response = await managementClient.users.$get(
        {
          query: {},
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(response.status).toBe(200);

      const body = await response.json();
      expect(body.length).toBe(2);
      if (!Array.isArray(body)) {
        throw new Error("Expected an array of users");
      }

      expect(body[1]?.identities).toEqual([
        {
          connection: "email",
          user_id: "userId1",
          provider: "email",
          isSocial: false,
        },
        {
          connection: "email",
          user_id: "userId2",
          provider: "email",
          isSocial: false,
          profileData: {
            email: "foo2@example.com",
            email_verified: false,
          },
        },
      ]);
    });

    it("should return a list of users with totals", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const token = await getAdminToken();

      // Now we should only get one result from the get endpoint but with nested identities
      const response = await managementClient.users.$get(
        {
          query: {
            include_totals: "true",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      if (response.status !== 200) {
        throw new Error(await response.text());
      }

      expect(response.status).toBe(200);

      const body = await response.json();

      if (!("users" in body)) {
        throw new Error("Expected an users property");
      }

      expect(body.users.length).toBe(1);
      expect(body.start).toBe(0);
      expect(body.limit).toBe(10);
      expect(body.length).toBe(1);
    });
  });

  describe("search for user", () => {
    it("should search for a user with wildcard search on email", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: "test@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);

      const usersResponse = await managementClient.users.$get(
        {
          query: {
            per_page: "2",
            q: "test",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(usersResponse.status).toBe(200);

      const body = await usersResponse.json();
      expect(body.length).toBe(2);
    });

    it("should be able to search on linked user's email address using profile data query", async () => {
      const token = await getAdminToken();
      const { managementApp, env } = await getTestServer();

      const managementClient = testClient(managementApp, env);

      // -----------------
      // user fixtures
      // -----------------

      // create new password user
      env.data.users.create("tenantId", {
        user_id: "auth2|base-user",
        email: "base-user@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });
      // create new code user WITH DIFFERENT EMAIL ADDRESS and link this to the password user
      env.data.users.create("tenantId", {
        user_id: "auth2|code-user",
        email: "code-user@example.com",
        email_verified: true,
        provider: "email",
        connection: "email",
        is_social: false,
        linked_to: "auth2|base-user",
      });

      // sanity check - get base user and check identities
      const baseUserRes = await managementClient.users[":user_id"].$get(
        {
          param: {
            user_id: "auth2|base-user",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );
      expect(baseUserRes.status).toBe(200);
      const baseUser = await baseUserRes.json();
      expect(baseUser.identities).toEqual([
        {
          connection: "Username-Password-Authentication",
          isSocial: false,
          provider: "auth2",
          user_id: "base-user",
        },
        {
          connection: "email",
          isSocial: false,
          profileData: {
            email: "code-user@example.com",
            email_verified: true,
          },
          provider: "email",
          user_id: "code-user",
        },
      ]);

      // ------------------
      // Now query using profile data
      // ------------------
      const usersResponse = await managementClient.users.$get(
        {
          query: {
            per_page: "2",
            q: "identities.profileData.email=code-user@example.com",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );
      expect(usersResponse.status).toBe(200);
      const body = await usersResponse.json();
      expect(body.length).toBe(1);
      if (!Array.isArray(body)) {
        throw new Error("Expected an array of users");
      }

      // assert that we get the primary user back
      expect(body[0]?.identities).toEqual([
        {
          connection: "Username-Password-Authentication",
          isSocial: false,
          provider: "auth2",
          user_id: "base-user",
        },
        {
          connection: "email",
          isSocial: false,
          profileData: {
            email: "code-user@example.com",
            email_verified: true,
          },
          provider: "email",
          user_id: "code-user",
        },
      ]);
    });
    describe("lucene queries", () => {
      /*
       
       we need to be careful that we're not returning all the users here, and because we only have one user, we get false positives...
       probably worth adding several test users, with similarish emails...
       and we want to make sure we're seraching for the field we specify...

      */
      it("should search for a user by email when lucene query uses colon as separator", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();

        const managementClient = testClient(managementApp, env);

        const createUserResponse = await managementClient.users.$post(
          {
            json: {
              email: "test@example.com",
              connection: "email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );
        expect(createUserResponse.status).toBe(201);
        const usersResponse = await managementClient.users.$get(
          {
            query: {
              per_page: "2",
              q: "email:test@example.com",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );
        expect(usersResponse.status).toBe(200);
        const body = await usersResponse.json();
        if (!Array.isArray(body)) {
          throw new Error("Expected an array of users");
        }
        expect(body.length).toBe(1);
        expect(body[0]?.email).toBe("test@example.com");
      });

      it("should search for a user by email when lucene query uses equal char as separator", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();

        const managementClient = testClient(managementApp, env);

        const createUserResponse = await managementClient.users.$post(
          {
            json: {
              email: "test@example.com",
              connection: "email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );
        expect(createUserResponse.status).toBe(201);
        const usersResponse = await managementClient.users.$get(
          {
            query: {
              per_page: "2",
              q: "email=test@example.com",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(usersResponse.status).toBe(200);
        const body = await usersResponse.json();
        if (!Array.isArray(body)) {
          throw new Error("Expected an array of users");
        }
        expect(body.length).toBe(1);
        expect(body[0]?.email).toBe("test@example.com");
      });

      it("should search for a user by email and provider when lucene query uses equal char as separator", async () => {
        const token = await getAdminToken();
        const { managementApp, env } = await getTestServer();

        const managementClient = testClient(managementApp, env);

        const usersResponse = await managementClient.users.$get(
          {
            query: {
              per_page: "2",
              q: "provider=email",
            },
            header: {
              "tenant-id": "tenantId",
            },
          },
          {
            headers: {
              authorization: `Bearer ${token}`,
            },
          },
        );

        expect(usersResponse.status).toBe(200);
        const body = await usersResponse.json();
        expect(body.length).toBe(1);
        if (!Array.isArray(body)) {
          throw new Error("Expected an array of users");
        }
        expect(body[0]?.email).toBe("foo@example.com");
        expect(body[0]?.provider).toBe("email");
      });
    });
    // TO TEST - linked accounts!
    // especially when the primary and secondary accounts have different email addresses!
    // we need to check what auth0 does
  });

  describe("link user", () => {
    it("should link two users using link_to parameter", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();

      const managementClient = testClient(managementApp, env);

      await env.data.users.create("tenantId", {
        user_id: "auth2|userId1",
        email: "foo1@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      await env.data.users.create("tenantId", {
        user_id: "auth2|userId2",
        email: "foo2@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      const linkUserResponse = await managementClient.users[
        ":user_id"
      ].identities.$post(
        {
          param: {
            user_id: "auth2|userId2",
          },
          json: {
            link_with: "auth2|userId1",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(linkUserResponse.status).toBe(201);

      // Fetch all users
      const listUsersResponse = await managementClient.users.$get(
        {
          query: {},
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(listUsersResponse.status).toBe(200);

      const usersList = await listUsersResponse.json();
      if (!Array.isArray(usersList)) {
        throw new Error("Expected an array of users");
      }
      expect(usersList.length).toBe(2);
      const newUser = usersList.find(
        (u: User) => u.user_id === "auth2|userId2",
      );
      expect(newUser).toBeDefined();
      expect(newUser?.identities).toEqual([
        {
          connection: "Username-Password-Authentication",
          user_id: "userId2",
          provider: "auth2",
          isSocial: false,
        },
        {
          connection: "Username-Password-Authentication",
          user_id: "userId1",
          provider: "auth2",
          isSocial: false,
          profileData: {
            email: "foo1@example.com",
            email_verified: true,
          },
        },
      ]);

      // and now unlink!
      const unlinkUserResponse = await managementClient.users[
        ":user_id"
      ].identities[":provider"][":linked_user_id"].$delete(
        {
          param: {
            user_id: "auth2|userId2",
            provider: "auth2",
            linked_user_id: "userId1",
          },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(unlinkUserResponse.status).toBe(200);
      const unlinkUserBody = (await unlinkUserResponse.json()) as User[];
      if (!Array.isArray(unlinkUserBody)) {
        throw new Error("Expected an array of users");
      }
      expect(unlinkUserBody[0]?.user_id).toBe("auth2|userId2");

      // manually check in the db that the linked_to field has been reset
      const user1Updated = await env.data.users.get(
        "tenantId",
        "auth2|userId1",
      );
      expect(user1Updated!.linked_to).toBeUndefined();

      // now fetch user 2 again to check doesn't have user2 as identity
      const userResponse2 = await managementClient.users[":user_id"].$get(
        {
          param: { user_id: "auth2|userId2" },
          header: { "tenant-id": "tenantId" },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(userResponse2.status).toBe(200);
      const user2 = await userResponse2.json();

      expect(user2.identities).toEqual([
        {
          connection: "Username-Password-Authentication",
          user_id: "userId2",
          provider: "auth2",
          isSocial: false,
        },
      ]);
      // this shows we have unlinked
      expect(user2.identities?.length).toBe(1);
    });

    it("should link two users using user_id and provider parameter", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      await env.data.users.create("tenantId", {
        user_id: "auth2|userId1",
        email: "foo1@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      await env.data.users.create("tenantId", {
        user_id: "auth2|userId2",
        email: "foo2@example.com",
        email_verified: true,
        provider: "auth2",
        connection: "Username-Password-Authentication",
        is_social: false,
      });

      const linkUserResponse = await managementClient.users[
        ":user_id"
      ].identities.$post(
        {
          param: { user_id: "auth2|userId2" },
          json: {
            provider: "auth2",
            user_id: "auth2|userId1",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(linkUserResponse.status).toBe(201);

      // Fetch a single users
      const userResponse = await managementClient.users[":user_id"].$get(
        {
          param: {
            // note we fetch with the user_id prefixed with provider as per the Auth0 standard
            user_id: "auth2|userId2",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(userResponse.status).toBe(200);

      const body = await userResponse.json();
      expect(body.user_id).toBe("auth2|userId2");
      expect(body.identities).toEqual([
        {
          connection: "Username-Password-Authentication",
          user_id: "userId2",
          provider: "auth2",
          isSocial: false,
        },
        {
          connection: "Username-Password-Authentication",
          user_id: "userId1",
          provider: "auth2",
          isSocial: false,
          profileData: {
            email: "foo1@example.com",
            email_verified: true,
          },
        },
      ]);
    });
  });

  describe("get by id", () => {
    it("should return primary user with secondary user nested in identities, but should not return linked secondary user (should act as though the secondary user does not exist)", async () => {
      const token = await getAdminToken();

      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId1",
            email: "foo1@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      await managementClient.users.$post(
        {
          json: {
            user_id: "userId2",
            email: "foo2@example.com",
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // link the accounts
      const params = {
        param: {
          user_id: "email|userId1",
        },
        json: {
          link_with: "email|userId2",
        },
        header: {
          "tenant-id": "tenantId",
        },
      };
      const linkUserResponse = await managementClient.users[
        ":user_id"
      ].identities.$post(params, {
        headers: {
          authorization: `Bearer ${token}`,
        },
      });

      expect(linkUserResponse.status).toBe(201);

      // now pull the primary account down
      const userResponse = await managementClient.users[":user_id"].$get(
        {
          param: {
            user_id: "email|userId1",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(userResponse.status).toBe(200);

      const user = await userResponse.json();

      expect(user.email).toBe("foo1@example.com");
      expect(user.identities).toEqual([
        {
          connection: "email",
          user_id: "userId1",
          provider: "email",
          isSocial: false,
        },
        {
          connection: "email",
          user_id: "userId2",
          provider: "email",
          isSocial: false,
          profileData: {
            email: "foo2@example.com",
            email_verified: false,
          },
        },
      ]);

      // try getting the secondary user
      const secondaryUserResponse = await managementClient.users[
        ":user_id"
      ].$get(
        {
          param: {
            user_id: "email|userId2",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      // auth0 does not return linked accounts
      expect(secondaryUserResponse.status).toBe(404);
    });
  });

  describe("User Permissions Management", () => {
    let userId: string;
    let token: string;
    let managementClient: any;
    let uniqueResourceServer: string;

    beforeEach(async () => {
      const { managementApp, env } = await getTestServer();
      managementClient = testClient(managementApp, env);
      token = await getAdminToken();
      uniqueResourceServer = `https://api-${Date.now()}.example.com`;

      // Create a test user
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: `test-permissions-${Date.now()}@example.com`,
            connection: "email",
            provider: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);
      const newUser = await createUserResponse.json();
      userId = newUser.user_id;
    });

    it("should handle user permissions CRUD operations", async () => {
      // --------------------------------------------
      // GET user permissions (initially empty)
      // --------------------------------------------
      const getPermissionsResponse = await managementClient.users[
        ":user_id"
      ].permissions.$get(
        {
          param: {
            user_id: userId,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(getPermissionsResponse.status).toBe(200);
      const initialPermissions = await getPermissionsResponse.json();
      expect(Array.isArray(initialPermissions)).toBe(true);
      expect(initialPermissions.length).toBe(0);

      // --------------------------------------------
      // ADD permissions to user
      // --------------------------------------------
      const addPermissionsResponse = await managementClient.users[
        ":user_id"
      ].permissions.$post(
        {
          param: {
            user_id: userId,
          },
          json: {
            permissions: [
              {
                permission_name: "read:profile",
                resource_server_identifier: uniqueResourceServer,
              },
              {
                permission_name: "write:profile",
                resource_server_identifier: uniqueResourceServer,
              },
            ],
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(addPermissionsResponse.status).toBe(201);
      const addResult = await addPermissionsResponse.json();
      expect(addResult.message).toBe("Permissions assigned successfully");

      // --------------------------------------------
      // GET user permissions (should now have 2)
      // --------------------------------------------
      const getPermissionsAfterAddResponse = await managementClient.users[
        ":user_id"
      ].permissions.$get(
        {
          param: {
            user_id: userId,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(getPermissionsAfterAddResponse.status).toBe(200);
      const permissionsAfterAdd = await getPermissionsAfterAddResponse.json();
      expect(Array.isArray(permissionsAfterAdd)).toBe(true);
      expect(permissionsAfterAdd.length).toBe(2);

      // Verify the permissions have the correct structure
      const readPermission = permissionsAfterAdd.find(
        (p: any) =>
          p.permission_name === "read:profile" &&
          p.resource_server_identifier === uniqueResourceServer,
      );
      const writePermission = permissionsAfterAdd.find(
        (p: any) =>
          p.permission_name === "write:profile" &&
          p.resource_server_identifier === uniqueResourceServer,
      );

      expect(readPermission).toBeDefined();
      expect(writePermission).toBeDefined();
      expect(readPermission.resource_server_identifier).toBe(
        uniqueResourceServer,
      );
      expect(writePermission.resource_server_identifier).toBe(
        uniqueResourceServer,
      );

      // --------------------------------------------
      // REMOVE one permission from user
      // --------------------------------------------
      const removePermissionsResponse = await managementClient.users[
        ":user_id"
      ].permissions.$delete(
        {
          param: {
            user_id: userId,
          },
          json: {
            permissions: [
              {
                permission_name: "write:profile",
                resource_server_identifier: uniqueResourceServer,
              },
            ],
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(removePermissionsResponse.status).toBe(200);
      const removeResult = await removePermissionsResponse.json();
      expect(removeResult.message).toBe("Permissions removed successfully");

      // --------------------------------------------
      // GET user permissions (should now have 1)
      // --------------------------------------------
      const getPermissionsAfterRemoveResponse = await managementClient.users[
        ":user_id"
      ].permissions.$get(
        {
          param: {
            user_id: userId,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(getPermissionsAfterRemoveResponse.status).toBe(200);
      const permissionsAfterRemove =
        await getPermissionsAfterRemoveResponse.json();
      expect(Array.isArray(permissionsAfterRemove)).toBe(true);
      expect(permissionsAfterRemove.length).toBe(1);
      expect(permissionsAfterRemove[0].permission_name).toBe("read:profile");
      expect(permissionsAfterRemove[0].resource_server_identifier).toBe(
        uniqueResourceServer,
      );
    });

    it("should return 404 for non-existent user", async () => {
      const nonExistentUserId = "email|non-existent-user";

      // Try to get permissions for non-existent user
      const getPermissionsResponse = await managementClient.users[
        ":user_id"
      ].permissions.$get(
        {
          param: {
            user_id: nonExistentUserId,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(getPermissionsResponse.status).toBe(404);

      // Try to assign permissions to non-existent user
      const addPermissionsResponse = await managementClient.users[
        ":user_id"
      ].permissions.$post(
        {
          param: {
            user_id: nonExistentUserId,
          },
          json: {
            permissions: [
              {
                permission_name: "read:test",
                resource_server_identifier: uniqueResourceServer,
              },
            ],
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(addPermissionsResponse.status).toBe(404);
    });
  });

  describe("User linking and login", () => {
    it("should create a password user with same email, link it to primary user, and validate login with password", async () => {
      const token = await getAdminToken();
      const { managementApp, oauthApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const oauthClient = testClient(oauthApp, env);

      const testEmail = "linktest@example.com";
      const testPassword = "TestPassword123!";

      // Step 1: Create the primary user (passwordless email user)
      const createPrimaryUserResponse = await managementClient.users.$post(
        {
          json: {
            email: testEmail,
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createPrimaryUserResponse.status).toBe(201);
      const primaryUser = await createPrimaryUserResponse.json();
      expect(primaryUser.user_id).toMatch(/^email\|[a-zA-Z0-9]+$/);
      expect(primaryUser.email).toBe(testEmail);

      // Step 2: Create a password user with the SAME email using the management API
      // Note: Different providers allow same email (email| vs auth2|)
      // We intentionally do NOT set email_verified:true to avoid automatic linking
      const createPasswordUserResponse = await managementClient.users.$post(
        {
          json: {
            email: testEmail,
            provider: "auth2",
            connection: "Username-Password-Authentication",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createPasswordUserResponse.status).toBe(201);
      const passwordUser = await createPasswordUserResponse.json();
      expect(passwordUser.user_id).toMatch(/^auth2\|/);
      expect(passwordUser.email).toBe(testEmail);

      // Step 3: Set the password for the password user via PATCH
      const setPasswordResponse = await managementClient.users[
        ":user_id"
      ].$patch(
        {
          param: {
            user_id: passwordUser.user_id,
          },
          json: {
            password: testPassword,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(setPasswordResponse.status).toBe(200);

      // Step 4: Link the password user to the primary user using the management API
      const linkResponse = await managementClient.users[
        ":user_id"
      ].identities.$post(
        {
          param: {
            user_id: primaryUser.user_id,
          },
          json: {
            link_with: passwordUser.user_id,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(linkResponse.status).toBe(201);
      const identities = await linkResponse.json();
      expect(identities).toHaveLength(2);

      // Verify the link was created correctly
      const linkedPasswordUser = await env.data.users.get(
        "tenantId",
        passwordUser.user_id,
      );
      expect(linkedPasswordUser!.linked_to).toBe(primaryUser.user_id);

      // Step 5: Verify the primary user has both identities
      const getPrimaryUserResponse = await managementClient.users[
        ":user_id"
      ].$get(
        {
          param: {
            user_id: primaryUser.user_id,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(getPrimaryUserResponse.status).toBe(200);
      const updatedPrimaryUser = await getPrimaryUserResponse.json();
      expect(updatedPrimaryUser.identities).toHaveLength(2);
      expect(updatedPrimaryUser.identities).toContainEqual(
        expect.objectContaining({
          provider: "email",
          connection: "email",
        }),
      );
      expect(updatedPrimaryUser.identities).toContainEqual(
        expect.objectContaining({
          provider: "auth2",
          connection: "Username-Password-Authentication",
        }),
      );

      // Step 6: Test login with the email and password
      const loginResponse = await oauthClient.co.authenticate.$post({
        json: {
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          username: testEmail,
          password: testPassword,
          realm: "Username-Password-Authentication",
          client_id: "clientId",
        },
      });

      expect(loginResponse.status).toBe(200);
      const loginResult = (await loginResponse.json()) as {
        login_ticket: string;
      };
      expect(loginResult.login_ticket).toBeDefined();

      // Step 7: Verify the login resolved to the primary user
      // The login should have resolved to the primary user (not the password user)
      // since they are linked
      const { logs } = await env.data.logs.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: true,
      });

      const successLog = logs.find((log) => log.type === "s");
      expect(successLog).toBeDefined();
      // The log should show the primary user
      expect(successLog!.user_id).toBe(primaryUser.user_id);
      // But it should log the database connection that was actually used
      expect(successLog!.connection).toBe("Username-Password-Authentication");
    });

    it("should create a password user without password, then set password later", async () => {
      const token = await getAdminToken();
      const { managementApp, oauthApp, env } = await getTestServer();

      const managementClient = testClient(managementApp, env);
      const oauthClient = testClient(oauthApp, env);

      const testEmail = "nopassword@example.com";
      const testPassword = "SecurePassword123!";

      // Step 1: Create an auth2 user WITHOUT a password
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: testEmail,
            provider: "auth2",
            connection: "Username-Password-Authentication",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);
      const user = await createUserResponse.json();
      expect(user.user_id).toMatch(/^auth2\|/);
      expect(user.email).toBe(testEmail);

      // Verify no password exists yet
      const passwordRecord = await env.data.passwords.get(
        "tenantId",
        user.user_id,
      );
      expect(passwordRecord).toBeNull();

      // Step 2: Set password via PATCH
      const setPasswordResponse = await managementClient.users[
        ":user_id"
      ].$patch(
        {
          param: {
            user_id: user.user_id,
          },
          json: {
            password: testPassword,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(setPasswordResponse.status).toBe(200);

      // Verify password was created
      const updatedPasswordRecord = await env.data.passwords.get(
        "tenantId",
        user.user_id,
      );
      expect(updatedPasswordRecord).toBeDefined();
      expect(updatedPasswordRecord!.password).toBeDefined();

      // Step 3: Test login with the password
      const loginResponse = await oauthClient.co.authenticate.$post({
        json: {
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          username: testEmail,
          password: testPassword,
          realm: "Username-Password-Authentication",
          client_id: "clientId",
        },
      });

      expect(loginResponse.status).toBe(200);
      const loginResult = (await loginResponse.json()) as {
        login_ticket: string;
      };
      expect(loginResult.login_ticket).toBeDefined();

      // Verify the login log
      const { logs } = await env.data.logs.list("tenantId", {
        page: 0,
        per_page: 10,
        include_totals: true,
      });

      const successLog = logs.find((log) => log.type === "s");
      expect(successLog).toBeDefined();
      expect(successLog!.user_id).toBe(user.user_id);
      expect(successLog!.connection).toBe("Username-Password-Authentication");
    });

    it("should update an existing password when setting password twice", async () => {
      const token = await getAdminToken();
      const { managementApp, oauthApp, env } = await getTestServer();

      const managementClient = testClient(managementApp, env);
      const oauthClient = testClient(oauthApp, env);

      const testEmail = "updatepassword@example.com";
      const firstPassword = "FirstPassword123!";
      const secondPassword = "SecondPassword456!";

      // Step 1: Create an auth2 user with initial password
      const createUserResponse = await managementClient.users.$post(
        {
          json: {
            email: testEmail,
            provider: "auth2",
            connection: "Username-Password-Authentication",
            password: firstPassword,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createUserResponse.status).toBe(201);
      const user = await createUserResponse.json();
      expect(user.user_id).toMatch(/^auth2\|/);

      // Verify password was created
      const initialPasswordRecord = await env.data.passwords.get(
        "tenantId",
        user.user_id,
      );
      expect(initialPasswordRecord).toBeDefined();
      const initialPasswordHash = initialPasswordRecord!.password;

      // Step 2: Test login with first password
      const firstLoginResponse = await oauthClient.co.authenticate.$post({
        json: {
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          username: testEmail,
          password: firstPassword,
          realm: "Username-Password-Authentication",
          client_id: "clientId",
        },
      });

      expect(firstLoginResponse.status).toBe(200);

      // Step 3: Update password via PATCH
      const updatePasswordResponse = await managementClient.users[
        ":user_id"
      ].$patch(
        {
          param: {
            user_id: user.user_id,
          },
          json: {
            password: secondPassword,
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(updatePasswordResponse.status).toBe(200);

      // Verify password was updated (hash should be different)
      const updatedPasswordRecord = await env.data.passwords.get(
        "tenantId",
        user.user_id,
      );
      expect(updatedPasswordRecord).toBeDefined();
      expect(updatedPasswordRecord!.password).not.toBe(initialPasswordHash);

      // Step 4: Test that old password no longer works
      const oldPasswordLoginResponse = await oauthClient.co.authenticate.$post({
        json: {
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          username: testEmail,
          password: firstPassword,
          realm: "Username-Password-Authentication",
          client_id: "clientId",
        },
      });

      expect(oldPasswordLoginResponse.status).toBe(403);

      // Step 5: Test login with new password works
      const newPasswordLoginResponse = await oauthClient.co.authenticate.$post({
        json: {
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          username: testEmail,
          password: secondPassword,
          realm: "Username-Password-Authentication",
          client_id: "clientId",
        },
      });

      expect(newPasswordLoginResponse.status).toBe(200);
      const loginResult = (await newPasswordLoginResponse.json()) as {
        login_ticket: string;
      };
      expect(loginResult.login_ticket).toBeDefined();
    });

    it("should create password user with same verified email and password, auto-link it, and store password on correct user", async () => {
      const token = await getAdminToken();
      const { managementApp, oauthApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const oauthClient = testClient(oauthApp, env);

      const testEmail = "autolink@example.com";
      const testPassword = "AutoLinkPassword123!";

      // Step 1: Create the primary user (passwordless email user) with verified email
      const createPrimaryUserResponse = await managementClient.users.$post(
        {
          json: {
            email: testEmail,
            email_verified: true,
            connection: "email",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createPrimaryUserResponse.status).toBe(201);
      const primaryUser = await createPrimaryUserResponse.json();
      expect(primaryUser.user_id).toMatch(/^email\|/);
      expect(primaryUser.email).toBe(testEmail);

      // Step 2: Create a password user with the SAME verified email AND password
      // This should trigger automatic account linking via linkUsersHook
      const createPasswordUserResponse = await managementClient.users.$post(
        {
          json: {
            email: testEmail,
            email_verified: true, // This should trigger automatic linking
            password: testPassword,
            provider: "auth2",
            connection: "Username-Password-Authentication",
          },
          header: {
            "tenant-id": "tenantId",
          },
        },
        {
          headers: {
            authorization: `Bearer ${token}`,
          },
        },
      );

      expect(createPasswordUserResponse.status).toBe(201);
      const passwordUser = await createPasswordUserResponse.json();

      // The response should be the PRIMARY user since linking occurred
      expect(passwordUser.user_id).toBe(primaryUser.user_id);
      expect(passwordUser.identities).toHaveLength(2);

      // Find the secondary user that was created
      const allUsers = await env.data.users.list("tenantId", {
        page: 0,
        per_page: 100,
        include_totals: false,
      });
      const secondaryUser = allUsers.users.find(
        (u) =>
          u.connection === "Username-Password-Authentication" &&
          u.email === testEmail,
      );

      expect(secondaryUser).toBeDefined();
      expect(secondaryUser!.linked_to).toBe(primaryUser.user_id);

      // Step 3: Verify the password was stored on the SECONDARY user, not the primary
      const passwordOnPrimary = await env.data.passwords.get(
        "tenantId",
        primaryUser.user_id,
      );
      expect(passwordOnPrimary).toBeNull(); // Password should NOT be on primary user

      const passwordOnSecondary = await env.data.passwords.get(
        "tenantId",
        secondaryUser!.user_id,
      );
      expect(passwordOnSecondary).toBeDefined(); // Password SHOULD be on secondary user
      expect(passwordOnSecondary!.user_id).toBe(secondaryUser!.user_id);

      // Step 4: Test login with the email and password should work
      const loginResponse = await oauthClient.co.authenticate.$post({
        json: {
          credential_type: "http://auth0.com/oauth/grant-type/password-realm",
          username: testEmail,
          password: testPassword,
          realm: "Username-Password-Authentication",
          client_id: "clientId",
        },
      });

      expect(loginResponse.status).toBe(200);
      const loginResult = (await loginResponse.json()) as {
        login_ticket: string;
      };
      expect(loginResult.login_ticket).toBeDefined();
    });
  });
});
