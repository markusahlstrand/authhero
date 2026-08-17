import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer, TestServer } from "../../helpers/test-server";
import { getUsersByEmail } from "../../../src/helpers/users";

type ManagementClient = ReturnType<
  typeof testClient<TestServer["managementApp"]>
>;

/**
 * The management PATCH email-uniqueness check is scoped per connection, the way
 * Auth0 scopes it: only a row competing for the same login identifier blocks the
 * change. An `sms` identity is keyed by `phone_number` and a social identity by
 * its provider sub, so their `email` is profile data and can never shadow an
 * email login — and cluster-mates are the same person, not "another user".
 *
 * Regression for a production 409: patching the email of a database-connection
 * primary to the address carried by its own linked `sms` identity. See
 * findEmailConflict (helpers/users.ts).
 *
 * The seeded `email|userId` (foo@example.com, provider/connection "email") is the
 * primary under test; other rows are created through the raw adapter to bypass
 * the linking hooks.
 */
describe("management PATCH email uniqueness scoping", () => {
  const tenantId = "tenantId";
  const primaryId = "email|userId";
  const newEmail = "taken@example.com";

  function patchPrimary(
    managementClient: ManagementClient,
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

  it("allows an email owned by a LINKED sms identity of the same user", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create(tenantId, {
      user_id: "sms|linked-secondary",
      email: newEmail,
      email_verified: false,
      phone_number: "+46700000001",
      provider: "sms",
      connection: "sms",
      is_social: false,
      linked_to: primaryId,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
      email_verified: true,
    });
    expect(res.status).toBe(200);

    const updated = await env.data.users.get(tenantId, primaryId);
    expect(updated!.email).toBe(newEmail);

    // The sms identity keeps its own phone identifier and is not rewritten.
    const sms = await env.data.users.get(tenantId, "sms|linked-secondary");
    expect(sms!.phone_number).toBe("+46700000001");
  });

  it("allows an email owned by an UNRELATED sms user (no linking involved)", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create(tenantId, {
      user_id: "sms|unrelated",
      email: newEmail,
      email_verified: false,
      phone_number: "+46700000002",
      provider: "sms",
      connection: "sms",
      is_social: false,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
    });
    expect(res.status).toBe(200);
  });

  it("allows an email owned by an unrelated social user", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create(tenantId, {
      user_id: "google-oauth2|unrelated",
      email: newEmail,
      email_verified: true,
      provider: "google-oauth2",
      connection: "google-oauth2",
      is_social: true,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
    });
    expect(res.status).toBe(200);
  });

  it("allows an email already moved onto a cluster-mate on another provider", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // Same connection as the target would be a conflict across clusters, but
    // this row is the same person — and a different provider, so the
    // (tenant_id, provider, email) unique index permits both rows.
    await env.data.users.create(tenantId, {
      user_id: "auth2|linked-secondary",
      email: newEmail,
      email_verified: true,
      provider: "auth2",
      connection: "email",
      is_social: false,
      linked_to: primaryId,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
    });
    expect(res.status).toBe(200);
  });

  /**
   * A cluster-mate on the SAME provider still 409s: the
   * (tenant_id, provider, email) unique index cannot hold two such rows, so the
   * update would fail in the driver. 409 beats a constraint-violation 500.
   */
  it("rejects an email held by a cluster-mate on the same provider", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create(tenantId, {
      user_id: "email|linked-secondary",
      email: newEmail,
      email_verified: true,
      provider: "email",
      connection: "email",
      is_social: false,
      linked_to: primaryId,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
    });
    expect(res.status).toBe(409);
  });

  it("still rejects an email owned by an unrelated same-connection user", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    await env.data.users.create(tenantId, {
      user_id: "email|unrelated",
      email: newEmail,
      email_verified: true,
      provider: "email",
      connection: "email",
      is_social: false,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
    });
    expect(res.status).toBe(409);

    const unchanged = await env.data.users.get(tenantId, primaryId);
    expect(unchanged!.email).toBe("foo@example.com");
  });

  /**
   * The conflict lookup must read every page, not the single ten-row page
   * `getUsersByEmail` returns: the predicate *filters* candidates, so allowed
   * cross-connection rows can crowd the one row that genuinely conflicts out of
   * a truncated result set and let a duplicate through. Ten fillers on distinct
   * providers (the `(tenant_id, provider, email)` unique index forbids reusing
   * one) fill the first page.
   *
   * Row order within a page is storage-defined, so the test asserts its own
   * premise — that the conflicting row really is beyond page one — rather than
   * assuming it. If a future adapter orders differently the premise fails
   * loudly instead of the test passing vacuously.
   */
  it("finds a same-connection conflict beyond the first page of candidates", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    for (let i = 0; i < 10; i++) {
      const filler = `aa0${i}`;
      await env.data.users.create(tenantId, {
        user_id: `${filler}|filler`,
        email: newEmail,
        email_verified: true,
        provider: filler,
        connection: filler,
        is_social: true,
      });
    }

    // Same connection as the target, different provider — a genuine conflict
    // that only full pagination surfaces.
    await env.data.users.create(tenantId, {
      user_id: "zzz|unrelated",
      email: newEmail,
      email_verified: true,
      provider: "zzz",
      connection: "email",
      is_social: false,
    });

    const firstPage = await getUsersByEmail(env.data.users, tenantId, newEmail);
    expect(firstPage).toHaveLength(10);
    expect(firstPage.some((u) => u.user_id === "zzz|unrelated")).toBe(false);

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
    });
    expect(res.status).toBe(409);

    const unchanged = await env.data.users.get(tenantId, primaryId);
    expect(unchanged!.email).toBe("foo@example.com");
  });

  it("still rejects a same-connection conflict when `connection` targets a linked identity", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);
    const token = await getAdminToken();

    // The patched identity is the linked password row, not the primary.
    await env.data.users.create(tenantId, {
      user_id: "auth2|pw-secondary",
      email: "foo@example.com",
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
      linked_to: primaryId,
    });
    await env.data.users.create(tenantId, {
      user_id: "auth2|unrelated",
      email: newEmail,
      email_verified: true,
      provider: "auth2",
      connection: "Username-Password-Authentication",
      is_social: false,
    });

    const res = await patchPrimary(managementClient, token, {
      email: newEmail,
      connection: "Username-Password-Authentication",
    });
    expect(res.status).toBe(409);
  });
});
