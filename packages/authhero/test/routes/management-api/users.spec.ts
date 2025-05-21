import { describe, it, expect } from "vitest";
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

      const createSecondaryUserResponse = await managementClient.users.$post(
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
  });

  describe("DELETE", () => {
    it("should delete secondary account if delete primary account", async () => {
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

      // user1 and user2 are deleted - cascading delete in SQL works (at least in SQLite)
      const { users: usersNowDeleted } = await env.data.users.list("tenantId");

      expect(usersNowDeleted.length).toBe(1);
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
      const { managementApp, oauthApp, env } = await getTestServer();
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
      const { managementApp, oauthApp, env } = await getTestServer();

      const client = testClient(oauthApp, env);
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
        const { managementApp, oauthApp, env } = await getTestServer();

        const client = testClient(oauthApp, env);
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
      expect(usersList[1]?.user_id).toBe("auth2|userId2");
      expect(usersList[1]?.identities).toEqual([
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
      const unlinkUserBody = await unlinkUserResponse.json();
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
});
