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
  isStaged,
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

describe("staged keys", () => {
  const inAWeek = () =>
    new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const anHourAgo = () => new Date(Date.now() - 60 * 60 * 1000).toISOString();

  it("treats a future current_since as staged", () => {
    expect(isStaged(makeKey({ current_since: inAWeek() }))).toBe(true);
    expect(isStaged(makeKey({ current_since: anHourAgo() }))).toBe(false);
    expect(isStaged(makeKey({}))).toBe(false);
  });

  it("keeps signing with the live key while a newer key is staged", async () => {
    // The rotation a SAML service provider needs: the new certificate is
    // published for the operator to hand over, but the outgoing key keeps
    // signing until the service provider has had time to trust the new one.
    const live = makeKey({
      kid: "live",
      pkcs7: "PRIVATE",
      current_since: anHourAgo(),
    });
    const staged = makeKey({
      kid: "staged",
      pkcs7: "PRIVATE",
      current_since: inAWeek(),
    });
    const keys = makeKeysAdapter([staged, live]);

    const signing = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
      type: "saml_encryption",
    });
    expect(signing.map((k) => k.kid)).toEqual(["live"]);

    // ...but both are published, so the service provider can pre-trust it.
    const published = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "publish",
      type: "saml_encryption",
    });
    expect(published.map((k) => k.kid).sort()).toEqual(["live", "staged"]);
  });

  it("signs with a staged key once its activation time passes", async () => {
    const live = makeKey({
      kid: "live",
      pkcs7: "PRIVATE",
      current_since: new Date(Date.now() - 2000).toISOString(),
    });
    const activated = makeKey({
      kid: "activated",
      pkcs7: "PRIVATE",
      current_since: new Date(Date.now() - 1000).toISOString(),
    });
    const keys = makeKeysAdapter([live, activated]);

    const signing = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
    });
    expect(signing.map((k) => k.kid)).toEqual(["activated"]);
  });

  it("ensureSigningKey mints a key when the only candidate is staged", async () => {
    const created: SigningKey[] = [];
    const staged = makeKey({
      kid: "staged",
      pkcs7: "PRIVATE",
      current_since: inAWeek(),
    });
    const adapter = makeKeysAdapter([staged]);
    const keys: KeysAdapter = {
      ...adapter,
      create: async (key) => {
        created.push(key);
      },
    };

    const result = await ensureSigningKey(keys, { name: "test" });
    expect(result.created).toBe(true);
    expect(created).toHaveLength(1);
  });
});

describe("saml_encryption keys are always tenant-scoped", () => {
  const samlKey = (overrides: Partial<SigningKey>) =>
    makeKey({ type: "saml_encryption", pkcs7: "PRIVATE", ...overrides });

  it("prefers the tenant's own certificate even in control-plane mode", async () => {
    const shared = samlKey({ kid: "shared" });
    const own = samlKey({ kid: "own", tenant_id: "t1" });
    const keys = makeKeysAdapter([shared, own]);

    const signing = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
      type: "saml_encryption",
    });
    expect(signing.map((k) => k.kid)).toEqual(["own"]);
  });

  it("falls back to the shared certificate when the tenant has none", async () => {
    // The state every existing deployment is in: one unscoped SAML key.
    const shared = samlKey({ kid: "shared" });
    const keys = makeKeysAdapter([shared]);

    const signing = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
      type: "saml_encryption",
    });
    expect(signing.map((k) => k.kid)).toEqual(["shared"]);
  });

  it("publishes the tenant's certificate alongside the shared one", async () => {
    const keys = makeKeysAdapter([
      samlKey({ kid: "shared" }),
      samlKey({ kid: "own", tenant_id: "t1" }),
    ]);

    const published = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "publish",
      type: "saml_encryption",
    });
    expect(published.map((k) => k.kid).sort()).toEqual(["own", "shared"]);
  });

  it("leaves jwt_signing resolution on the configured mode", async () => {
    // A tenant-scoped JWT key must stay invisible in control-plane mode.
    const keys = makeKeysAdapter([
      makeKey({ kid: "cp", pkcs7: "PRIVATE" }),
      makeKey({ kid: "t1-own", tenant_id: "t1", pkcs7: "PRIVATE" }),
    ]);

    const signing = await resolveSigningKeys(keys, "t1", "control-plane", {
      purpose: "sign",
    });
    expect(signing.map((k) => k.kid)).toEqual(["cp"]);
  });
});
