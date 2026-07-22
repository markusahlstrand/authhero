import { describe, it, expect } from "vitest";
import {
  KeysAdapter,
  ListKeysResponse,
  SigningKey,
} from "@authhero/adapter-interfaces";
import {
  resolveSigningKeys,
  resolveSigningKeyMode,
  ensureSigningKey,
} from "../../src/helpers/signing-keys";

function makeKey(overrides: Partial<SigningKey>): SigningKey {
  return {
    kid: overrides.kid ?? "kid",
    cert: overrides.cert ?? "cert",
    fingerprint: overrides.fingerprint ?? "fp",
    thumbprint: overrides.thumbprint ?? "tp",
    type: overrides.type ?? "jwt_signing",
    ...overrides,
  };
}

// Minimal KeysAdapter that filters in-memory by the lucene-ish q parts the
// helper actually emits: `type:jwt_signing AND tenant_id:X` and
// `type:jwt_signing AND -_exists_:tenant_id`.
function makeKeysAdapter(rows: SigningKey[]): KeysAdapter {
  return {
    create: async () => {},
    update: async () => true,
    list: async (params) => {
      const q = params?.q ?? "";
      const want = (() => {
        if (q.includes("-_exists_:tenant_id")) return "control-plane" as const;
        const m = q.match(/tenant_id:([^\s]+)/);
        return m ? ({ kind: "tenant", id: m[1] } as const) : null;
      })();
      const filtered = rows.filter((row) => {
        if (!want) return true;
        if (want === "control-plane") return !row.tenant_id;
        return row.tenant_id === want.id;
      });
      const response: ListKeysResponse = {
        signingKeys: filtered,
        start: 0,
        limit: filtered.length,
        length: filtered.length,
      };
      return response;
    },
  };
}

describe("resolveSigningKeyMode", () => {
  it("defaults to control-plane when no option is given", async () => {
    expect(await resolveSigningKeyMode(undefined, "t1")).toBe("control-plane");
  });

  it("returns the static value as-is", async () => {
    expect(await resolveSigningKeyMode("tenant", "t1")).toBe("tenant");
  });

  it("invokes the resolver with tenant_id", async () => {
    const seen: string[] = [];
    const result = await resolveSigningKeyMode(({ tenant_id }) => {
      seen.push(tenant_id);
      return tenant_id === "t1" ? "tenant" : "control-plane";
    }, "t1");
    expect(result).toBe("tenant");
    expect(seen).toEqual(["t1"]);
  });
});

describe("resolveSigningKeys (sign purpose)", () => {
  // Sign candidates must carry private material (pkcs7).
  const cpKey = makeKey({ kid: "cp", pkcs7: "PRIVATE" });
  const t1Key = makeKey({ kid: "t1", tenant_id: "t1", pkcs7: "PRIVATE" });

  it("returns the control-plane key in control-plane mode", async () => {
    const keys = makeKeysAdapter([cpKey, t1Key]);
    const result = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
    });
    expect(result.map((k) => k.kid)).toEqual(["cp"]);
  });

  it("prefers the tenant key in tenant mode", async () => {
    const keys = makeKeysAdapter([cpKey, t1Key]);
    const result = await resolveSigningKeys(keys, "t1", "tenant", {
      purpose: "sign",
    });
    expect(result.map((k) => k.kid)).toEqual(["t1"]);
  });

  it("falls back to control-plane when the tenant has no key", async () => {
    const keys = makeKeysAdapter([cpKey]);
    const result = await resolveSigningKeys(keys, "t1", "tenant", {
      purpose: "sign",
    });
    expect(result.map((k) => k.kid)).toEqual(["cp"]);
  });

  it("skips revoked tenant keys when picking", async () => {
    const revoked = makeKey({
      kid: "t1-old",
      tenant_id: "t1",
      revoked_at: new Date(Date.now() - 1000).toISOString(),
    });
    const keys = makeKeysAdapter([cpKey, revoked]);
    const result = await resolveSigningKeys(keys, "t1", "tenant", {
      purpose: "sign",
    });
    expect(result.map((k) => k.kid)).toEqual(["cp"]);
  });

  it("returns nothing when no keys exist anywhere", async () => {
    const keys = makeKeysAdapter([]);
    const result = await resolveSigningKeys(keys, "t1", "tenant", {
      purpose: "sign",
    });
    expect(result).toEqual([]);
  });

  it("skips a newer public-only key and signs with the signable one (control-plane)", async () => {
    // Models a WFP tenant after a control-plane key rotation re-sync: a fresh
    // public-only verify key (no pkcs7) sorts ahead of the tenant's own private
    // key, but must not be chosen for signing (#1181).
    const newerPublic = makeKey({
      kid: "cp-public",
      current_since: new Date().toISOString(),
    });
    const olderSignable = makeKey({
      kid: "cp-priv",
      pkcs7: "PRIVATE",
      current_since: new Date(Date.now() - 1000).toISOString(),
    });
    const keys = makeKeysAdapter([newerPublic, olderSignable]);
    const result = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
    });
    expect(result.map((k) => k.kid)).toEqual(["cp-priv"]);
  });

  it("returns nothing when only public verify keys exist (unsignable)", async () => {
    const keys = makeKeysAdapter([makeKey({ kid: "cp-public" })]);
    const result = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
    });
    expect(result).toEqual([]);
  });
});

