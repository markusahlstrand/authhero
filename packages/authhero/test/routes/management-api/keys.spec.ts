import { describe, it, expect } from "vitest";
import { testClient } from "hono/testing";
import { getAdminToken } from "../../helpers/token";
import { getTestServer } from "../../helpers/test-server";
import exp from "constants";

describe("keys", () => {
  it("should rotate a key", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();
    const rotateResponse =
      await managementClient.api.v2.keys.signing.rotate.$post(
        {
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
    expect(rotateResponse.status).toBe(201);

    // Get a list of the keys. There should be 2 keys, one revoked and one active
    const keysResponse = await managementClient.api.v2.keys.signing.$get(
      {
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
    expect(keysResponse.status).toBe(200);
    const keys = await keysResponse.json();
    expect(keys).toHaveLength(2);
  });

  it("should reovke a key", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Get a list of the keys.
    const keysResponse = await managementClient.api.v2.keys.signing.$get(
      {
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
    expect(keysResponse.status).toBe(200);
    const keys = await keysResponse.json();
    expect(keys).toHaveLength(1);

    const kid = keys[0].kid;
    expect(kid).toBeTypeOf("string");

    const rovokeResponse = await managementClient.api.v2.keys.signing[
      kid
    ].revoke.$put(
      {
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
    expect(rovokeResponse.status).toBe(200);

    // Get a list of the keys. There should be a new key instead of the revoked one
    const newKeysResponse = await managementClient.api.v2.keys.signing.$get(
      {
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
    expect(newKeysResponse.status).toBe(200);

    const emptyKeys = await newKeysResponse.json();
    expect(emptyKeys).toHaveLength(1);
    expect(emptyKeys[0].kid).not.toBe(kid);
  });

  it("should get a key by kid", async () => {
    const { managementApp, env } = await getTestServer();
    const managementClient = testClient(managementApp, env);

    const token = await getAdminToken();

    // Get a list of the keys.
    const keysResponse = await managementClient.api.v2.keys.signing.$get(
      {
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
    expect(keysResponse.status).toBe(200);
    const keys = await keysResponse.json();
    expect(keys).toHaveLength(1);

    const kid = keys[0].kid;
    expect(kid).toBeTypeOf("string");

    // Get a key by kid.
    const keyResponse = await managementClient.api.v2.keys.signing[kid].$get(
      {
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

    expect(keyResponse.status).toBe(200);
    const key = await keyResponse.json();
    expect(key.kid).toBe(kid);
  });
});
