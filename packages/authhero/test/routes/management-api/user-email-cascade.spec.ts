import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import { getUserByProvider } from "../../../src/helpers/users";

/**
 * Regression suite for issue #1 (Invariants 2 & 3): changing the email of one
 * email-identified identity in a linked cluster must propagate to the other
 * email-identified identities, so a linked password account isn't orphaned on
 * its old address, and the whole cluster shares one verification state. sms and
 * social identifiers are never rewritten.
 *
 * The seeded `email|userId` (foo@example.com, provider "email", verified) is the
 * cluster primary; we attach secondaries via the raw adapter (bypassing hooks)
 * and drive the change through the management PATCH.
 */
describe("management PATCH email cascade across linked identities", () => {
  const tenantId = "tenantId";
  const primaryId = "email|userId";

  async function seedCluster(env: any) {
    // Linked username-password identity — email IS its login identifier.
    await env.data.users.create(tenantId, {
      user_id: "auth2|pw-secondary",
      email: "foo@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
      login_count: 0,
      linked_to: primaryId,
    });
    // Linked sms identity — phone_number is its identifier; email is incidental.
    await env.data.users.create(tenantId, {
      user_id: "sms|sms-secondary",
      phone_number: "+46700000001",
      provider: "sms",
      connection: "sms",
      is_social: false,
      login_count: 0,
      linked_to: primaryId,
    });
    // Linked social identity — provider sub is the identifier; email is synced
    // from the IdP on each login, so a cascade must not rewrite it.
    await env.data.users.create(tenantId, {
      user_id: "google-oauth2|social-secondary",
      email: "foo@example.com",
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
      login_count: 0,
      linked_to: primaryId,
    });
  }

  function patchPrimaryEmail(
    managementClient: any,
    token: string,
    json: Record<string, unknown>,
  ) {
    return managementClient.users[":user_id"].$patch(
      {
        param: { user_id: primaryId },
        json,
        header: { "tenant-id": tenantId },
      },
      { headers: { authorization: `Bearer ${token}` } },
    );
  }

  it("propagates a primary email change to a linked password identity", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    await seedCluster(env);

    const res = await patchPrimaryEmail(managementClient, token, {
      email: "new@example.com",
    });
    expect(res.status).toBe(200);

    const primary = await env.data.users.get(tenantId, primaryId);
    const pw = await env.data.users.get(tenantId, "auth2|pw-secondary");
    expect(primary!.email).toBe("new@example.com");
    // The linked password identity now carries the new address...
    expect(pw!.email).toBe("new@example.com");
    // ...and stays verified in lock-step with the primary (was verified).
    expect(pw!.email_verified).toBe(true);

    // The precise mechanism that fixes login: the password row is now findable
    // by (new email, auth2), so getUserByProvider resolves it.
    const found = await getUserByProvider({
      userAdapter: env.data.users,
      tenant_id: tenantId,
      username: "new@example.com",
      provider: "auth2",
    });
    expect(found?.user_id).toBe("auth2|pw-secondary");
  });

  it("never rewrites an sms identity's phone or a social identity's email", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    await seedCluster(env);

    const res = await patchPrimaryEmail(managementClient, token, {
      email: "new@example.com",
    });
    expect(res.status).toBe(200);

    const sms = await env.data.users.get(tenantId, "sms|sms-secondary");
    const social = await env.data.users.get(
      tenantId,
      "google-oauth2|social-secondary",
    );
    // sms identifier untouched (and the cascade didn't stamp the new email
    // onto it).
    expect(sms!.phone_number).toBe("+46700000001");
    expect(sms!.email).not.toBe("new@example.com");
    // social email is IdP-owned — not rewritten by the cascade.
    expect(social!.email).toBe("foo@example.com");
  });

  it("cascades a verification reset to email-identified identities", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    await seedCluster(env);

    // Admin changes the email AND marks it unverified (self-service-style
    // re-verification): the flag moves in lock-step across the cluster.
    const res = await patchPrimaryEmail(managementClient, token, {
      email: "new@example.com",
      email_verified: false,
    });
    expect(res.status).toBe(200);

    const primary = await env.data.users.get(tenantId, primaryId);
    const pw = await env.data.users.get(tenantId, "auth2|pw-secondary");
    expect(primary!.email_verified).toBe(false);
    expect(pw!.email).toBe("new@example.com");
    expect(pw!.email_verified).toBe(false);
  });

  it("still rejects changing to an email owned by an unrelated user (409)", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();
    await seedCluster(env);

    // A separate, unlinked primary owns this address.
    await env.data.users.create(tenantId, {
      user_id: "email|other-cluster",
      email: "taken@example.com",
      email_verified: true,
      provider: "email",
      connection: "email",
      is_social: false,
      login_count: 0,
    });

    const res = await patchPrimaryEmail(managementClient, token, {
      email: "taken@example.com",
    });
    expect(res.status).toBe(409);
  });

  // Issue #2: the management PATCH must be pass-through — omitting
  // email_verified / metadata must not silently mutate them. (Regression for
  // the zod `.default()` leaking through `.partial()`.)
  describe("pass-through of omitted fields (issue #2)", () => {
    it("does not flip email_verified when the field is omitted", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      // Seeded primary is verified. Change only the email.
      const res = await patchPrimaryEmail(managementClient, token, {
        email: "renamed@example.com",
      });
      expect(res.status).toBe(200);

      const primary = await env.data.users.get(tenantId, primaryId);
      expect(primary!.email).toBe("renamed@example.com");
      expect(primary!.email_verified).toBe(true);
    });

    it("does not wipe metadata when it is omitted", async () => {
      const { managementApp, env } = await getTestServer();
      const managementClient = testClient(managementApp, env);
      const token = await getAdminToken();

      await env.data.users.update(tenantId, primaryId, {
        user_metadata: { favourite_colour: "green" },
        app_metadata: { plan: "pro" },
      });

      const res = await patchPrimaryEmail(managementClient, token, {
        name: "New Name",
      } as Record<string, unknown>);
      expect(res.status).toBe(200);

      const primary = await env.data.users.get(tenantId, primaryId);
      expect(primary!.name).toBe("New Name");
      expect(primary!.user_metadata).toEqual({ favourite_colour: "green" });
      expect(primary!.app_metadata).toEqual({ plan: "pro" });
    });
  });
});
