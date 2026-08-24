import { describe, it, expect } from "vitest";
import { getAdminToken } from "../helpers/token";
import { getTestServer } from "../helpers/test-server";
import { USERNAME_PASSWORD_PROVIDER } from "../../src/constants";
import { Strategy, Identity } from "@authhero/adapter-interfaces";

const TENANT = "tenantId";

/**
 * Account-linking contract for `POST /api/v2/users/{user_id}/identities`,
 * asserted purely through the management API (issue #1250).
 *
 * These are deliberately endpoint-level. AuthHero's internal representation of
 * a linked cluster — secondaries as real rows carrying `linked_to` — is an
 * implementation detail that Auth0 does not share: Auth0 folds a secondary into
 * the primary's `identities[]` and the secondary stops existing as a user. So
 * `linked_to` is free to change shape (a repointing chokepoint, a `cluster_id`
 * column, anything) while the observable contract below must not:
 *
 *   1. every identity in a cluster is reachable from its primary's
 *      `identities[]`, and
 *   2. a secondary is not addressable as a user.
 *
 * Auth0's own docs don't specify the nested-link cases, because in Auth0's
 * model they're unrepresentable. That makes (1) the load-bearing assertion:
 * whatever we do internally, an identity must never fall out of the API.
 */
describe("management-api account linking", () => {
  async function setup() {
    const { managementApp, env } = await getTestServer();
    const token = await getAdminToken();

    const request = (path: string, init: RequestInit = {}) =>
      managementApp.request(
        path,
        {
          ...init,
          headers: {
            authorization: `Bearer ${token}`,
            "tenant-id": TENANT,
            "content-type": "application/json",
            ...((init.headers as Record<string, string>) ?? {}),
          },
        },
        env,
      );

    /** `POST /users/{primaryId}/identities { link_with: secondaryId }` */
    const link = (primaryId: string, secondaryId: string) =>
      request(`/users/${encodeURIComponent(primaryId)}/identities`, {
        method: "POST",
        body: JSON.stringify({ link_with: secondaryId }),
      });

    const getUser = (userId: string, prefer?: string) =>
      request(`/users/${encodeURIComponent(userId)}`, {
        headers: prefer ? { prefer } : {},
      });

    /**
     * Seed a user straight through the raw adapter, bypassing the hook
     * decorators, so these tests exercise *explicit* linking only and never
     * trip the built-in email-based auto-linking. Emails are derived from the
     * user_id and therefore always distinct.
     */
    const createUser = async (userId: string) => {
      const provider = userId.split("|")[0]!;
      await env.data.users.create(TENANT, {
        user_id: userId,
        email: `${userId.replace("|", "-")}@example.com`,
        email_verified: true,
        provider,
        connection:
          provider === USERNAME_PASSWORD_PROVIDER
            ? Strategy.USERNAME_PASSWORD
            : provider,
        is_social: provider === "google-oauth2",
      });
      return userId;
    };

    return { env, request, link, getUser, createUser };
  }

  /**
   * `identities[]` carries the bare id plus the provider (`pickIdentity` runs
   * `userIdParse`), so rebuild the full `provider|id` for comparison.
   */
  const identityIds = (identities: Identity[]) =>
    identities.map((i) => `${i.provider}|${i.user_id}`).sort();

  const PRIMARY = `${USERNAME_PASSWORD_PROVIDER}|link-primary`;
  const SECONDARY = "google-oauth2|link-secondary";
  const GRANDCHILD = "sms|link-grandchild";

  it("links two standalone users and reports both identities", async () => {
    const { link, getUser, createUser } = await setup();
    await createUser(PRIMARY);
    await createUser(SECONDARY);

    const res = await link(PRIMARY, SECONDARY);
    expect(res.status).toBe(201);
    expect(identityIds(await res.json())).toEqual([PRIMARY, SECONDARY].sort());

    // The same cluster is visible on a subsequent read.
    const primary = await getUser(PRIMARY);
    expect(primary.status).toBe(200);
    expect(identityIds((await primary.json()).identities)).toEqual(
      [PRIMARY, SECONDARY].sort(),
    );

    // A secondary is not addressable as a user (Auth0 has no such user).
    expect((await getUser(SECONDARY)).status).toBe(404);
    expect((await getUser(SECONDARY, "include-linked")).status).toBe(200);
  });

  it("links via Auth0's provider + bare user_id body", async () => {
    const { request, getUser, createUser } = await setup();
    await createUser(PRIMARY);
    await createUser(SECONDARY);

    // Auth0 takes the secondary's id *without* its provider prefix here, the
    // same shape `identities[]` reports it in.
    const [provider, bareId] = SECONDARY.split("|");
    const res = await request(
      `/users/${encodeURIComponent(PRIMARY)}/identities`,
      {
        method: "POST",
        body: JSON.stringify({ provider, user_id: bareId }),
      },
    );
    expect(res.status).toBe(201);
    expect(identityIds(await res.json())).toEqual([PRIMARY, SECONDARY].sort());

    const primary = await getUser(PRIMARY);
    expect(identityIds((await primary.json()).identities)).toEqual(
      [PRIMARY, SECONDARY].sort(),
    );
  });

  it("links an enterprise identity whose bare user_id contains pipes", async () => {
    const { request, getUser, createUser } = await setup();
    const enterprise = "samlp|okta-connection|jane";
    await createUser(PRIMARY);
    await createUser(enterprise);

    // `samlp|okta-connection|jane` splits into provider `samlp` and bare id
    // `okta-connection|jane` — the pipe inside the bare id must not be read as
    // an already-prefixed identifier.
    const res = await request(
      `/users/${encodeURIComponent(PRIMARY)}/identities`,
      {
        method: "POST",
        body: JSON.stringify({
          provider: "samlp",
          user_id: "okta-connection|jane",
        }),
      },
    );
    expect(res.status).toBe(201);

    const primary = await getUser(PRIMARY);
    expect(identityIds((await primary.json()).identities)).toEqual(
      [PRIMARY, enterprise].sort(),
    );
  });

  it("accepts a user_id that already carries its provider prefix", async () => {
    const { request, getUser, createUser } = await setup();
    await createUser(PRIMARY);
    await createUser(SECONDARY);

    const res = await request(
      `/users/${encodeURIComponent(PRIMARY)}/identities`,
      {
        method: "POST",
        body: JSON.stringify({ provider: "google-oauth2", user_id: SECONDARY }),
      },
    );
    expect(res.status).toBe(201);

    const primary = await getUser(PRIMARY);
    expect(identityIds((await primary.json()).identities)).toEqual(
      [PRIMARY, SECONDARY].sort(),
    );
  });

  it("carries a linked user's own identities onto the new primary", async () => {
    const { link, getUser, createUser } = await setup();
    await createUser(PRIMARY);
    await createUser(SECONDARY);
    await createUser(GRANDCHILD);

    // SECONDARY starts out as a primary in its own right, with one identity
    // linked to it.
    expect((await link(SECONDARY, GRANDCHILD)).status).toBe(201);

    // Now link SECONDARY — and therefore everything under it — into PRIMARY.
    // In Auth0 this is one call moving a whole `identities[]` array across.
    const res = await link(PRIMARY, SECONDARY);
    expect(res.status).toBe(201);
    expect(identityIds(await res.json())).toEqual(
      [PRIMARY, SECONDARY, GRANDCHILD].sort(),
    );

    const primary = await getUser(PRIMARY);
    expect(identityIds((await primary.json()).identities)).toEqual(
      [PRIMARY, SECONDARY, GRANDCHILD].sort(),
    );
  });

  it("never drops an identity out of the API after a nested link", async () => {
    const { request, link, createUser } = await setup();
    await createUser(PRIMARY);
    await createUser(SECONDARY);
    await createUser(GRANDCHILD);

    await link(SECONDARY, GRANDCHILD);
    await link(PRIMARY, SECONDARY);

    // Walk the whole tenant the way an API consumer would: list the primaries,
    // union their identities. Every user in the cluster must show up. An
    // identity stranded behind a demoted primary is invisible here — it is
    // filtered out of the list (it has a `linked_to`) and it is absent from
    // any primary's `identities[]`, so it can never be found again.
    const res = await request("/users");
    expect(res.status).toBe(200);
    const primaries = await res.json();

    const reachable = primaries.flatMap((u: { identities?: Identity[] }) =>
      identityIds(u.identities ?? []),
    );
    // arrayContaining, not toEqual: the seeded tenant carries fixture users
    // of its own, and this asserts that nothing was *lost*.
    expect(reachable).toEqual(
      expect.arrayContaining([PRIMARY, SECONDARY, GRANDCHILD]),
    );
  });

  it("rejects linking into a user that is itself a linked identity", async () => {
    const { link, createUser } = await setup();
    await createUser(PRIMARY);
    await createUser(SECONDARY);
    await createUser(GRANDCHILD);

    await link(PRIMARY, SECONDARY);

    // SECONDARY is no longer a user — `GET` and `PATCH` both 404 on it, and
    // this endpoint has to agree rather than silently building a second hop.
    const res = await link(SECONDARY, GRANDCHILD);
    expect(res.status).toBe(404);
  });

  it("rejects self-links and unknown secondaries", async () => {
    const { link, createUser } = await setup();
    await createUser(PRIMARY);

    expect((await link(PRIMARY, PRIMARY)).status).toBe(400);
    expect((await link(PRIMARY, "google-oauth2|nope")).status).toBe(400);
  });
});