describe("resolveSigningKeys (publish purpose)", () => {
  const cpKey = makeKey({ kid: "cp" });
  const t1Key = makeKey({ kid: "t1", tenant_id: "t1" });
  const t2Key = makeKey({ kid: "t2", tenant_id: "t2" });

  it("returns only control-plane keys in control-plane mode", async () => {
    const keys = makeKeysAdapter([cpKey, t1Key, t2Key]);
    const result = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "publish",
    });
    expect(result.map((k) => k.kid)).toEqual(["cp"]);
  });

  it("returns tenant ∪ control-plane in tenant mode", async () => {
    const keys = makeKeysAdapter([cpKey, t1Key, t2Key]);
    const result = await resolveSigningKeys(keys, "t1", "tenant", {
      purpose: "publish",
    });
    expect(result.map((k) => k.kid).sort()).toEqual(["cp", "t1"]);
  });

  it("falls back gracefully when tenant has no key (publish = control-plane only)", async () => {
    const keys = makeKeysAdapter([cpKey]);
    const result = await resolveSigningKeys(keys, "t1", "tenant", {
      purpose: "publish",
    });
    expect(result.map((k) => k.kid)).toEqual(["cp"]);
  });
});

// Stateful variant of makeKeysAdapter whose create() actually persists, so we
// can assert the mint + the create-if-missing idempotency.
function makeStatefulKeysAdapter(initial: SigningKey[] = []): {
  adapter: KeysAdapter;
  rows: SigningKey[];
} {
  const rows: SigningKey[] = [...initial];
  const base = makeKeysAdapter(rows);
  const adapter: KeysAdapter = {
    ...base,
    create: async (key) => {
      rows.push(key);
    },
  };
  return { adapter, rows };
}

describe("ensureSigningKey", () => {
  it("mints a control-plane RS256 key when the scope is empty", async () => {
    const { adapter, rows } = makeStatefulKeysAdapter([]);
    const result = await ensureSigningKey(adapter);
    expect(result.created).toBe(true);
    expect(result.key.pkcs7).toBeTruthy();
    expect(result.key.cert).toBeTruthy();
    expect(result.key.type).toBe("jwt_signing");
    expect(result.key.tenant_id).toBeUndefined();
    expect(rows).toHaveLength(1);
  });

  it("mints even when only public (unsignable) verify keys exist", async () => {
    // Projected control-plane keys have their pkcs7 stripped, so they are not
    // signable — this is the exact WFP provisioning gap in #1181.
    const publicOnly = makeKey({ kid: "cp-public" });
    expect(publicOnly.pkcs7).toBeUndefined();
    const { adapter, rows } = makeStatefulKeysAdapter([publicOnly]);
    const result = await ensureSigningKey(adapter);
    expect(result.created).toBe(true);
    expect(rows).toHaveLength(2);
    expect(rows.some((k) => k.pkcs7)).toBe(true);
  });

  it("is a no-op when a signable key already exists (idempotent)", async () => {
    const signable = makeKey({ kid: "cp-priv", pkcs7: "PRIVATE" });
    const { adapter, rows } = makeStatefulKeysAdapter([signable]);
    const result = await ensureSigningKey(adapter);
    expect(result.created).toBe(false);
    expect(result.key.kid).toBe("cp-priv");
    expect(rows).toHaveLength(1);
  });

  it("stamps tenant_id when a tenantId is given", async () => {
    const { adapter, rows } = makeStatefulKeysAdapter([]);
    const result = await ensureSigningKey(adapter, { tenantId: "t1" });
    expect(result.created).toBe(true);
    expect(result.key.tenant_id).toBe("t1");
    expect(rows.some((k) => k.tenant_id === "t1" && k.pkcs7)).toBe(true);
  });

  it("does not treat a tenant's own key as satisfying the control-plane scope", async () => {
    const tenantSignable = makeKey({
      kid: "t1-priv",
      tenant_id: "t1",
      pkcs7: "PRIVATE",
    });
    const { adapter, rows } = makeStatefulKeysAdapter([tenantSignable]);
    const result = await ensureSigningKey(adapter);
    expect(result.created).toBe(true); // control-plane scope was empty
    expect(rows).toHaveLength(2);
  });
});
