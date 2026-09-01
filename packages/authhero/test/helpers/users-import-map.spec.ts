import { describe, it, expect } from "vitest";
import bcryptjs from "bcryptjs";
import {
  buildUserId,
  entryIdentityKeys,
  IMPORT_ERROR_CODES,
  mapEntry,
  mapPassword,
  redactEntry,
  toStagedPayload,
} from "../../src/helpers/users-import/map";
import { userImportEntrySchema } from "../../src/types/auth0/UserImport";

const HASH = bcryptjs.hashSync("password123", 10);

function parse(entry: Record<string, unknown>) {
  return userImportEntrySchema.parse(entry);
}

describe("mapPassword", () => {
  it("accepts every bcrypt variant bcryptjs can compare", () => {
    for (const prefix of ["$2a$", "$2b$", "$2y$"]) {
      const hash = `${prefix}${HASH.slice(4)}`;
      const result = mapPassword(
        parse({ email: "a@b.com", password_hash: hash }),
      );
      expect(result.ok).toBe(true);
    }
  });

  it("rejects bcrypt variants bcryptjs cannot compare", () => {
    for (const prefix of ["$2$", "$2x$"]) {
      const result = mapPassword(
        parse({ email: "a@b.com", password_hash: `${prefix}abcdef` }),
      );
      expect(result.ok).toBe(false);
    }
  });

  it("reports a precise error for algorithms AuthHero cannot verify", () => {
    const result = mapPassword(
      parse({
        email: "a@b.com",
        custom_password_hash: {
          algorithm: "pbkdf2",
          hash: { value: "$pbkdf2-sha256$i=1000$c2FsdA$aGFzaA" },
        },
      }),
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe(
      IMPORT_ERROR_CODES.UNSUPPORTED_HASH_ALGORITHM,
    );
    expect(result.error.path).toBe("custom_password_hash.algorithm");
  });

  it("rejects a bcrypt hash in a non-utf8 encoding", () => {
    const result = mapPassword(
      parse({
        email: "a@b.com",
        custom_password_hash: {
          algorithm: "bcrypt",
          hash: { value: HASH, encoding: "base64" },
        },
      }),
    );
    expect(result.ok).toBe(false);
  });

  it("treats a missing credential as valid", () => {
    const result = mapPassword(parse({ email: "a@b.com" }));
    expect(result).toEqual({ ok: true, value: undefined });
  });
});

describe("buildUserId", () => {
  it("prefixes a bare id with the provider", () => {
    expect(buildUserId("abc", "auth0")).toBe("auth0|abc");
  });

  it("does not double-prefix an already-qualified id", () => {
    expect(buildUserId("auth0|abc", "auth0")).toBe("auth0|abc");
  });

  it("honours a tenant pinned to the legacy provider", () => {
    expect(buildUserId("abc", "auth2")).toBe("auth2|abc");
  });

  it("generates an id when the entry has none", () => {
    const id = buildUserId(undefined, "auth0");
    expect(id).toMatch(/^auth0\|[0-9a-f]{24}$/);
  });
});

describe("mapEntry", () => {
  it("drops app_metadata keys Auth0 forbids", () => {
    const result = mapEntry({
      entry: parse({
        email: "a@b.com",
        app_metadata: { plan: "pro", user_id: "spoofed", email: "evil@b.com" },
      }),
      connection: "Username-Password-Authentication",
      provider: "auth0",
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.user.app_metadata).toEqual({ plan: "pro" });
    expect(result.value.user.email).toBe("a@b.com");
  });

  it("is pure, so a retried chunk maps identically", () => {
    const entry = parse({ email: "a@b.com", user_id: "fixed", name: "N" });
    const params = {
      entry,
      connection: "Username-Password-Authentication",
      provider: "auth0",
    };
    expect(mapEntry(params)).toEqual(mapEntry(params));
  });
});

describe("redaction", () => {
  it("keeps the credential when staging the work item", () => {
    const staged = toStagedPayload({ email: "a@b.com", password_hash: HASH });
    // The staged row is what the job later imports, so it must retain the hash.
    expect(staged.password_hash).toBe(HASH);
  });

  it("removes the credential when the row is read back out", () => {
    const redacted = redactEntry({ email: "a@b.com", password_hash: HASH });
    expect(redacted.password_hash).toBe("[redacted]");
    expect(JSON.stringify(redacted)).not.toContain(HASH);
  });

  it("redacts the structured hash and its salt", () => {
    const redacted = redactEntry({
      email: "a@b.com",
      custom_password_hash: {
        algorithm: "bcrypt",
        hash: { value: HASH },
        salt: { value: "s3cr3t" },
      },
    });
    expect(JSON.stringify(redacted)).not.toContain(HASH);
    expect(JSON.stringify(redacted)).not.toContain("s3cr3t");
  });
});

describe("entryIdentityKeys", () => {
  it("matches Auth0's dedupe identifiers", () => {
    const keys = entryIdentityKeys(
      parse({
        email: "A@B.com",
        user_id: "u1",
        username: "Bob",
        phone_number: "+15551234567",
      }),
    );

    // Case-insensitive on email/username so a file cannot smuggle a duplicate
    // past the check by changing case.
    expect(keys).toContain("email:a@b.com");
    expect(keys).toContain("user_id:u1");
    expect(keys).toContain("username:bob");
    expect(keys).toContain("phone:+15551234567");
  });
});
